import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: '', maxlength: 20000 },
  },
  { timestamps: true, versionKey: false }
);

/* ------------------------------------------------------------------ *
 * INDEXES (notes)
 * _id_ (automatic)   -> GET/PATCH/DELETE a single note, admin "all notes"
 *                       list (sorted by _id = newest first)
 * owner_1__id_-1     -> "my notes" list: equality on owner + sort by _id,
 *                       countDocuments({owner}), admin filter by owner,
 *                       cascade delete when a user is removed.
 *                       (equality field first, sort field second => no in-memory sort)
 * ------------------------------------------------------------------ */
noteSchema.index({ owner: 1, _id: -1 });

export const Note = mongoose.model('Note', noteSchema);
