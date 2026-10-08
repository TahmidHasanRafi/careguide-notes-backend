/* MongoDB for VS Code playground.
 * 1) Connect to "Local MongoDB (careguide)" in the MongoDB sidebar (leaf icon).
 * 2) Run `npm run seed:demo` once so there is data.
 * 3) Click "Run" (play button, top right) — or select a block and Ctrl+Alt+S
 *    (Cmd+Alt+S on Mac) to run only that block. Results open in a side panel.
 * Read-only: nothing here writes to the database.
 */
use('careguide_notes');

/* ---------- 1. The indexes that exist (should be _id + 4 custom) ---------- */
({
  users: db.users.getIndexes().map((i) => `${i.name}${i.unique ? ' (unique)' : ''}`),
  notes: db.notes.getIndexes().map((i) => i.name),
  posts: db.posts.getIndexes().map((i) => i.name),
});

/* ---------- 2. Scenario 1: users grouped by interest (one aggregate call) ---------- */
db.users.aggregate([
  { $match: { interests: { $gt: '' } } },
  { $project: { name: 1, interests: 1 } },
  { $unwind: '$interests' },
  { $group: { _id: '$interests', count: { $sum: 1 }, users: { $push: { _id: '$_id', name: '$name' } } } },
  { $sort: { count: -1, _id: 1 } },
  {
    $facet: {
      data: [{ $skip: 0 }, { $limit: 10 }, { $project: { _id: 0, interest: '$_id', count: 1, users: 1 } }],
      meta: [{ $count: 'total' }],
    },
  },
]);

/* ---------- 3. Scenario 2: all posts of one user ($lookup) ---------- */
const someUser = db.users.findOne({ email: 'ayesha@demo.com' }) ?? db.users.findOne();
db.users.aggregate([
  { $match: { _id: someUser._id } },
  { $project: { name: 1 } },
  {
    $lookup: {
      from: 'posts',
      localField: '_id',
      foreignField: 'author',
      pipeline: [
        { $sort: { _id: -1 } },
        { $facet: { items: [{ $skip: 0 }, { $limit: 10 }, { $project: { author: 0 } }], total: [{ $count: 'n' }] } },
      ],
      as: 'result',
    },
  },
]);

/* ---------- 4. Which index served each query? (look for IXSCAN, not COLLSCAN) ---------- */
const winning = (e) => JSON.stringify(e.queryPlanner?.winningPlan ?? e.stages?.[0]?.$cursor?.queryPlanner?.winningPlan);
({
  login: winning(db.users.find({ email: 'ayesha@demo.com' }).explain()),
  myNotes: winning(db.notes.find({ owner: someUser._id }).sort({ _id: -1 }).limit(10).explain()),
  interestFilter: winning(db.users.explain().aggregate([{ $match: { interests: 'chess' } }])),
  userPostsInner: winning(db.posts.find({ author: someUser._id }).sort({ _id: -1 }).explain()),
});
