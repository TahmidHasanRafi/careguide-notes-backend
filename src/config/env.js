import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import settings from '../../config.js';

// A real environment variable (e.g. set in Vercel's dashboard) wins over the value in config.js.
const get = (key) => (process.env[key] !== undefined ? process.env[key] : settings[key]);

// Vercel sets VERCEL=1 in its functions.
const onVercel = Boolean(process.env.VERCEL);

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((k) => !get(k));
if (missing.length) {
  console.error(
    `Missing settings: ${missing.join(', ')} — set them in config.js, or as environment variables ` +
      '(on Vercel: Project → Settings → Environment Variables, then redeploy).'
  );
  process.exit(1);
}
if (String(get('JWT_SECRET')).length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

// How many reverse proxies (nginx, a load balancer) sit in front of the app.
// Needed for the real client IP (rate limiting, staff IP whitelist).
// Keep it false when nothing is in front — otherwise anyone could fake their IP
// with an X-Forwarded-For header.
function parseTrustProxy(v) {
  if (v === undefined || v === '' || v === false || v === 'false' || v === '0' || v === 0) return false;
  if (v === true || v === 'true') return true;
  return /^\d+$/.test(String(v)) ? Number(v) : v;
}

const toList = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((s) => String(s).trim().replace(/\/$/, ''))
    .filter(Boolean);

const nodeEnv = process.env.NODE_ENV || (onVercel ? 'production' : 'development');

export const env = {
  onVercel,
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(get('PORT')) || 5050,
  host: get('HOST') || '127.0.0.1',
  mongoUri: get('MONGODB_URI'),
  mongoDb: get('MONGODB_DB') || 'careguide_notes',
  jwtSecret: String(get('JWT_SECRET')),
  jwtExpiresIn: get('JWT_EXPIRES_IN') || '1d',
  bcryptRounds: Number(get('BCRYPT_ROUNDS')) || 12,
  // Vercel's edge proxy sits in front of every function and sets X-Forwarded-For itself.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY ?? (onVercel ? 1 : settings.TRUST_PROXY)),
  corsOrigins: toList(get('CORS_ORIGINS')),
  // Also allow the project's own *.vercel.app addresses (preview deployments).
  corsAllowVercelApp: String(get('CORS_ALLOW_VERCEL_APP')) !== 'false',
  serveFrontend: String(get('SERVE_FRONTEND')) !== 'false',
  admin: { name: get('ADMIN_NAME') || 'Admin', email: get('ADMIN_EMAIL'), password: get('ADMIN_PASSWORD') },
  // Looks next to the backend folder for "frontend" (this project) or "careguide-notes-frontend"
  // (both GitHub repos cloned side by side).
  frontendDir:
    process.env.FRONTEND_DIR ||
    ['../../../frontend', '../../../careguide-notes-frontend']
      .map((rel) => fileURLToPath(new URL(rel, import.meta.url)))
      .find((dir) => fs.existsSync(dir)) ||
    fileURLToPath(new URL('../../../frontend', import.meta.url)),
};
