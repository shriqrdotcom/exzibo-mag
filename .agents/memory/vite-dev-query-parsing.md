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

Vite may bundle `vite.config.js` into `node_modules/.vite-temp` before loading it. Query API handlers must therefore be imported through an absolute `pathToFileURL(path.resolve(__dirname, handlerPath))`, not a relative dynamic import.

**Why:** A relative import works in the source config but resolves from `.vite-temp` at runtime, producing a JSON `500` instead of reaching the shared handler.

**How to apply:** Keep handler-path maps relative for readability, then resolve each mapped path against the project root before calling `import()`.
