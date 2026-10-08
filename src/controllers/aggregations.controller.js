import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Post } from '../models/Post.js';
import { HttpError } from '../utils/httpError.js';
import { paginationMeta, toSkip } from '../utils/pagination.js';

/* ======================================================================
 * SCENARIO 1 — Users grouped by interest
 * Exactly ONE collection.aggregate() call (data + total come from $facet).
 * Index: interests_1 (multikey)
 *   - with ?interest=chess  -> equality $match, tight IXSCAN on ["chess","chess"]
 *   - without a filter      -> $match { interests: { $gt: "" } } = IXSCAN over all
 *                              string keys; users with no interests are skipped
 *                              by the index instead of being fetched and unwound.
 * ==================================================================== */
export function buildInterestGroupsPipeline({ page, limit, interest }) {
  return [
    { $match: interest ? { interests: interest } : { interests: { $gt: '' } } },
    { $project: { name: 1, interests: 1 } },
    { $unwind: '$interests' },
    ...(interest ? [{ $match: { interests: interest } }] : []),
    {
      $group: {
        _id: '$interests',
        count: { $sum: 1 },
        users: { $push: { _id: '$_id', name: '$name' } },
      },
    },
    { $sort: { count: -1, _id: 1 } },
    {
      $facet: {
        data: [
          { $skip: toSkip(page, limit) },
          { $limit: limit },
          { $project: { _id: 0, interest: '$_id', count: 1, users: 1 } },
        ],
        meta: [{ $count: 'total' }],
      },
    },
  ];
}

// GET /api/users/interests?page&limit[&interest]
export async function usersByInterest(req, res) {
  const { page, limit, interest } = req.valid.query;
  const [result] = await User.aggregate(buildInterestGroupsPipeline({ page, limit, interest }));
  const total = result?.meta?.[0]?.total ?? 0;
  res.json({ data: result?.data ?? [], pagination: paginationMeta(page, limit, total) });
}

/* ======================================================================
 * SCENARIO 2 — All posts of one user, single pipeline with $lookup
 *   $match {_id}               -> users _id_ index
 *   $lookup localField/foreignField author + pipeline $sort {_id:-1}
 *                              -> posts author_1__id_-1 (equality + sort, no in-memory sort)
 *   $facet inside the lookup gives the page of posts + total count in the same pass.
 * ==================================================================== */
export function buildUserPostsPipeline({ userId, page, limit }) {
  return [
    { $match: { _id: userId } },
    { $project: { name: 1 } },
    {
      $lookup: {
        from: Post.collection.collectionName,
        localField: '_id',
        foreignField: 'author',
        pipeline: [
          { $sort: { _id: -1 } },
          {
            $facet: {
              items: [{ $skip: toSkip(page, limit) }, { $limit: limit }, { $project: { author: 0 } }],
              total: [{ $count: 'n' }],
            },
          },
          { $project: { items: 1, total: { $ifNull: [{ $arrayElemAt: ['$total.n', 0] }, 0] } } },
        ],
        as: 'result',
      },
    },
    { $unwind: { path: '$result', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        author: { _id: '$_id', name: '$name' },
        posts: { $ifNull: ['$result.items', []] },
        total: { $ifNull: ['$result.total', 0] },
      },
    },
  ];
}

// GET /api/users/:id/posts?page&limit   (public — posts are visible to everyone)
export async function userPosts(req, res) {
  const { page, limit } = req.valid.query;
  const userId = new mongoose.Types.ObjectId(req.valid.params.id); // aggregate() does not auto-cast
  const [doc] = await User.aggregate(buildUserPostsPipeline({ userId, page, limit }));
  if (!doc) throw new HttpError(404, 'User not found');
  res.json({ author: doc.author, data: doc.posts, pagination: paginationMeta(page, limit, doc.total) });
}
