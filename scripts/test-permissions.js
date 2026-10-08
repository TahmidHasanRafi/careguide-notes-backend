/**
 * npm run test:permissions
 * End-to-end check of roles, staff permissions, the on/off switch and the staff IP
 * whitelist — real HTTP requests through the real routes, against your MongoDB.
 * Uses a separate database (<MONGODB_DB>_test) that is wiped before and after the run;
 * your normal data is not touched.
 */
process.env.BCRYPT_ROUNDS = '4'; // fast hashing for the test accounts
process.env.SERVE_FRONTEND = 'false';
process.env.LOG_REQUESTS = 'false';
const mongoose = (await import('mongoose')).default;
const { env } = await import('../src/config/env.js');
const { User } = await import('../src/models/User.js');
const { Note } = await import('../src/models/Note.js');
const { Post } = await import('../src/models/Post.js');

const testDb = `${env.mongoDb}_test`;
await mongoose.connect(env.mongoUri, { dbName: testDb, serverSelectionTimeoutMS: 8000 });
await mongoose.connection.dropDatabase();
await Promise.all([User.init(), Note.init(), Post.init()]);
console.log(`Testing against database "${testDb}"\n`);
const eq = (a, b) => String(a) === String(b);

const { createApp } = await import('../src/app.js');
const srv = createApp().listen(0);
const base = `http://127.0.0.1:${srv.address().port}/api`;

let pass = 0, fail = 0;
async function call(method, path, { token, body, headers = {} } = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers }, body: body && JSON.stringify(body) });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {}
  return { status: r.status, body: j };
}
function check(label, cond, extra = '') {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `   -> ${extra}` : ''}`);
}
const expect = async (label, status, p) => { const r = await p; check(label, r.status === status, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`); return r; };

/* ---- data ---- */
const admin = await User.create({ name: 'Admin', email: 'admin@x.com', password: 'Password123!', role: 'admin' });
const staff = await User.create({ name: 'Staff', email: 'staff@x.com', password: 'Password123!', role: 'staff', permissions: ['users.view', 'notes.view_all'] });
const user = await User.create({ name: 'Ayesha', email: 'ayesha@x.com', password: 'Password123!', interests: ['chess'] });
const plain = await User.create({ name: 'Plain', email: 'plain@x.com', password: 'Password123!', role: 'user', permissions: ['users.view'] });
check('non-staff user keeps no permissions (pre-save clears them)', (await User.findById(plain._id).lean()).permissions.length === 0);
check('password stored as bcrypt hash', /^\$2[aby]\$/.test((await User.findById(user._id).select('+password').lean()).password));
const note = await Note.create({ owner: user._id, title: 'Secret', content: 'hi' });
const post = await Post.create({ author: user._id, title: 'Post', body: 'b' });

const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: 'Password123!' } })).body.token;
const A = await login('admin@x.com'), T = await login('staff@x.com'), U = await login('ayesha@x.com');
check('everyone can log in', A && T && U);

console.log('\n-- sign-up cannot create staff/admin --');
await expect('register with role=staff rejected', 400, call('POST', '/auth/register', { body: { name: 'n', email: 'n@x.com', password: 'Password123!', role: 'staff' } }));
await expect('register with permissions rejected', 400, call('POST', '/auth/register', { body: { name: 'n', email: 'n@x.com', password: 'Password123!', permissions: ['users.view'] } }));

console.log('\n-- staff limited to permitted sections --');
await expect('staff: own notes list blocked', 403, call('GET', '/notes', { token: T }));
await expect('staff: create note blocked', 403, call('POST', '/notes', { token: T, body: { title: 'x' } }));
await expect('staff: write post blocked', 403, call('POST', '/posts', { token: T, body: { title: 'x', body: 'y' } }));
await expect('staff: interest groups blocked', 403, call('GET', '/users/interests', { token: T }));
const list = await expect('staff with users.view: list users', 200, call('GET', '/admin/users', { token: T }));
const adminRow = list.body.data?.find((u) => u.role === 'admin');
check('staff does not see other accounts’ permissions/IPs', adminRow && !('permissions' in adminRow));
await expect('staff with notes.view_all: everyone’s notes', 200, call('GET', '/admin/notes', { token: T }));
await expect('staff with notes.view_all: read a user note', 200, call('GET', `/notes/${note._id}`, { token: T }));
await expect('staff without users.create: add user blocked', 403, call('POST', '/admin/users', { token: T, body: { name: 'n', email: 'n1@x.com', password: 'Password123!' } }));
await expect('staff without users.update: edit blocked', 403, call('PATCH', `/admin/users/${user._id}`, { token: T, body: { name: 'Z' } }));
await expect('staff without users.delete: delete blocked', 403, call('DELETE', `/admin/users/${user._id}`, { token: T }));
await expect('staff without posts.delete_any: delete post blocked', 404, call('DELETE', `/posts/${post._id}`, { token: T }));
await expect('normal user: admin area blocked', 403, call('GET', '/admin/users', { token: U }));
await expect('normal user: cannot read someone else’s note', 404, call('GET', `/notes/${note._id}`, { token: (await call('POST', '/auth/register', { body: { name: 'Q', email: 'q@x.com', password: 'Password123!' } })).body.token }));

console.log('\n-- admin grants more permissions; staff still cannot escalate --');
await expect('admin grants create/update/delete', 200, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { permissions: ['users.view', 'users.create', 'users.update', 'users.delete', 'notes.view_all', 'posts.delete_any'] } }));
await expect('staff cannot create an admin', 403, call('POST', '/admin/users', { token: T, body: { name: 'n', email: 'n2@x.com', password: 'Password123!', role: 'admin' } }));
await expect('staff cannot create staff', 403, call('POST', '/admin/users', { token: T, body: { name: 'n', email: 'n3@x.com', password: 'Password123!', role: 'staff' } }));
const made = await expect('staff creates a regular user', 201, call('POST', '/admin/users', { token: T, body: { name: 'New', email: 'new@x.com', password: 'Password123!' } }));
check('…and it is role "user"', made.body.data?.role === 'user');
await expect('staff cannot edit the admin', 403, call('PATCH', `/admin/users/${admin._id}`, { token: T, body: { name: 'Hacked' } }));
await expect('staff cannot edit itself via admin route (staff account)', 403, call('PATCH', `/admin/users/${staff._id}`, { token: T, body: { name: 'Me' } }));
await expect('staff cannot give permissions', 403, call('PATCH', `/admin/users/${user._id}`, { token: T, body: { permissions: ['users.view'] } }));
await expect('staff cannot change roles', 403, call('PATCH', `/admin/users/${user._id}`, { token: T, body: { role: 'admin' } }));
await expect('staff cannot switch accounts off', 403, call('PATCH', `/admin/users/${user._id}`, { token: T, body: { active: false } }));
await expect('staff edits a regular user', 200, call('PATCH', `/admin/users/${user._id}`, { token: T, body: { name: 'Ayesha R' } }));
await expect('staff cannot delete the admin', 403, call('DELETE', `/admin/users/${admin._id}`, { token: T }));
await expect('staff with posts.delete_any deletes a post', 204, call('DELETE', `/posts/${post._id}`, { token: T }));

console.log('\n-- IP whitelist (optional) --');
await expect('invalid IP rule rejected', 400, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { allowedIps: ['999.1.1.1'] } }));
await expect('admin restricts staff to 10.0.0.5', 200, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { allowedIps: ['10.0.0.5'] } }));
await expect('staff request from other IP: signed out', 401, call('GET', '/admin/users', { token: T }));
await expect('staff login from other IP refused', 403, call('POST', '/auth/login', { body: { email: 'staff@x.com', password: 'Password123!' } }));
await expect('faked X-Forwarded-For does not get through', 401, call('GET', '/admin/users', { token: T, headers: { 'x-forwarded-for': '10.0.0.5' } }));
await expect('admin allows 127.0.0.0/8 (this machine)', 200, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { allowedIps: ['127.0.0.0/8'] } }));
await expect('staff works again from allowed range', 200, call('GET', '/admin/users', { token: T }));
await expect('admin clears IP list (any IP)', 200, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { allowedIps: [] } }));
await expect('normal users are never IP-restricted', 200, call('GET', '/notes', { token: U }));

console.log('\n-- switching staff off --');
await expect('admin switches staff off', 200, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { active: false } }));
const off = await expect('switched-off staff is signed out', 401, call('GET', '/admin/users', { token: T }));
check('…with a clear message', /switched off/.test(off.body.error?.message || ''));
await expect('switched-off staff cannot log in', 403, call('POST', '/auth/login', { body: { email: 'staff@x.com', password: 'Password123!' } }));
await expect('wrong password still gives the generic message', 401, call('POST', '/auth/login', { body: { email: 'staff@x.com', password: 'wrong-pass' } }));
await expect('admin switches staff back on', 200, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { active: true } }));
await expect('staff can log in again', 200, call('POST', '/auth/login', { body: { email: 'staff@x.com', password: 'Password123!' } }));

console.log('\n-- admin safety rails --');
await expect('admin cannot switch itself off', 400, call('PATCH', `/admin/users/${admin._id}`, { token: A, body: { active: false } }));
await expect('admin cannot change own role', 400, call('PATCH', `/admin/users/${admin._id}`, { token: A, body: { role: 'user' } }));
const demoted = await expect('admin turns staff into a user', 200, call('PATCH', `/admin/users/${staff._id}`, { token: A, body: { role: 'user' } }));
check('…its permissions are cleared', !(await User.findById(staff._id).lean()).permissions.length);
const st2 = await expect('admin creates staff with permissions + IP', 201, call('POST', '/admin/users', { token: A, body: { name: 'S2', email: 's2@x.com', password: 'Password123!', role: 'staff', permissions: ['notes.view_all'], allowedIps: ['103.10.0.0/16'] } }));
check('…saved as given', JSON.stringify(st2.body.data?.permissions) === '["notes.view_all"]' && st2.body.data?.allowedIps?.[0] === '103.10.0.0/16');
await expect('permissions list endpoint', 200, call('GET', '/admin/permissions', { token: A }));

console.log(`\n${pass} passed, ${fail} failed`);
srv.close();
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
process.exit(fail ? 1 : 0);
