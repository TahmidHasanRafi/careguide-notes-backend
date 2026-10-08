import { User } from '../models/User.js';
import { Note } from '../models/Note.js';
import { Post } from '../models/Post.js';
import { HttpError } from '../utils/httpError.js';
import { paginationMeta, toSkip } from '../utils/pagination.js';
import { PERMISSIONS } from '../utils/constants.js';
import { publicUser } from './auth.controller.js';

/*
 * Who may do what here (routes already checked the permission itself):
 *   admin -> everything, including creating staff/admins, permissions, IP rules, switching accounts off
 *   staff -> only accounts with role "user", and only name / email / password / interests.
 *            A staff member can never create or change staff/admins, or touch roles,
 *            permissions, IP rules or the on/off switch.
 */
const ADMIN_ONLY_FIELDS = ['role', 'permissions', 'allowedIps', 'active'];
const isAdmin = (u) => u.role === 'admin';

function assertStaffMayTouch(actor, target) {
  if (!isAdmin(actor) && target.role !== 'user') {
    throw new HttpError(403, 'Staff can only manage regular user accounts');
  }
}

function assertNoAdminOnlyFields(actor, body) {
  if (isAdmin(actor)) return;
  const used = ADMIN_ONLY_FIELDS.filter((f) => body[f] !== undefined && !(f === 'role' && body.role === 'user'));
  if (used.length) throw new HttpError(403, `Only an admin can set: ${used.join(', ')}`);
}

const view = (actor) => (u) => publicUser(u, { full: isAdmin(actor) || String(u._id) === String(actor._id) });

// GET /api/admin/permissions  -> the permissions an admin can hand out (no DB access)
export function listPermissions(_req, res) {
  res.json({ data: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })) });
}

// GET /api/admin/users?page&limit   -> index: _id_ (sort {_id:-1} = newest first)
export async function listUsers(req, res) {
  const { page, limit } = req.valid.query;
  const [users, total] = await Promise.all([
    User.find().sort({ _id: -1 }).skip(toSkip(page, limit)).limit(limit).lean(),
    User.estimatedDocumentCount(), // collection metadata, no scan
  ]);
  res.json({ data: users.map(view(req.user)), pagination: paginationMeta(page, limit, total) });
}

// GET /api/admin/users/:id   -> index: _id_
export async function getUser(req, res) {
  const user = await User.findById(req.valid.params.id).lean();
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ data: view(req.user)(user) });
}

// POST /api/admin/users   -> unique index email_1 rejects duplicates (409)
export async function createUser(req, res) {
  const body = { ...req.valid.body };
  assertNoAdminOnlyFields(req.user, body);
  if (!isAdmin(req.user)) body.role = 'user';
  const user = await User.create(body); // pre('save') drops staff-only fields for non-staff roles
  res.status(201).json({ data: view(req.user)(user) });
}

// PATCH /api/admin/users/:id   -> index: _id_
export async function updateUser(req, res) {
  const { id } = req.valid.params;
  const changes = req.valid.body;
  const self = id === req.user._id.toString();

  assertNoAdminOnlyFields(req.user, changes);
  if (self && changes.role && changes.role !== req.user.role) throw new HttpError(400, 'You cannot change your own role');
  if (self && changes.active === false) throw new HttpError(400, 'You cannot switch off your own account');

  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  assertStaffMayTouch(req.user, user);

  Object.assign(user, changes); // a new password is hashed by the pre('save') hook
  await user.save();
  res.json({ data: view(req.user)(user) });
}

// DELETE /api/admin/users/:id
//   _id_ for the user, owner_1__id_-1 / author_1__id_-1 for the cascade deletes
export async function deleteUser(req, res) {
  const { id } = req.valid.params;
  if (id === req.user._id.toString()) throw new HttpError(400, 'You cannot delete your own account');
  const target = await User.findById(id).lean();
  if (!target) throw new HttpError(404, 'User not found');
  assertStaffMayTouch(req.user, target);

  await User.deleteOne({ _id: id });
  const [notes, posts] = await Promise.all([Note.deleteMany({ owner: id }), Post.deleteMany({ author: id })]);
  res.json({ message: 'User deleted', deletedNotes: notes.deletedCount, deletedPosts: posts.deletedCount });
}

// GET /api/admin/notes?page&limit[&owner]
//   no owner  -> index: _id_ (sort {_id:-1})
//   owner set -> index: owner_1__id_-1
export async function listAllNotes(req, res) {
  const { page, limit, owner } = req.valid.query;
  const filter = owner ? { owner } : {};
  const [data, total] = await Promise.all([
    Note.find(filter)
      .sort({ _id: -1 })
      .skip(toSkip(page, limit))
      .limit(limit)
      .populate('owner', 'name email') // populate = find({_id: {$in: [...]}}) -> _id_
      .lean(),
    owner ? Note.countDocuments(filter) : Note.estimatedDocumentCount(),
  ]);
  res.json({ data, pagination: paginationMeta(page, limit, total) });
}
