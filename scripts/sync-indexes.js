/**
 * npm run indexes
 * Makes the database indexes match the schema.index() declarations exactly
 * (drops anything extra, e.g. left over from earlier experiments) and prints them.
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';

await connectDB();
for (const Model of [User, Note, Post]) {
  const dropped = await Model.syncIndexes();
  const indexes = await Model.collection.indexes();
  console.log(`\n${Model.collection.collectionName}${dropped.length ? `  (dropped: ${dropped.join(', ')})` : ''}`);
  for (const ix of indexes) {
    console.log(`  - ${ix.name.padEnd(18)} ${JSON.stringify(ix.key)}${ix.unique ? '  unique' : ''}`);
  }
}
await disconnectDB();
