import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { ROLES, PERMISSION_KEYS } from '../utils/constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // NOTE: no `unique: true` / `index: true` here on purpose — every index is
    // declared below with schema.index() so the full strategy is visible in one place.
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    interests: { type: [String], default: [] },

    // Admins can switch an account off. A switched-off account cannot log in and its
    // existing tokens stop working on the next request.
    active: { type: Boolean, default: true },
    // Staff only: what the staff member may do. Ignored for users and admins.
    permissions: { type: [{ type: String, enum: PERMISSION_KEYS }], default: [] },
    // Staff only, optional: IPs / IPv4 CIDR ranges the staff member may connect from.
    // Empty = any IP.
    allowedIps: { type: [String], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

/* ------------------------------------------------------------------ *
 * INDEXES (users)
 * _id_ (automatic)  -> GET user by id, auth middleware, admin list users
 *                      (sorted by _id = newest first), $lookup start point
 * email_1 (unique)  -> login lookup + guarantees no duplicate accounts
 * interests_1       -> Scenario 1 aggregation ($match on the multikey array)
 *
 * role / active / permissions / allowedIps need NO index: they are only read from the
 * single document already fetched by _id (every request) or email (login).
 * ------------------------------------------------------------------ */
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ interests: 1 });

// Hash password whenever it is set/changed (create, profile update, admin update).
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, env.bcryptRounds);
});

// Permissions and IP rules only mean something for staff.
userSchema.pre('save', function clearStaffFields() {
  if (this.role !== 'staff') {
    this.permissions = [];
    this.allowedIps = [];
  }
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

export const User = mongoose.model('User', userSchema);
