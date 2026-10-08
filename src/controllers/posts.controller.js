import { Post } from '../models/Post.js';
import { can } from '../middleware/auth.js';
import { HttpError } from '../utils/httpError.js';
import { paginationMeta, toSkip } from '../utils/pagination.js';

// GET /api/posts?page&limit  (public feed, visible to everyone) -> index: _id_
export async function feed(req, res) {
  const { page, limit } = req.valid.query;
  const [data, total] = await Promise.all([
    Post.find().sort({ _id: -1 }).skip(toSkip(page, limit)).limit(limit).populate('author', 'name').lean(),
    Post.estimatedDocumentCount(),
  ]);
  res.json({ data, pagination: paginationMeta(page, limit, total) });
}

// POST /api/posts
export async function create(req, res) {
  const { title, body } = req.valid.body;
  const post = await Post.create({ author: req.user._id, title, body });
  res.status(201).json({ data: post });
}

// DELETE /api/posts/:id  (author, admin, or staff with posts.delete_any) -> index: _id_
export async function remove(req, res) {
  const filter = { _id: req.valid.params.id };
  if (!can(req.user, 'posts.delete_any')) filter.author = req.user._id;
  const post = await Post.findOneAndDelete(filter).lean();
  if (!post) throw new HttpError(404, 'Post not found');
  res.status(204).end();
}
