import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { signToken, assertAccountUsable } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Shape of a user sent to clients. Staff-only fields (permissions, IP rules) are
 * included for the user themself and for admins; `full=false` hides them, which is
 * used when a staff member looks at other accounts.
 */
export const publicUser = (u, { full = true } = {}) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  interests: u.interests,
  active: u.active !== false,
  ...(full && u.role === 'staff' && { permissions: u.permissions || [], allowedIps: u.allowedIps || [] }),
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

// Compared against when the email does not exist, so a login for an unknown
// email takes the same time as a wrong password (prevents user enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', env.bcryptRounds);

// POST /api/auth/register  (public sign-up always creates role "user" — staff/admins are created by admins)
export async function register(req, res) {
  const { name, email, password, interests = [] } = req.valid.body;
  const user = await User.create({ name, email, password, interests, role: 'user' });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

// POST /api/auth/login   -> index: email_1
export async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+password');
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
  // Checked only after the password is right, so these messages don't reveal which emails exist.
  assertAccountUsable(user, req.ip);
  res.json({ token: signToken(user), user: publicUser(user) });
}

// GET /api/auth/me  (user already loaded by authenticate via _id index)
export function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

// PATCH /api/auth/me  -> index: _id_
export async function updateMe(req, res) {
  const user = await User.findById(req.user._id);
  if (!user) throw new HttpError(404, 'User not found');
  Object.assign(user, req.valid.body); // password is re-hashed by the pre('save') hook
  await user.save();
  res.json({ user: publicUser(user) });
}
