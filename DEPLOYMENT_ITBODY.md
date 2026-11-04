# ITBODY custom-domain deployment preparation

Prepared against main commit `1a81fb4d664a6a0c5d0dbd46b2b4fc19ddf69058`.
This change is not a production deployment. No production database tests were run.

## Compatibility change

- OAuth state uses a versioned opaque nonce in `__session`, the cookie Firebase Hosting forwards to Cloud Run.
- Existing direct-origin `pt_kakao_state` cookies remain readable for already-started logins. A malformed or duplicate `__session` never falls back to a legacy cookie.
- Preserve `KAKAO_REDIRECT_URI`. Add exact callbacks with `KAKAO_ADDITIONAL_REDIRECT_URIS` only after registration with Kakao Developers.
- New state documents bind their callback URI; the exchange must originate on that URI's origin. Legacy state documents remain bound to the original URI.
- Member API origin checks use the same explicit allowlist. Existing account, membership, invitation and disabled-account logic is unchanged.
- Production must run with `NODE_ENV=production` for Secure cookies.

## Verified locally

```
npm ci --ignore-scripts --no-audit --no-fund
node --import tsx tests/kakao-hosting-verification.ts
node tests/kakao-hosting-routes.mjs
npm run lint
npm run build
```

The route test replaces all Firebase/account/rate-limit imports at bundle time and replaces fetch. No Firebase SDK, real identity, network or database is used. It covers both callback origins, Hosting-compatible cookies, cookie flags, state mismatch, cross-origin rejection, replay rejection and legacy in-flight login. The helper test also covers expiry, malformed and duplicate cookies and untrusted origins.

## Deployment gates and sequence

1. Use the approved existing session authentication. Do not create CI tokens or additional service accounts.
2. Preserve the existing Cloud Run service `pt-journey`, region `asia-south1`, project `gen-lang-client-0064554427`. Record safe revision and traffic metadata only. Do not open environment-variable or secret screens/responses.
3. Register `https://itbody.dsoom.com/?kakao_callback=1` in the existing Kakao application, preserving all old callbacks. Add the new Firebase Auth authorized domain if required. Obtain any required security-setting approval before saving.
4. Set the additional redirect URI only after step 3. Preserve the original URI and all existing secrets and runtime identity.
5. Build a candidate Cloud Run revision without traffic, preserving the service's current port/resources/secrets. Verify unauthenticated health/status only; do not call OAuth start or member write endpoints against production for testing.
6. Create a dedicated ITBODY Firebase Hosting site. Existing sites in this project belong to other applications and must not be overwritten. Use a separate Hosting-only config with explicit site ID and a catch-all rewrite to `pt-journey`, `asia-south1`. Do not deploy Firestore rules, Storage rules or Functions as part of this domain task.
7. Hosting requests time out after 60 seconds. Review the existing AI API fallback duration before routing all traffic. Do not assume AI requests are covered by the OAuth tests.
8. After candidate validation, switch traffic deliberately and retain the prior revision for rollback. Verify both old URL and new Hosting URL before changing DNS.
9. Add the custom domain in the dedicated Hosting site. Use the exact TXT/A/CNAME records issued by Firebase, only for `itbody.dsoom.com`; preserve other `dsoom.com` records. DNS is managed by hosting.kr and the current browser needs the user's login.
10. Wait for DNS and TLS, then verify HTTPS, application assets, health/status and user-assisted login at both origins. User-assisted login creates normal authentication records; do not simulate production writes automatically.

Existing project uses Blaze. This plan avoids a new load balancer but is not a promise of zero usage charges. Any new paid commitment requires approval.

## Provisioning status (2026-11-04)

- Firebase CLI reauthentication completed; project access verified.
- Created dedicated Hosting site `itbody-cocoadang`; it is awaiting its first release.
- Added `itbody.dsoom.com` to that site. Hosting.kr CNAME `itbody.dsoom.com` -> `itbody-cocoadang.web.app` was saved. TLS validates; the site returns 404 until its first release.
- The new Kakao callback and Firebase Auth authorized domain were added with explicit approval, preserving existing entries.
- Candidate `pt-journey-itbody-77e4577` was deployed with zero production traffic. Home, JS, CSS, health and Kakao status passed read-only checks; server bundle/map paths return 404. Existing `itbody.ai.studio` returns 200.
- That candidate predates the AI deadline change below. No updated candidate, traffic promotion or Hosting release has been performed for this change.
- `firebase.itbody-hosting.json` is an explicit, Hosting-only configuration. Its empty public directory deliberately excludes server bundles, source maps and source files from static hosting. All requests rewrite to the existing Cloud Run service.
- Do not deploy this config until the compatible Cloud Run revision and Kakao callback settings have been prepared and verified. The configuration has not been deployed.

After the gates above, the targeted command is:

```
firebase deploy --config firebase.itbody-hosting.json --only hosting --project gen-lang-client-0064554427
```

References:
- https://firebase.google.com/docs/hosting/manage-cache
- https://firebase.google.com/docs/hosting/cloud-run
- https://firebase.google.com/docs/hosting/custom-domain

## AI deadline analysis and proposed change

Both `/api/ai/session-draft` and `/api/ai/review-draft` previously used up to three sequential model calls without an application deadline. The installed SDK documents five attempts by default, including the original call, so SDK retries can compound the application's fallback on 429/503. Hosting returns 504 after 60 seconds even if Cloud Run has a longer timeout. A slow first model or repeated busy responses can therefore outlive the browser's Hosting request while backend work continues.

The proposed helper shares one 45-second budget across all three models, sets each SDK HTTP timeout to the remaining budget, and disables SDK retries (`attempts: 1`). A timer rejects the application's wait even if the upstream implementation ignores abort; AbortController also asks the SDK to cancel its client request. No new model is started after the deadline. Existing model order, prompts, response schemas and 429/503 fallback conditions are retained.

Both routes return safe 504 JSON for this deadline. The existing client treats non-2xx responses as a signal to use its local heuristic draft; it does not currently display the server's Korean error text. Users may get a less tailored basic draft earlier when generation is slow. Drafts still require trainer review and explicit saving. The same deadline will apply to the old URL if this revision is promoted.

This bounds model generation, not the entire Hosting request. The 15-second margin is for authentication, rate-limit checks, cold start and transport; those operations have not been given new deadlines, and unusually slow startup/authentication can still cause a Hosting 504. Aborting the SDK request does not guarantee that upstream inference stops or that usage is unbilled. No live model calls were made, so latency, quality and success rate are not measured.

Alternatives: retain long generation behind an asynchronous job/polling API (larger API/UI and storage change), or use a separately reviewed routing architecture for long requests (infrastructure, cost and authentication implications). Raising only the Cloud Run timeout does not remove Hosting's 60-second limit.

Offline verification:
```
node --import tsx tests/ai-generation-verification.ts
node tests/ai-timeout-routes.mjs
node --import tsx tests/kakao-hosting-verification.ts
node tests/kakao-hosting-routes.mjs
npm run lint
npm run build
```
The helper tests use synthetic calls and a custom SDK fetch, including success, 429/503 fallback, terminal errors, exhausted attempts, hanging requests, shared remaining time, zero budget, abort and actual SDK retry suppression. Route tests stub all model/auth/database dependencies and verify both 504 responses. No real model or database calls are permitted.
