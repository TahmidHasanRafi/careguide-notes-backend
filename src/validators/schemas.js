import { z } from 'zod';
import { ROLES, PERMISSION_KEYS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../utils/constants.js';
import { normalizeInterests } from '../utils/normalize.js';
import { isValidIpRule } from '../utils/ip.js';

const nonEmpty = (o) => Object.keys(o).length > 0;

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId });

const name = z.string().trim().min(1, 'Name is required').max(80);
const email = z.string().trim().toLowerCase().email('Invalid email').max(254);
// bcrypt only uses the first 72 bytes, so cap the length.
const password = z.string().min(8, 'Password must be at least 8 characters').max(72);
const interests = z.array(z.string().max(30)).max(20).transform(normalizeInterests);
const permissions = z
  .array(z.enum(PERMISSION_KEYS))
  .max(PERMISSION_KEYS.length)
  .transform((list) => [...new Set(list)]);
const allowedIps = z
  .array(z.string().trim().refine(isValidIpRule, 'Use an IP address (e.g. 103.10.20.30) or an IPv4 range (e.g. 103.10.0.0/16)'))
  .max(20)
  .transform((list) => [...new Set(list)]);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/* ---------- auth ---------- */
// .strict() rejects unknown keys -> nobody can self-assign { role: 'admin' } or permissions.
export const registerBody = z.object({ name, email, password, interests: interests.optional() }).strict();
export const loginBody = z.object({ email, password: z.string().min(1).max(72) }).strict();
export const updateMeBody = z
  .object({ name: name.optional(), interests: interests.optional(), password: password.optional() })
  .strict()
  .refine(nonEmpty, 'Nothing to update');

/* ---------- notes ---------- */
const noteTitle = z.string().trim().min(1, 'Title is required').max(200);
const noteContent = z.string().max(20000);
export const noteCreateBody = z.object({ title: noteTitle, content: noteContent.default('') }).strict();
export const noteUpdateBody = z
  .object({ title: noteTitle.optional(), content: noteContent.optional() })
  .strict()
  .refine(nonEmpty, 'Nothing to update');

/* ---------- admin / staff ---------- */
// Which of these fields a staff member may send is decided in the controller.
export const adminCreateUserBody = z
  .object({
    name,
    email,
    password,
    role: z.enum(ROLES).default('user'),
    interests: interests.optional(),
    permissions: permissions.optional(),
    allowedIps: allowedIps.optional(),
    active: z.boolean().optional(),
  })
  .strict();
export const adminUpdateUserBody = z
  .object({
    name: name.optional(),
    email: email.optional(),
    password: password.optional(),
    role: z.enum(ROLES).optional(),
    interests: interests.optional(),
    permissions: permissions.optional(),
    allowedIps: allowedIps.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(nonEmpty, 'Nothing to update');
export const adminNotesQuery = pagination.extend({ owner: objectId.optional() });

/* ---------- posts ---------- */
export const postCreateBody = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    body: z.string().trim().min(1, 'Body is required').max(5000),
  })
  .strict();

/* ---------- aggregations ---------- */
export const interestGroupsQuery = pagination.extend({
  interest: z.string().trim().toLowerCase().min(1).max(30).optional(),
});
