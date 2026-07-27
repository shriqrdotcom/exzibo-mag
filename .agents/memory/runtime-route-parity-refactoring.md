---
name: Runtime route parity refactoring
description: Consolidation of duplicated business logic across Vercel/Express/Vite into shared canonical modules.
---

# Runtime route parity refactoring

## Shared modules created

### `api/_lib/table-validation.js`
Extracted from inline duplicates in `server.js` and `vite.config.js`.

- `INVALID_TABLE_HTML` — Canonical 404 HTML page for invalid table numbers
- `extractTableParams(urlPath)` — Extracts {slug, tableNumber} from URL path
- `isTableValid(slug, tableNumber)` — Checks table number against restaurant's `table_numbers` JSONB array in Neon

**Why:** Both runtimes had identical copies (~100 lines each) of table validation logic with their own cache, path parsing, and DB queries. Any bug fix or security hardening had to be applied in two places.

**How to apply:** Import from `../../api/_lib/table-validation.js` (or similar relative path) in any runtime adapter that needs table validation. No runtime adapter should define its own `_extractTableParams`, `_isTableValid`, or `INVALID_TABLE_HTML`.

### `api/_lib/preview-auth.js`
Extracted from inline duplicates in `server.js` and `vite.config.js`.

- `PREVIEW_TOKEN_*` constants (token lifetime, version, issuer, audience, clock skew)
- `createPreviewToken(subject, secret)` — HMAC-signed v1 token
- `verifyPreviewToken(token, secret)` — timingSafeEqual signature + claim validation
- `previewCookieOptions(maxAge)` — returns { httpOnly, secure, sameSite, path, maxAge }
- `clearPreviewCookie(res)` — overloaded: Express `res.clearCookie` or raw `setHeader` for raw Node responses
- `handlePreviewLogin(req)` — takes `req.body`, returns `{ status, body, token?, maxAge? }`
- `handlePreviewVerify(req)` — takes `req.cookies.preview_token`, returns `{ status, body }`

**Why:** Both runtimes had identical copies (~230 lines each) of preview auth including HMAC signing, claim validation, rate limiting, body parsing, etc. Security-critical HMAC logic duplicated across files.

**How to apply:** Import from `../../api/_lib/preview-auth.js` in any runtime adapter. Runtime-specific cookie setting is handled by the caller (Express `res.cookie` vs raw `res.setHeader`).

## Runtime adapter changes

All Vite/Express route handlers now:
- Delegate to canonical services (createOrderAtomic, createBookingAtomic, etc.)
- Use shared validation and auth from `api/_lib/`
- Are thin HTTP dispatchers — no independent business rules
