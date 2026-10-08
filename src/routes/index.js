import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as s from '../validators/schemas.js';
import * as auth from '../controllers/auth.controller.js';
import * as notes from '../controllers/notes.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as posts from '../controllers/posts.controller.js';
import * as agg from '../controllers/aggregations.controller.js';

const router = Router();

// Brute-force protection for credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, please try again later' } },
});

// Personal features (own notes, writing posts, interest groups) are for users and admins.
// Staff only get the sections an admin gave them permission for.
const member = [authenticate, requireRole('user', 'admin')];
// Admin area: admins, plus staff — each route then checks the exact permission.
const backOffice = [authenticate, requireRole('admin', 'staff')];

/* ---------- Auth (everyone) ---------- */
router.post('/auth/register', authLimiter, validate({ body: s.registerBody }), auth.register);
router.post('/auth/login', authLimiter, validate({ body: s.loginBody }), auth.login);
router.get('/auth/me', authenticate, auth.me);
router.patch('/auth/me', authenticate, validate({ body: s.updateMeBody }), auth.updateMe);

/* ---------- Notes (own notes) ---------- */
router.get('/notes', ...member, validate({ query: s.pagination }), notes.listMine);
router.post('/notes', ...member, validate({ body: s.noteCreateBody }), notes.create);
// Reading one note: owner, admin, or staff with notes.view_all (checked in the controller).
router.get('/notes/:id', authenticate, validate({ params: s.idParams }), notes.getOne);
router.patch('/notes/:id', ...member, validate({ params: s.idParams, body: s.noteUpdateBody }), notes.update);
router.delete('/notes/:id', ...member, validate({ params: s.idParams }), notes.remove);

/* ---------- Admin area (admin + permitted staff) ---------- */
router.get('/admin/permissions', ...backOffice, admin.listPermissions);
router.get('/admin/users', ...backOffice, requirePermission('users.view'), validate({ query: s.pagination }), admin.listUsers);
router.post('/admin/users', ...backOffice, requirePermission('users.create'), validate({ body: s.adminCreateUserBody }), admin.createUser);
router.get('/admin/users/:id', ...backOffice, requirePermission('users.view'), validate({ params: s.idParams }), admin.getUser);
router.patch(
  '/admin/users/:id',
  ...backOffice,
  requirePermission('users.update'),
  validate({ params: s.idParams, body: s.adminUpdateUserBody }),
  admin.updateUser
);
router.delete('/admin/users/:id', ...backOffice, requirePermission('users.delete'), validate({ params: s.idParams }), admin.deleteUser);
router.get('/admin/notes', ...backOffice, requirePermission('notes.view_all'), validate({ query: s.adminNotesQuery }), admin.listAllNotes);

/* ---------- Posts (visible to everyone) ---------- */
router.get('/posts', validate({ query: s.pagination }), posts.feed);
router.post('/posts', ...member, validate({ body: s.postCreateBody }), posts.create);
// Delete: author, admin, or staff with posts.delete_any (checked in the controller).
router.delete('/posts/:id', authenticate, validate({ params: s.idParams }), posts.remove);

/* ---------- Aggregations ---------- */
// Scenario 1: users grouped by interest
router.get('/users/interests', ...member, validate({ query: s.interestGroupsQuery }), agg.usersByInterest);
// Scenario 2: all posts of a user ($lookup) — public, like the posts themselves
router.get('/users/:id/posts', validate({ params: s.idParams, query: s.pagination }), agg.userPosts);

export default router;
