---
name: DashboardApp pageSlug param extraction
description: Why DashboardApp must use a single dynamic /:restaurantSlug/:pageSlug route instead of individual static routes per section.
---

## The Rule
`DashboardApp` must use a **single dynamic route** `/:restaurantSlug/:pageSlug` (plus a separate `/:restaurantSlug/master` before it) rather than individual static paths for each section.

## Why
Static routes like `/:restaurantSlug/profile` only expose `:restaurantSlug` as a URL param. The literal segment `profile` is matched by the router but is NOT captured as a named param. So `useParams()` returns `{restaurantSlug}` only, and `pageSlug` in `RestaurantDashboard` always defaults to `'orders'`. This made the `if (pageSlug === 'profile') return <ProfilePage>` check unreachable.

## How to Apply
- `DashboardApp` routes in `App.jsx`: one `/:restaurantSlug/master` (special handler) + one `/:restaurantSlug/:pageSlug` (catches all sections) + `/:restaurantSlug` (base redirect).
- Role-name slugs (`owner`, `admin`, `staff`, `menu_studio`, `manager`, `employee`, `dashboard`) that previously had dedicated `RoleSlugRedirect` routes are now caught by the dynamic route and redirected inside `RestaurantDashboard` via `ROLE_SLUG_PAGES.has(pageSlug)` → `<Navigate to={...orders} replace />`.
- `useParams()` in `RestaurantDashboard` correctly returns both `{restaurantSlug, pageSlug}` with this setup.
