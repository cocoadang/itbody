import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['src/server/trainerRegistration.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'offline', setup(b) {
  b.onResolve({ filter: /^\.\/(adminAccountEndpoints|securityRateLimit)$/ }, (args) => ({ path: args.path, namespace: 'offline' }));
  b.onLoad({ filter: /.*/, namespace: 'offline' }, (args) => ({ contents: args.path.includes('adminAccountEndpoints') ? 'export const getFirebaseAdmin=()=>null; export const requireCenterAdmin=()=>{};' : 'export const consumeLimit=async()=>true;', loader: 'js' }));
} }] });
const { registerTrainerRegistration, validateTrainerApplication, selectTrainerForApproval } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
globalThis.fetch = async () => { throw new Error('Network forbidden'); };
const store = new Map();
let sequence = 0;
const snapshot = (path) => ({ id: path.split('/').at(-1), exists: store.has(path), data: () => store.has(path) ? structuredClone(store.get(path)) : undefined });
const ref = (path) => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) });
const collection = (path, filters = [], max = Infinity) => ({
  path, where: (field, op, value) => { assert.equal(op, '=='); return collection(path, [...filters, [field, value]], max); },
  limit: (count) => collection(path, filters, count), doc: () => ref(`${path}/auto-${++sequence}`),
  get: async () => ({ docs: [...store.keys()].filter((key) => key.split('/').length === path.split('/').length + 1 && key.startsWith(path + '/') && filters.every(([field, value]) => store.get(key)[field] === value)).slice(0, max).map(snapshot) })
});
const db = { doc: ref, collection, runTransaction: async (callback) => {
  const writes = [];
  const tx = { get: (target) => target.get(), set: (target, data, options) => writes.push([target.path, data, !!options?.merge]), update: (target, data) => writes.push([target.path, data, true]) };
  const result = await callback(tx);
  for (const [path, data, merge] of writes) store.set(path, { ...(merge ? store.get(path) : {}), ...structuredClone(data) });
  return result;
} };
const tokens = new Map();
const identities = new Map();
const admin = { db, auth: { verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (!tokens.has(token)) throw Error('Invalid'); return tokens.get(token); }, getUser: async (uid) => { if (!identities.has(uid)) throw Error('Missing'); return identities.get(uid); } } };
const routes = new Map();
const app = { get: (path, ...handlers) => routes.set('GET ' + path, handlers), post: (path, ...handlers) => routes.set('POST ' + path, handlers) };
const adminGuard = (req, res, next) => {
  const uid = (req.headers.authorization || '').slice(7);
  const profile = store.get(`users/${uid}`);
  if (profile?.role !== 'CENTER_ADMIN') return res.status(403).json({ error: 'Admin only' });
  req.caller = { ...profile, uid }; next();
};
registerTrainerRegistration(app, { getAdmin: () => admin, limit: async () => true, adminGuard });
async function invoke(method, path, uid, body = {}, params = {}) {
  const req = { headers: uid ? { authorization: 'Bearer ' + uid } : {}, body, params };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  for (const handler of routes.get(method + ' ' + path)) { let next = false; await handler(req, res, () => { next = true; }); if (!next) break; }
  return res;
}
store.set('centers/c1', { name: '가상 센터' }); store.set('centers/c2', { name: '다른 센터' });
store.set('users/admin', { role: 'CENTER_ADMIN', centerId: 'c1' });
store.set('users/other-admin', { role: 'CENTER_ADMIN', centerId: 'c2' });
const request = { centerId: 'c1', name: '가상 트레이너', phone: '010-1234-5678' };
const makeIdentity = (uid, email = uid + '@example.invalid') => { tokens.set(uid, { uid, email, email_verified: true, firebase: { sign_in_provider: 'password' } }); identities.set(uid, { email, emailVerified: true, disabled: false }); };
makeIdentity('admin'); makeIdentity('other-admin'); makeIdentity('applicant');
tokens.get('applicant').email_verified = false;
assert.equal((await invoke('POST', '/api/trainer-registration/request', 'applicant', request)).code, 403);
assert.equal(store.has('users/applicant'), false);
tokens.get('applicant').email_verified = true;
assert.equal((await invoke('POST', '/api/trainer-registration/request', null, request)).code, 401);
assert.equal((await invoke('POST', '/api/trainer-registration/request', 'applicant', { ...request, role: 'CENTER_ADMIN' })).code, 400);
assert.equal((await invoke('POST', '/api/trainer-registration/request', 'applicant', request)).body.status, 'PENDING');
assert.equal(store.has('users/applicant'), false, 'pending creates no role');
assert.equal((await invoke('GET', '/api/trainer-registration/status', 'applicant')).body.status, 'PENDING');
assert.equal((await invoke('POST', '/api/trainer-registration/request', 'applicant', { ...request, centerId: 'c2' })).code, 409, 'cannot switch pending center');
assert.equal((await invoke('GET', '/api/admin/trainer-requests', 'applicant')).code, 403);
assert.equal((await invoke('POST', '/api/admin/trainer-requests/:uid/review', 'other-admin', { decision: 'APPROVED' }, { uid: 'applicant' })).code, 409);
store.set('trainers/existing-trainer', { trainerId: 'existing-trainer', centerId: 'c1', name: request.name, status: 'ACTIVE' });
assert.equal((await invoke('POST', '/api/admin/trainer-requests/:uid/review', 'admin', { decision: 'APPROVED' }, { uid: 'applicant' })).body.status, 'APPROVED');
assert.equal(store.get('users/applicant').role, 'TRAINER');
assert.equal(store.get('users/applicant').trainerId, 'existing-trainer', 'existing trainer/member relationships preserved');
assert.equal(store.get('trainers/existing-trainer').uid, 'applicant');
assert.equal(store.get('trainerJoinRequests/applicant').reviewedByUid, 'admin');
const count = [...store.keys()].filter((path) => path.startsWith('trainers/')).length;
assert.equal((await invoke('POST', '/api/admin/trainer-requests/:uid/review', 'admin', { decision: 'APPROVED' }, { uid: 'applicant' })).body.status, 'APPROVED');
assert.equal([...store.keys()].filter((path) => path.startsWith('trainers/')).length, count, 'approval retry does not duplicate trainers');
makeIdentity('conflict');
await invoke('POST', '/api/trainer-registration/request', 'conflict', request);
assert.equal((await invoke('POST', '/api/admin/trainer-requests/:uid/review', 'admin', { decision: 'APPROVED' }, { uid: 'conflict' })).code, 409);
assert.equal(store.has('users/conflict'), false, 'identity collision does not grant access');
assert.equal((await invoke('POST', '/api/admin/trainer-requests/:uid/review', 'admin', { decision: 'REJECTED' }, { uid: 'conflict' })).body.status, 'REJECTED');
makeIdentity('new-trainer');
await invoke('POST', '/api/trainer-registration/request', 'new-trainer', { ...request, name: '새 트레이너' });
identities.get('new-trainer').disabled = true;
assert.equal((await invoke('POST', '/api/admin/trainer-requests/:uid/review', 'admin', { decision: 'APPROVED' }, { uid: 'new-trainer' })).code, 409);
identities.get('new-trainer').disabled = false;
assert.equal((await invoke('POST', '/api/admin/trainer-requests/:uid/review', 'admin', { decision: 'APPROVED' }, { uid: 'new-trainer' })).body.status, 'APPROVED');
assert.ok(store.get('users/new-trainer').trainerId.startsWith('auto-'));
assert.throws(() => validateTrainerApplication({ ...request, centerId: '../c1' }));
assert.throws(() => selectTrainerForApproval([{ name: '중복' }, { name: '중복' }], { uid: 'u', email: 'u@example.invalid', name: '중복' }));
console.log('Trainer signup/approval routes passed: verified identity, no pending privileges, center scoping, existing trainer binding, duplicate/replay and rejection; no network/database.');
