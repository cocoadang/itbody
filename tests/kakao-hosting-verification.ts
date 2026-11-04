import assert from 'node:assert/strict';
import { readStateCookie, redirectUris, redirectForOrigin, validStateRecord } from '../src/server/kakaoHosting';

// Pure functions only: no Firebase SDK, credentials, HTTP calls or database access.
const oldUri = 'https://itbody.ai.studio/?kakao_callback=1';
const newUri = 'https://itbody.dsoom.com/?kakao_callback=1';
process.env.KAKAO_REDIRECT_URI = oldUri;
process.env.KAKAO_ADDITIONAL_REDIRECT_URIS = newUri;
const nonce = 'a'.repeat(32);
assert.equal(readStateCookie('__session=kakao1.' + nonce), nonce);
assert.equal(readStateCookie('irrelevant=x; __session=kakao1.' + nonce), nonce);
assert.equal(readStateCookie('pt_kakao_state=' + nonce), nonce);
assert.equal(readStateCookie('__session=invalid; pt_kakao_state=' + nonce), '');
assert.equal(readStateCookie('__session=kakao1.' + nonce + '; __session=kakao1.' + nonce), '');
assert.equal(readStateCookie('pt_kakao_state=' + nonce + '; pt_kakao_state=' + nonce), '');
assert.equal(readStateCookie('__session=kakao1.' + nonce + '%00'), '');
assert.equal(readStateCookie('x'.repeat(8193)), '');
assert.equal(redirectForOrigin('https://itbody.ai.studio'), oldUri);
assert.equal(redirectForOrigin('https://itbody.dsoom.com'), newUri);
for (const origin of ['https://itbody.dsoom.com.evil.test', 'https://itbody.dsoom.com/', 'http://itbody.dsoom.com', undefined, ['https://itbody.dsoom.com']]) {
  assert.equal(redirectForOrigin(origin), undefined);
}
assert.deepEqual(redirectUris({ KAKAO_REDIRECT_URI: 'https://user:pass@itbody.dsoom.com/?kakao_callback=1' }), []);
const record = { used: false, expiresAt: 2000, redirectUri: newUri };
assert.equal(validStateRecord(record, 'https://itbody.dsoom.com', oldUri, 1000), true);
assert.equal(validStateRecord(record, 'https://itbody.ai.studio', oldUri, 1000), false);
assert.equal(validStateRecord({ ...record, used: true }, 'https://itbody.dsoom.com', oldUri, 1000), false);
assert.equal(validStateRecord(record, 'https://itbody.dsoom.com', oldUri, 2000), false);
assert.equal(validStateRecord({ ...record, expiresAt: '2000' }, 'https://itbody.dsoom.com', oldUri, 1000), false);
assert.equal(validStateRecord({ used: false, expiresAt: 2000 }, 'https://itbody.ai.studio', oldUri, 1000), true);
assert.equal(validStateRecord({ used: false, expiresAt: 2000 }, 'https://itbody.dsoom.com', oldUri, 1000), false);
console.log('Kakao Hosting pure-function checks passed (no network or database).');
