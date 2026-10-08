# Secure Notes API (Backend)

REST API for a note-taking platform with JWT authentication and role-based access control.

**Stack:** Node.js 20+, Express 5, MongoDB + Mongoose 8, JWT (`jsonwebtoken`, HS256), `bcryptjs` (cost 12), `zod` validation, `helmet`, `express-rate-limit`.

- Live API: `https://care-api.tahmid-hasan-rafi.com/api` (health: `/api/health`) · Live site: `https://care.tahmid-hasan-rafi.com`
- Frontend repository: `https://github.com/TahmidHasanRafi/careguide-notes-frontend`
- Try every endpoint: open `requests.http` in VS Code (REST Client extension) and run the blocks top to bottom.

---

## 1. Run locally

Requires Node.js 20+ and MongoDB 5.0+ (the project uses MongoDB Atlas).

All settings live in **`config.js`** — database name, port, CORS origins and the first admin account.
The two secrets, `MONGODB_URI` and `JWT_SECRET`, are **not** committed: set them as environment variables
(or paste them into `config.js` on your own machine). There is no `.env` file. Any value can be overridden by a real
environment variable of the same name. On Vercel, production mode and `TRUST_PROXY=1` switch on automatically.

```bash
npm install
npm run seed:demo           # admin + demo staff + 5 demo users with notes & posts
npm run reset-passwords     # reset demo passwords (or: npm run reset-passwords -- <email> <new-password>)
npm run dev                 # http://localhost:5050 (also serves the frontend if it is next to this folder)
npm run indexes             # sync + print the indexes that exist in the DB
npm run explain             # prove every query/aggregation uses an index
npm run test:permissions    # 55 end-to-end checks of roles, staff permissions, on/off and IP whitelist
```

With Atlas, this computer's IP must be allowed in Atlas → Security → Network Access.

**Frontend on the same URL:** when the frontend folder sits next to this one (`frontend/` or
`careguide-notes-frontend/`), the API serves it at `http://localhost:5050` and points it at `/api`
on the same origin. Set `SERVE_FRONTEND: false` in `config.js` when the frontend is deployed separately.

`mongodb/indexes-and-aggregations.mongodb.js` is a MongoDB for VS Code playground that shows the
indexes, both aggregation results and which index each query uses.

## 2. Roles & permissions

| Capability | user | staff | admin |
|---|:-:|:-:|:-:|
| Create / update / delete / list **own** notes, write posts, interest groups | ✔ | – | ✔ |
| See the user list (`users.view`) | – | if granted | ✔ |
| Add users (`users.create`) — staff can only add role `user` | – | if granted | ✔ |
| Edit users (`users.update`) — staff can only edit role `user` | – | if granted | ✔ |
| Remove users (`users.delete`) — staff can only remove role `user` | – | if granted | ✔ |
| Read everyone's notes (`notes.view_all`) | – | if granted | ✔ |
| Delete any post (`posts.delete_any`) | – | if granted | ✔ |
| Create staff/admins, set permissions, IP list, switch accounts off/on | – | – | ✔ |

- Public sign-up always creates `role: "user"`; request bodies are `.strict()` so `role` / `permissions` cannot be injected.
- **Staff** accounts are created only by an admin. A staff member can do nothing outside the permissions on their account — every admin route checks the exact permission (`requirePermission`), and staff can never touch staff/admin accounts or admin-only fields (role, permissions, IP list, on/off).
- **Switch off:** `active: false` blocks login and signs the account out on its next request.
- **IP whitelist (optional, staff only):** `allowedIps` accepts IPs or IPv4 CIDR ranges (`103.10.0.0/16`). Empty = any IP. Checked at login and on every request. `TRUST_PROXY` is `1` on Vercel (its proxy sets the client IP) and `false` locally, so `X-Forwarded-For` cannot be faked.
- The JWT only carries `sub` (user id). `authenticate` re-loads the user by `_id` on each request, so deleting a user, switching it off, or changing its role, permissions or IP list takes effect immediately.
- **No extra index** is needed for any of this: `role`, `active`, `permissions` and `allowedIps` are read from the one document already fetched by `_id` (each request) or `email` (login).
- Admins cannot delete themselves, switch themselves off, or change their own role. Deleting a user also deletes their notes and posts.
- `npm run test:permissions` runs 55 end-to-end checks of these rules against a separate `<db>_test` database.

## 3. Security

- Passwords hashed with bcrypt (cost 12) in a `pre('save')` hook; `password` has `select: false` and is never serialised.
- Login uses a dummy-hash comparison when the email is unknown (no timing-based user enumeration); same error message for both cases.
- All input validated with zod; controllers only read the parsed `req.valid` objects, so operator injection like `{"email": {"$gt": ""}}` is rejected with 400.
- Rate limiting on `/auth/register` and `/auth/login`, `helmet` headers, CORS allow-list, 100 kb JSON limit, generic 500 messages in production.

## 4. API

All list endpoints accept `?page=1&limit=10` (max 100) and return
`{ data: [...], pagination: { page, limit, total, totalPages } }`.
Auth header: `Authorization: Bearer <token>`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | – | `{ name, email, password, interests? }` → `{ token, user }` |
| POST | `/api/auth/login` | – | `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` | user | Current profile |
| PATCH | `/api/auth/me` | user | `{ name?, interests?, password? }` |
| GET | `/api/notes` | user | **List own notes** (paginated) |
| POST | `/api/notes` | user | `{ title, content? }` |
| GET | `/api/notes/:id` | user | Own note (admin: any note) |
| PATCH | `/api/notes/:id` | user | `{ title?, content? }` own note |
| DELETE | `/api/notes/:id` | user | Own note |
| GET | `/api/admin/permissions` | admin / staff | Permissions an admin can grant |
| GET | `/api/admin/users` | admin / staff* | List users (paginated) |
| POST | `/api/admin/users` | admin / staff* | `{ name, email, password, interests? }`; admin also `role?, permissions?, allowedIps?` |
| GET | `/api/admin/users/:id` | admin / staff* | One user |
| PATCH | `/api/admin/users/:id` | admin / staff* | `{ name?, email?, password?, interests? }`; admin also `role?, permissions?, allowedIps?, active?` |
| DELETE | `/api/admin/users/:id` | admin / staff* | Remove user (+ their notes and posts) |
| GET | `/api/admin/notes` | admin / staff* | Everyone's notes, optional `&owner=<userId>` |

\* staff only with the matching permission, and only on accounts with role `user`.

| GET | `/api/posts` | – | Public feed (paginated) |
| POST | `/api/posts` | user | `{ title, body }` |
| DELETE | `/api/posts/:id` | user | Own post (admin: any) |
| GET | `/api/users/interests` | user | **Scenario 1** – users grouped by interest, optional `&interest=chess` |
| GET | `/api/users/:id/posts` | – | **Scenario 2** – all posts of a user via `$lookup` |

## 5. Indexing strategy

All indexes are declared with `schema.index()` (no `index: true` / `unique: true` on fields) in
`src/models/*.js`. Only **4** indexes are created besides the automatic `_id` indexes:

| Collection | Index | Serves |
|---|---|---|
| users | `{ email: 1 }` unique | Login lookup, duplicate-email protection |
| users | `{ interests: 1 }` (multikey) | Scenario 1 `$match` |
| notes | `{ owner: 1, _id: -1 }` | "My notes" list (filter **and** sort), its count, admin filter by owner, cascade delete |
| posts | `{ author: 1, _id: -1 }` | Scenario 2 `$lookup` on `author` + `$sort {_id:-1}`, cascade delete |

Indexes **intentionally not created** (and why):

- **`createdAt`** – lists are sorted by `_id` instead. An ObjectId starts with its creation timestamp, so `sort({_id:-1})` is "newest first" and is served by the default `_id` index. This removes the need for a `createdAt` index on every collection.
- **Admin "list users" / "all notes" / posts feed** – no filter, sort on `_id` → default `_id_` index. Totals use `estimatedDocumentCount()` (collection metadata, no scan).
- **Get / update / delete one note, post or user** – all by `_id` → `_id_`. The extra `owner`/`author` condition on update/delete is checked on the single document already found by `_id`.
- **`{ owner: 1 }` alone or `{ author: 1 }` alone** – would be redundant; the compound indexes already have `owner`/`author` as the prefix.
- **`role`** – no query filters by role.
- **`{ owner: 1, createdAt: -1 }`** – unnecessary because the sort key is `_id`.

`npm run indexes` runs `Model.syncIndexes()` so the database contains exactly these indexes
(any stray index is dropped) and prints them. `npm run explain` runs `explain('executionStats')`
for every query and aggregation the API uses and marks any `COLLSCAN`.

## 6. Aggregations (`src/controllers/aggregations.controller.js`)

### Scenario 1 – users grouped by interests (exactly one `aggregate()` call)

```js
User.aggregate([
  { $match: interest ? { interests: interest } : { interests: { $gt: '' } } }, // interests_1
  { $project: { name: 1, interests: 1 } },
  { $unwind: '$interests' },
  /* if filtering: */ { $match: { interests: interest } },
  { $group: { _id: '$interests', count: { $sum: 1 }, users: { $push: { _id: '$_id', name: '$name' } } } },
  { $sort: { count: -1, _id: 1 } },
  { $facet: {
      data: [{ $skip }, { $limit }, { $project: { _id: 0, interest: '$_id', count: 1, users: 1 } }],
      meta: [{ $count: 'total' }],
  } },
]);
```

- The first `$match` hits the multikey `interests_1` index: an equality bound for one interest,
  or the range `("", {})` covering every string key when listing all groups — users with no
  interests are never fetched.
- `$facet` returns the page **and** the total in the same single call (no `countDocuments`).

### Scenario 2 – a user's posts with `$lookup` (single pipeline)

```js
User.aggregate([
  { $match: { _id: userId } },                          // _id_
  { $project: { name: 1 } },
  { $lookup: {
      from: 'posts', localField: '_id', foreignField: 'author',   // author_1__id_-1
      pipeline: [
        { $sort: { _id: -1 } },                         // same index -> no in-memory sort
        { $facet: { items: [{ $skip }, { $limit }, { $project: { author: 0 } }], total: [{ $count: 'n' }] } },
        { $project: { items: 1, total: { $ifNull: [{ $arrayElemAt: ['$total.n', 0] }, 0] } } },
      ],
      as: 'result',
  } },
  { $unwind: { path: '$result', preserveNullAndEmptyArrays: true } },
  { $project: { _id: 0, author: { _id: '$_id', name: '$name' }, posts: '$result.items', total: '$result.total' } },
]);
```

Uses the `localField/foreignField + pipeline` form of `$lookup` (MongoDB 5.0+; Atlas runs 8.x),
so the join equality and the sort are both answered by `{ author: 1, _id: -1 }`.

## 7. Deploy (Vercel)

`index.js` exports the Express app as the default export, which Vercel runs as one serverless
function ([Express on Vercel](https://vercel.com/docs/frameworks/backend/express)). It keeps one
MongoDB connection per function instance and answers `503` if the database is unreachable.

1. Vercel → **Add New → Project** → import this repository (framework preset: *Other*, no build command).
2. **Settings → Environment Variables:** `MONGODB_URI` and `JWT_SECRET` (they override `config.js`).
3. **Settings → Domains:** add the API domain (e.g. `care-api.tahmid-hasan-rafi.com`).
4. MongoDB Atlas → **Network Access:** allow `0.0.0.0/0` — Vercel functions have no fixed IP.

On Vercel the app runs in production mode and trusts Vercel's proxy for the client IP
(rate limiting, staff IP whitelist). Seed the database once from a local machine with `npm run seed:demo`.
