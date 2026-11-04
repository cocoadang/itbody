import assert from 'node:assert/strict';
import { GoogleGenAI } from '@google/genai';
import { generateWithModelFallback, AiGenerationTimeout, AI_GENERATION_BUDGET_MS } from '../src/server/aiGeneration';

// No credentials, models, Firebase, HTTP server or real network are used.
globalThis.fetch = async () => { throw new Error('Network forbidden in this test'); };
const calls: any[] = [];
const result = { text: 'offline result' };
const fake = (fn: (p: any) => Promise<any>) => ({ models: { generateContent: fn } }) as any;
const options = { model: 'primary', contents: 'synthetic input', config: { temperature: 0.2 } };
assert.equal(AI_GENERATION_BUDGET_MS, 45_000);
assert.equal(await generateWithModelFallback(fake(async p => { calls.push(p); return result; }), options), result);
assert.equal(calls[0].config.temperature, 0.2);
assert.equal(calls[0].config.httpOptions.retryOptions.attempts, 1);
assert.ok(calls[0].config.httpOptions.timeout <= 45_000);
calls.length = 0;
assert.equal(await generateWithModelFallback(fake(async p => {
  calls.push(p);
  if (calls.length < 3) throw { status: calls.length === 1 ? 429 : 503 };
  return result;
}), options), result);
assert.deepEqual(calls.map(p => p.model), ['primary', 'gemini-3.1-flash-lite', 'gemini-3.5-flash']);
assert.equal(calls[0].config.abortSignal, calls[2].config.abortSignal);
for (const status of [400, 401, 403, 500]) {
  let count = 0;
  await assert.rejects(generateWithModelFallback(fake(async () => { count++; throw { status }; }), options), e => (e as any).status === status);
  assert.equal(count, 1);
}
let count = 0;
await assert.rejects(generateWithModelFallback(fake(async () => { count++; throw { status: 503 }; }), options), e => (e as any).status === 503);
assert.equal(count, 3);

// An upstream implementation ignoring cancellation still cannot keep the route waiting.
let signal: AbortSignal;
count = 0;
await assert.rejects(generateWithModelFallback(fake(async p => {
  count++; signal = p.config.abortSignal;
  return new Promise(() => {});
}), options, 30), AiGenerationTimeout);
assert.equal(count, 1);
assert.equal(signal!.aborted, true);
count = 0;
await assert.rejects(generateWithModelFallback(fake(async () => { count++; return result; }), options, 0), AiGenerationTimeout);
assert.equal(count, 0);

// The second model gets the remaining budget, not another full time window.
calls.length = 0;
await assert.rejects(generateWithModelFallback(fake(async p => {
  calls.push(p);
  if (calls.length === 1) { await new Promise(r => setTimeout(r, 25)); throw { status: 503 }; }
  return new Promise(() => {});
}), options, 150), AiGenerationTimeout);
assert.equal(calls.length, 2);
assert.ok(calls[1].config.httpOptions.timeout < calls[0].config.httpOptions.timeout);

// Exercise the installed SDK with a synthetic fetch, proving no hidden SDK retries.
let fetchCount = 0;
const ai = new GoogleGenAI({ apiKey: 'offline-placeholder', httpOptions: { fetch: async () => {
  fetchCount++;
  return new Response(JSON.stringify({ error: { code: 503, message: 'offline unavailable', status: 'UNAVAILABLE' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
} } });
await assert.rejects(generateWithModelFallback(ai, options));
assert.equal(fetchCount, 3);
console.log('AI generation checks passed: success, model fallback, errors, shared deadline, abort, SDK retry suppression; no network/database.');
