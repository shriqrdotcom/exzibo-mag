---
name: Vite dev server query parsing
description: Vite dev server middleware does not populate req.query; parse the URL manually before delegating to Vercel-style handlers.
---

# Vite dev server query parsing

Vite dev server `server.middlewares.use()` handlers receive the raw Node.js `req` object. Unlike Vercel/Express, `req.query` is **not** populated by the framework.

**Rule:** For any API middleware that delegates to a handler expecting `req.query.*`, explicitly parse the query string before invocation:

```js
const queryParams = Object.fromEntries(new URLSearchParams((req.url || '').split('?')[1] || ''))
req.query = queryParams
```

**Why:** The project's API handlers use query params for routing (`action=list`, `action=create`, etc.) and share the same handler module across Vercel, Express, and Vite. Without this shim, the Vite path sees `req.query.action` as `undefined` and returns 400 or routes to the SPA fallback.

**How to apply:** Add this shim in `vite.config.js` for every new query-param API middleware. Also shim `res.status()` and `res.json()` if the Vite response object lacks those Express helpers.
