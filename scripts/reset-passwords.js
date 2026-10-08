/**
 * Reset passwords from the command line (uses the database in backend/config.js).
 *
 *   npm run reset-passwords
 *       -> sets every demo account below to its new password
 *
 *   npm run reset-passwords -- someone@example.com NewPassword123
 *       -> sets one account's password
 *
 * Passwords are hashed with bcrypt by the User model, exactly like a normal sign-up.
 * Anyone already logged in keeps their session until the token expires (1 day).
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

export const DEMO_PASSWORDS = {
  [env.admin.email]: 'Admin123456',
  'staff@demo.com': 'Staff123456',
  'ayesha@demo.com': 'Ayesha123456',
  'tanvir@demo.com': 'Tanvir123456',
  'nusrat@demo.com': 'Nusrat123456',
  'rakib@demo.com': 'Rakib123456',
  'farhana@demo.com': 'Farhana123456',
};

const [emailArg, passwordArg] = process.argv.slice(2);
if (emailArg && !passwordArg) {
  console.error('Usage: npm run reset-passwords -- <email> <new-password>');
  process.exit(1);
}
const targets = emailArg ? { [emailArg.trim().toLowerCase()]: passwordArg } : DEMO_PASSWORDS;

for (const [email, password] of Object.entries(targets)) {
  if (password.length < 8 || password.length > 72) {
    console.error(`Password for ${email} must be 8–72 characters.`);
    process.exit(1);
  }
}

await mongoose.connect(env.mongoUri, { dbName: env.mongoDb, serverSelectionTimeoutMS: 10000 });
console.log(`Database: ${env.mongoDb}\n`);

let changed = 0;
for (const [email, password] of Object.entries(targets)) {
  const user = await User.findOne({ email }).select('+password'); // email_1 index
  if (!user) {
    console.log(`  not found   ${email}`);
    continue;
  }
  user.password = password; // re-hashed by the pre('save') hook
  await user.save();
  changed++;
  console.log(`  updated     ${email.padEnd(24)} ${user.role.padEnd(6)} -> ${password}`);
}

console.log(`\n${changed} password(s) changed.`);
await mongoose.disconnect();
