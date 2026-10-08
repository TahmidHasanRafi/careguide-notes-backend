import { Note } from '../models/Note.js';
import { can } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { paginationMeta, toSkip } from '../utils/pagination.js';

// GET /api/notes?page&limit   -> index: owner_1__id_-1 (filter + sort + count)
export async function listMine(req, res) {
  const { page, limit } = req.valid.query;
  const filter = { owner: req.user._id };
  const [data, total] = await Promise.all([
    Note.find(filter).sort({ _id: -1 }).skip(toSkip(page, limit)).limit(limit).lean(),
    Note.countDocuments(filter),
  ]);
  res.json({ data, pagination: paginationMeta(page, limit, total) });
}

// POST /api/notes
export async function create(req, res) {
  const { title, content } = req.valid.body;
  const note = await Note.create({ owner: req.user._id, title, content });
  res.status(201).json({ data: note });
}

// GET /api/notes/:id   -> index: _id_   (owner, admin, or staff with notes.view_all)
export async function getOne(req, res) {
  const note = await Note.findById(req.valid.params.id).populate('owner', 'name email').lean();
  const isOwner = note && note.owner && note.owner._id.equals(req.user._id);
  // 404 instead of 403 so other users cannot probe which note ids exist.
  if (!note || (!isOwner && !can(req.user, 'notes.view_all'))) throw new HttpError(404, 'Note not found');
  res.json({ data: note });
}

// PATCH /api/notes/:id   -> index: _id_
export async function update(req, res) {
  const note = await Note.findOneAndUpdate(
    { _id: req.valid.params.id, owner: req.user._id },
    { $set: req.valid.body },
    { new: true, runValidators: true }
  ).lean();
  if (!note) throw new HttpError(404, 'Note not found');
  res.json({ data: note });
}

// DELETE /api/notes/:id   -> index: _id_
export async function remove(req, res) {
  const note = await Note.findOneAndDelete({ _id: req.valid.params.id, owner: req.user._id }).lean();
  if (!note) throw new HttpError(404, 'Note not found');
  res.status(204).end();
}
