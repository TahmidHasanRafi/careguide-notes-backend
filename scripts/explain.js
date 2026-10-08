/**
 * npm run explain   (run `npm run seed:demo` first so there is data)
 * Runs explain('executionStats') for every query/aggregation the API uses and
 * prints which index served it. Anything that shows COLLSCAN is flagged.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';
import { buildInterestGroupsPipeline, buildUserPostsPipeline } from '../src/controllers/aggregations.controller.js';

const SKIP_KEYS = new Set(['rejectedPlans', 'allPlansExecution']);

function collect(node, out = { stages: new Set(), indexes: new Set() }) {
  if (Array.isArray(node)) node.forEach((n) => collect(n, out));
  else if (node && typeof node === 'object') {
    if (typeof node.stage === 'string') out.stages.add(node.stage);
    if (typeof node.indexName === 'string') out.indexes.add(node.indexName);
    if (Array.isArray(node.indexesUsed)) node.indexesUsed.forEach((i) => out.indexes.add(i));
    for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) collect(v, out);
  }
  return out;
}

async function report(label, explainPromise) {
  try {
    const { stages, indexes } = collect(await explainPromise);
    const bad = stages.has('COLLSCAN');
    console.log(`${bad ? '✖' : '✔'} ${label}`);
    console.log(`    indexes: ${[...indexes].join(', ') || '-'}   stages: ${[...stages].join(' > ')}`);
  } catch (err) {
    console.log(`? ${label}\n    explain failed: ${err.message}`);
  }
}

await connectDB();

const sample = await Note.findOne().lean();
const user = sample ? await User.findById(sample.owner).lean() : await User.findOne().lean();
if (!user) {
  console.log('No data. Run `npm run seed:demo` first.');
  process.exit(0);
}
const post = await Post.findOne().lean();
const interest = user.interests?.[0] || 'chess';
const E = 'executionStats';

console.log(`Sample user: ${user.email}\n`);
await report('login: User.findOne({email})', User.findOne({ email: user.email }).explain(E));
await report('auth / get user: User.findById', User.findById(user._id).explain(E));
await report('admin list users: find().sort({_id:-1})', User.find().sort({ _id: -1 }).limit(10).explain(E));
await report('my notes: find({owner}).sort({_id:-1})', Note.find({ owner: user._id }).sort({ _id: -1 }).limit(10).explain(E));
await report(
  'my notes count: countDocuments({owner})',
  Note.collection.aggregate([{ $match: { owner: user._id } }, { $count: 'n' }]).explain(E)
);
if (sample) await report('get note: findById', Note.findById(sample._id).explain(E));
await report('admin all notes: find().sort({_id:-1})', Note.find().sort({ _id: -1 }).limit(10).explain(E));
await report('posts feed: find().sort({_id:-1})', Post.find().sort({ _id: -1 }).limit(10).explain(E));
if (post) await report('delete post: findOne({_id})', Post.findOne({ _id: post._id }).explain(E));
await report(
  'Scenario 1: users grouped by interest (all)',
  User.aggregate(buildInterestGroupsPipeline({ page: 1, limit: 10 })).explain(E)
);
await report(
  `Scenario 1: users grouped by interest (interest="${interest}")`,
  User.aggregate(buildInterestGroupsPipeline({ page: 1, limit: 10, interest })).explain(E)
);
await report(
  'Scenario 2: user posts via $lookup',
  User.aggregate(buildUserPostsPipeline({ userId: new mongoose.Types.ObjectId(String(user._id)), page: 1, limit: 10 })).explain(E)
);

await disconnectDB();
