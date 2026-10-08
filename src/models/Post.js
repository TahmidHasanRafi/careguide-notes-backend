import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
  },
  { timestamps: true, versionKey: false }
);

/* ------------------------------------------------------------------ *
 * INDEXES (posts)
 * _id_ (automatic)   -> public feed (sorted by _id), delete a post
 * author_1__id_-1    -> Scenario 2: $lookup foreignField `author` + $sort {_id:-1}
 *                       inside the lookup pipeline; cascade delete of a user's posts
 * ------------------------------------------------------------------ */
postSchema.index({ author: 1, _id: -1 });

export const Post = mongoose.model('Post', postSchema);
