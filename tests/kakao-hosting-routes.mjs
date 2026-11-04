import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

// Replace ALL account/database/rate-limit dependencies at bundle time.
// No Firebase SDK is loaded, and fetch is replaced before invoking any route.
const records = new Map();
const mock = {
  db: {
    doc(path) { return { path, async set(value) { records.set(path, value); } }; },
    async runTransaction(fn) {
      return fn({ async get(ref) { return { data: () => records.get(ref.path) }; },
        update(ref, value) { records.set(ref.path, { ...records.get(ref.path), ...value }); } });
    }
  }
};
globalThis.__kakaoHostingMock = mock;
const result = await build({ entryPoints: ['src/server/kakaoAuth.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', plugins: [{ name: 'offline-only', setup(b) {
    b.onResolve({ filter: /^\.\/(adminAccountEndpoints|memberAccess|securityRateLimit)$/ }, args => ({ path: args.path, namespace: 'offline' }));
    b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: `
      export const getFirebaseAdmin = () => globalThis.__kakaoHostingMock;
      export const requireCenterAdmin = () => { throw Error('Unexpected admin route'); };
      export const requireMemberAccount = () => { throw Error('Unexpected member route'); };
      export const consumeLimit = async () => true;
      export const ensureKakaoAccount = async id => 'mock-' + id;
      export const memberToken = async uid => 'mock-token-' + uid;
      export const bindMember = () => { throw Error('Unexpected bind'); };
    `, loader: 'js' }));
  }}] });
const { registerKakaoAuth } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const routes = new Map();
registerKakaoAuth({ use() {}, get(path, handler) { routes.set(path, handler); }, post(path, ...handlers) { routes.set(path, handlers.at(-1)); } });
const oldUri = 'https://itbody.ai.studio/?kakao_callback=1';
const newUri = 'https://itbody.dsoom.com/?kakao_callback=1';
Object.assign(process.env, { NODE_ENV: 'production', KAKAO_REST_API_KEY: 'mock', KAKAO_CLIENT_SECRET: 'mock', KAKAO_REDIRECT_URI: oldUri, KAKAO_ADDITIONAL_REDIRECT_URIS: newUri });
function response() { return { statusCode: 200, cookies: [], headers: {}, status(code) { this.statusCode = code; return this; },
  set(name, value) { this.headers[name] = value; return this; }, cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; }, redirect(url) { this.location = url; this.statusCode = 302; return this; } }; }
let expectedUri;
globalThis.fetch = async (url, options) => {
  if (url === 'https://kauth.kakao.com/oauth/token') {
    assert.equal(options.body.get('redirect_uri'), expectedUri);
    return new Response(JSON.stringify({ access_token: 'fake' }));
  }
  if (url === 'https://kapi.kakao.com/v2/user/me') return new Response(JSON.stringify({ id: 123 }));
  throw Error('Network forbidden');
};
for (const uri of [oldUri, newUri]) {
  expectedUri = uri;
  const origin = new URL(uri).origin;
  const start = response();
  await routes.get('/api/auth/kakao/start')({ query: { origin }, ip: 'offline' }, start);
  assert.equal(start.statusCode, 302);
  assert.equal(new URL(start.location).searchParams.get('redirect_uri'), uri);
  const state = new URL(start.location).searchParams.get('state');
  const c = start.cookies.find(c => c.name === '__session');
  assert.equal(c.options.httpOnly, true); assert.equal(c.options.secure, true);
  assert.equal(c.options.sameSite, 'lax'); assert.equal(c.options.maxAge, 600000);
  const req = { headers: { origin, cookie: '__session=' + c.value }, body: { code: 'fake', state } };
  const wrong = response();
  await routes.get('/api/auth/kakao/exchange')({ ...req, body: { ...req.body, state: 'wrong' } }, wrong);
  assert.equal(wrong.statusCode, 400);
  const cross = response();
  await routes.get('/api/auth/kakao/exchange')({ ...req, headers: { ...req.headers, origin: origin === 'https://itbody.ai.studio' ? 'https://itbody.dsoom.com' : 'https://itbody.ai.studio' } }, cross);
  assert.equal(cross.statusCode, 400);
  const ok = response(); await routes.get('/api/auth/kakao/exchange')(req, ok);
  assert.equal(ok.body.customToken, 'mock-token-mock-123');
  assert.equal(ok.cookies.find(c => c.name === '__session').options.maxAge, 0);
  const replay = response(); await routes.get('/api/auth/kakao/exchange')(req, replay);
  assert.equal(replay.statusCode, 400);
}
// A login initiated by the previous version remains usable on its original origin.
expectedUri = oldUri;
const state = 'z'.repeat(32);
records.set('kakaoOAuthStates/' + createHash('sha256').update(state).digest('hex'), { used: false, expiresAt: Date.now() + 600000 });
const legacy = response();
await routes.get('/api/auth/kakao/exchange')({ headers: { origin: 'https://itbody.ai.studio', cookie: 'pt_kakao_state=' + state }, body: { state, code: 'fake' } }, legacy);
assert.equal(legacy.body.customToken, 'mock-token-mock-123');
const invalid = response(); await routes.get('/api/auth/kakao/start')({ query: { origin: 'https://evil.test' }, ip: 'offline' }, invalid);
assert.equal(invalid.statusCode, 403);
delete globalThis.__kakaoHostingMock;
console.log('Offline Kakao route checks passed: both origins, Hosting cookie, flags, mismatch, cross-origin, replay, legacy.');
