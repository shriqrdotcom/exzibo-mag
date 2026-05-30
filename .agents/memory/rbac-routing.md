---
name: RBAC routing layer
description: How the role-based access control routing layer works for the dashboard subdomain.
---

## Architecture

`RestaurantDashboard.jsx` sits between the URL router and `AdminDashboard.jsx`.

Flow: `/:restaurantSlug/:pageSlug` → `RestaurantDashboard` → resolves slug → fetches role via `useRestaurantRole()` → calls `activateRole()` on `RoleContext` → enforces access matrix → renders `AdminDashboard` with `restaurantId` + `initialSection`.

## Key files
- `src/pages/RestaurantDashboard.jsx` — new routing layer
- `src/hooks/useRestaurantRole.js` — queries Supabase RPC `get_my_role_for_restaurant`
- `src/context/RoleContext.jsx` — PERMISSIONS map now includes `menu_studio` (full access), `owner` (full), `admin` (no subscription), `staff` (orders/bookings/profile only)
- `supabase/user_roles_setup.sql` — user_roles table + RLS + RPC

## Roles
- `menu_studio` — platform super-user, all permissions
- `owner` — full restaurant access
- `admin` — everything except subscription
- `staff` — orders, bookings, profile only

## Access control matrix
Unauthorized page access → silent redirect to `/:restaurantSlug/orders`.
`roles` page → redirects to `/admin/:id/team` (existing TeamMembers page).

## Backwards compat
- Old `/:restaurantSlug/*` routes now route to `RestaurantDashboard` instead of `SlugAdminRoute`
- `/admin/:id` routes still work for direct access (legacy)
- `menuStudio` (camelCase) kept as alias in PERMISSIONS for any existing `activateRole('menuStudio')` calls
- `effectiveRole()` in `notifications.js` normalises `menu_studio` → `admin` for notification targeting

**Why:** The spec required a single route tree with Supabase-backed role resolution. The new layer is non-intrusive — AdminDashboard already gates its own UI via `useRole()`, so setting the role before rendering it is sufficient.
