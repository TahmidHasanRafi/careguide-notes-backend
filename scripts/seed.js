/**
 * npm run seed        -> creates (or promotes) the admin from ADMIN_* in backend/config.js
 * npm run seed:demo   -> also creates demo users with interests, notes and posts
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Note } from '../src/models/Note.js';
import { Post } from '../src/models/Post.js';
import { normalizeInterests } from '../src/utils/normalize.js';

// Demo passwords: first name + 123456 (change them later with `npm run reset-passwords`).
const demoUsers = [
  { name: 'Ayesha Rahman', email: 'ayesha@demo.com', password: 'Ayesha123456', interests: ['chess', 'reading', 'travel'] },
  { name: 'Tanvir Hasan', email: 'tanvir@demo.com', password: 'Tanvir123456', interests: ['football', 'chess'] },
  { name: 'Nusrat Jahan', email: 'nusrat@demo.com', password: 'Nusrat123456', interests: ['reading', 'cooking'] },
  { name: 'Rakib Ahmed', email: 'rakib@demo.com', password: 'Rakib123456', interests: ['coding', 'chess', 'football'] },
  { name: 'Farhana Akter', email: 'farhana@demo.com', password: 'Farhana123456', interests: ['travel', 'photography'] },
];

async function upsertUser({ name, email, password, role = 'user', interests = [], permissions = [] }) {
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = await User.create({ name, email, password, role, permissions, interests: normalizeInterests(interests) });
    console.log(`  created ${role}: ${email}`);
  } else if (user.role !== role && role === 'admin') {
    user.role = 'admin';
    await user.save();
    console.log(`  promoted to admin: ${email}`);
  } else {
    console.log(`  exists: ${email}`);
  }
  return user;
}

await connectDB();

const { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD } = env.admin;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/config.js');
  process.exit(1);
}
console.log('Admin:');
await upsertUser({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin', interests: ['coding'] });

if (process.argv.includes('--demo')) {
  console.log('Demo staff:');
  await upsertUser({
    name: 'Sadia Staff',
    email: 'staff@demo.com',
    password: 'Staff123456',
    role: 'staff',
    permissions: ['users.view', 'notes.view_all'],
  });
  console.log('Demo users:');
  for (const d of demoUsers) {
    const user = await upsertUser(d);
    if ((await Note.countDocuments({ owner: user._id })) === 0) {
      await Note.insertMany(
        [1, 2, 3].map((i) => ({ owner: user._id, title: `${d.name.split(' ')[0]}'s note ${i}`, content: `Sample note ${i}.` }))
      );
    }
    if ((await Post.countDocuments({ author: user._id })) === 0) {
      await Post.insertMany(
        [1, 2].map((i) => ({ author: user._id, title: `Post ${i} by ${d.name}`, body: `Hello! This is public post ${i}.` }))
      );
    }
  }
}

await disconnectDB();
console.log('Done.');
