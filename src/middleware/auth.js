import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { ipAllowed } from '../utils/ip.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Account-level checks shared by login and every authenticated request:
 * switched-off accounts are refused, and staff with an IP whitelist must
 * connect from one of those IPs.
 */
export function assertAccountUsable(user, ip) {
  if (user.active === false) throw new HttpError(403, 'This account has been switched off by an admin');
  if (user.role === 'staff' && !ipAllowed(ip, user.allowedIps)) {
    throw new HttpError(403, 'Access from this IP address is not allowed for this account');
  }
}

/** Verifies the Bearer token and loads the current user (uses the _id index). */
export async function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  // Loading the user on every request means a deleted or switched-off account,
  // a changed role, changed permissions or a new IP rule take effect immediately.
  const user = await User.findById(payload.sub).lean();
  if (!user) throw new HttpError(401, 'User no longer exists');
  try {
    assertAccountUsable(user, req.ip);
  } catch (err) {
    throw new HttpError(401, err.message); // 401 -> the frontend signs the person out
  }

  req.user = user; // password is excluded (select: false)
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new HttpError(403, 'Forbidden');
  next();
};

/** True for admins, and for staff who were given this permission. */
export function can(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'staff' && (user.permissions || []).includes(permission);
}

export const requirePermission = (permission) => (req, _res, next) => {
  if (!can(req.user, permission)) throw new HttpError(403, 'You do not have permission for this section');
  next();
};
