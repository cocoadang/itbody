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

1. Renew the existing Firebase CLI login; action-time OAuth approval is pending. Do not create CI tokens or additional service accounts to work around this.
2. Snapshot the current Cloud Run service `pt-journey`, region `asia-south1`, project `gen-lang-client-0064554427`: image, revision, traffic, runtime identity and environment configuration. Never put secret values in Git.
3. Register `https://itbody.dsoom.com/?kakao_callback=1` in the existing Kakao application, preserving all old callbacks. Add the new Firebase Auth authorized domain if required. Obtain any required security-setting approval before saving.
4. Set the additional redirect URI only after step 3. Preserve the original URI and all existing secrets and runtime identity.
5. Build a candidate Cloud Run revision without traffic, preserving the service's current port/resources/secrets. Verify unauthenticated health/status only; do not call OAuth start or member write endpoints against production for testing.
6. Create a dedicated ITBODY Firebase Hosting site. Existing sites in this project belong to other applications and must not be overwritten. Use a separate Hosting-only config with explicit site ID and a catch-all rewrite to `pt-journey`, `asia-south1`. Do not deploy Firestore rules, Storage rules or Functions as part of this domain task.
7. Hosting requests time out after 60 seconds. Review the existing AI API fallback duration before routing all traffic. Do not assume AI requests are covered by the OAuth tests.
8. After candidate validation, switch traffic deliberately and retain the prior revision for rollback. Verify both old URL and new Hosting URL before changing DNS.
9. Add the custom domain in the dedicated Hosting site. Use the exact TXT/A/CNAME records issued by Firebase, only for `itbody.dsoom.com`; preserve other `dsoom.com` records. DNS is managed by hosting.kr and the current browser needs the user's login.
10. Wait for DNS and TLS, then verify HTTPS, application assets, health/status and user-assisted login at both origins. User-assisted login creates normal authentication records; do not simulate production writes automatically.

Existing project uses Blaze. This plan avoids a new load balancer but is not a promise of zero usage charges. Any new paid commitment requires approval.

References:
- https://firebase.google.com/docs/hosting/manage-cache
- https://firebase.google.com/docs/hosting/cloud-run
- https://firebase.google.com/docs/hosting/custom-domain
