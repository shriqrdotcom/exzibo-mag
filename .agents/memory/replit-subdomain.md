---
name: Replit subdomain routing fix
description: On Replit/localhost getSubdomain() must return null, not "dashboard", so DefaultApp loads with the full route tree.
---

# Replit subdomain routing fix

On Replit preview and localhost, `getSubdomain()` in `src/lib/subdomain.js` was returning `"dashboard"`, which loads `DashboardApp`. That app expects `/:restaurantSlug/:pageSlug` as the first route segment, so visiting `/` → redirects to `/auth` → with `DISABLE_AUTH=true` the mock user is injected → which navigates to `/dashboard` → treated as a restaurant slug → "Restaurant Not Found" error.

**Fix:** Return `null` for Replit/localhost hostnames so `DefaultApp` loads instead. `DefaultApp` has the full route tree including `/dashboard`, `/auth`, `/master-control`, `/super-admin`, etc.

**Why:** `DashboardApp` is designed for `dashboard.exzibo.online` only — its root route is `/auth` and all other routes are `/:slug/:page` restaurant-scoped. `DefaultApp` is the correct dev/preview app tree.

**How to apply:** In `src/lib/subdomain.js`, the Replit/localhost branch returns `null` (not `"dashboard"`).
