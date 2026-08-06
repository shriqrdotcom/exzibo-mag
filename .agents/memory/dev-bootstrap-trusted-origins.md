---
name: Dev bootstrap trusted origins
description: Better Auth rejects the dev-bootstrap POST unless localhost and the Replit dev domain are in trustedOrigins.
---

# Dev bootstrap trusted origins

## The rule
`getTrustedAuthOrigins()` in `src/lib/auth-origins.js` must include `http://localhost:5000`, `http://127.0.0.1:5000`, and `https://${REPLIT_DEV_DOMAIN}` when not in production (`VERCEL_ENV !== 'production'`). Without these, Better Auth logs "Invalid origin" and the dev-bootstrap POST returns an error, leaving every API call returning 401.

**Why:** Better Auth's CSRF check validates the `Origin` header against `trustedOrigins`. The hardcoded `AUTH_WEB_ORIGINS` only lists the two production domains. Dev origins were added to `allowedHosts` (for cookies) but never to `trustedOrigins` (for CSRF), creating a gap.

**How to apply:** Any time dev-bootstrap-related 401s appear after a fresh import, check that `getTrustedAuthOrigins` still includes the dev branch. Also ensure `DEV_AUTH_BOOTSTRAP=true` is set in `.replit [userenv.development]` — the endpoint silently returns NOT_FOUND without it.
