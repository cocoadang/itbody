import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Bundle only route logic. Stub every service/SDK and never start a real server.
const routes = new Map();
globalThis.__aiTimeoutRoutes = routes;
globalThis.fetch = async () => { throw Error('Network forbidden'); };
process.env.NODE_ENV = 'production';
process.env.GEMINI_API_KEY = 'offline-placeholder';
const stubs = {
  express: `const app = { disable(){}, use(){}, get(){}, post(path, ...fns){ globalThis.__aiTimeoutRoutes.set(path, fns.at(-1)); }, listen(){} }; const express = () => app; express.json = express.static = () => () => {}; export default express;`,
  compression: 'export default () => () => {};',
  dotenv: 'export default { config(){} };',
  vite: 'export const createServer = () => { throw Error("Unexpected Vite initialization"); };',
  '@google/genai': 'export class GoogleGenAI {} export const Type = {};',
  './src/server/memberAccess': 'export const registerMemberAccess = () => {};',
  './src/server/kakaoAuth': 'export const registerKakaoAuth = () => {};',
  './src/server/aiSecurity': 'export const requireAiAccess = () => { throw Error("Auth must be isolated"); };',
  './src/server/adminAccountEndpoints': 'export const registerAdminAccountEndpoints = () => {};',
  './src/server/aiGeneration': 'export class AiGenerationTimeout extends Error {} export const generateWithModelFallback = async () => { throw new AiGenerationTimeout(); };',
};
const result = await build({ entryPoints: ['server.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'offline', setup(b) {
    b.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'offline' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: stubs[args.path], loader: 'js' }));
  } }],
});
await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
for (const path of ['/api/ai/session-draft', '/api/ai/review-draft']) {
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await routes.get(path)({ body: { rawMemo: 'synthetic input' } }, res);
  assert.equal(res.code, 504);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
  assert.equal(res.body.draft, undefined);
}
delete globalThis.__aiTimeoutRoutes;
console.log('Both AI routes return safe 504 JSON on deadline; all SDK/auth/database dependencies stubbed.');
