# Exzibo — Restaurant Management SaaS

## Overview
A full-stack restaurant management SaaS platform. Features a cinematic dark theme (obsidian black + crimson red) with interfaces for Super Admins, Restaurant Owners, and customers.

## Tech Stack
- **Framework**: React 19 + Vite 8
- **Routing**: React Router DOM v7
- **Backend**: Express (`server.js` in production, Vite dev middlewares in dev) + Neon PostgreSQL via Drizzle ORM
- **Auth**: Better Auth (Google OAuth in production; `VITE_DISABLE_AUTH=true` bypass in dev)
- **Rate limiting / dedup**: Upstash Redis
- **File storage**: R2 (`src/lib/r2.js`)
- **Icons**: Lucide React, React Icons
- **Styling**: Plain CSS / inline styles (glassmorphism, dark theme, crimson accents)
- **Other**: Leaflet (maps), react-image-crop

Note: Supabase (auth/DB/realtime/storage) has been fully removed from this codebase. All data now flows through Neon Postgres via Drizzle (`src/db/*`), auth through Better Auth (`src/lib/auth.server.js`, `src/lib/auth-client.js`), and file uploads through R2.

## Project Structure
- `src/pages/` — Main view components (Landing, Auth, AdminDashboard, SuperAdminDashboard, RestaurantWebsite, etc.)
- `src/components/` — Reusable UI elements (Sidebar, AdminHeader, PermissionGate, modals)
- `src/context/` — React Context providers (RBAC, Analytics)
- `src/db/` — Drizzle schema + Neon query modules (`neon-restaurants.js`, `neon-menu-items.js`, `neon-orders.js`, `neon-bookings.js`, etc.)
- `src/lib/` — Utilities: `auth.server.js`/`auth-client.js` (Better Auth), `db.js` (service layer), `upstash.server.js` (rate limiting), `r2.js` (file storage), `env.js`
- `api/` — Vercel-style API handlers (auth, auth-check) used in production
- `public/` — Static assets (menu images, icons)
- `supabase/` — Legacy SQL migration files, retained for historical reference only; no longer used

## Environment Variables (Secrets)
Configured in Replit Secrets:
- `DATABASE_URL` — Neon/Replit PostgreSQL connection string (set; schema pushed via `npm run db:push`)

Referenced by the app but not yet set in this Replit environment (dev mode works without them thanks to `VITE_DISABLE_AUTH=true`; needed for real Google sign-in, production, or rate limiting):
- `BETTER_AUTH_SECRET` — random 32+ char string
- `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` — OAuth callback + allowed origins
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `SUPERADMIN_ALLOWED_EMAILS` — comma-separated allowlist for the superadmin panel
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting + duplicate prevention

See `.env.example` for the full reference (that file also lists Vercel-specific deployment values not relevant to Replit dev).

## Running
- Dev server: `npm run dev` (Vite, port 5000, host 0.0.0.0) — bound to the "Start application" workflow
- Build: `npm run build`
- Production: `npm start` (Express server serves built `dist/` + API routes)
- DB schema sync: `npm run db:push` (Drizzle Kit push against `DATABASE_URL`)
- Vite config: `allowedHosts: true` for Replit proxy compatibility

## Auth & Data
- **Auth**: Better Auth, Google OAuth in production. Only allowlisted emails can access the superadmin panel (`SUPERADMIN_ALLOWED_EMAILS`).
- **Dev mode**: `VITE_DISABLE_AUTH=true` (set in `.replit` development env) bypasses auth and injects a mock super-admin user — never set in production.
- **Database**: Neon PostgreSQL via Drizzle ORM. Tables include `restaurants`, `menu_items`, `menu_categories`, `orders`, `bookings`, `team_members`, `restaurant_about`, `audit_logs`, plus Better Auth's own session/user/account tables.
- **Service layer**: `src/db/*` — per-entity Neon query modules; `server.js` and `vite.config.js` dev middlewares route `/api/*` to them.
- **Real-time**: `src/lib/realtime-publisher.js` (replaces the old Supabase Realtime channels; polling-based on the client).

## Replit Compatibility Notes
- `vite.config.js` has `server.allowedHosts: true` — required for Replit's proxy iframe
- `src/lib/env.js` detects Replit/localhost and sets preview-mode flags
- `npm run dev` uses the locally installed `vite` binary (not `npx vite`) to avoid install prompts
- API routes in `vite.config.js` (dev) and `server.js` (prod) handle all `/api/*` traffic (menu, orders, bookings, restaurant CRUD, restaurant-db provisioning, etc.)

## User Preferences
- `VITE_DISABLE_AUTH=true` is the correct dev workflow on Replit (bypasses Google OAuth which requires a redirect URI)

## Routes
### Public
- `/` — Landing page
- `/auth` — Login / Sign up
- `/restaurant/:slug` — Customer-facing restaurant website
- `/r/:slug` — Short URL alias for restaurant website
- `/menu/:linkName` — Digital menu (QR-code ready)
- `/table` — Table-specific ordering

### Protected (requires login)
- `/dashboard` — Admin dashboard (restaurant list, revenue)
- `/super-admin` — Super Admin staff management
- `/admin/:id` — Restaurant Admin panel (orders, bookings, menu, analytics)
- `/admin/:id/team` — Team members list
- `/admin/:id/profile` — Restaurant profile
- `/master-control` — Master control panel
- `/team-members` — Team members admin
- `/settings` — App settings
- `/create-website` — Restaurant website builder
- `/restaurants` — Restaurant listing

## Replit Import Setup Notes
- Installed dependencies with `pnpm install` (this project uses pnpm; `vite` was missing until this ran, which is why the workflow initially failed with `vite: not found`).
- Ran `npm run db:push` to push the Drizzle schema to the Replit-provisioned Neon/Postgres database (the `restaurants` table etc. didn't exist yet, causing 500s on load).
- `DATABASE_URL` is set; Better Auth / Google OAuth / Upstash secrets are not set yet — not required for the dev workflow since `VITE_DISABLE_AUTH=true`, but will be needed before enabling real auth or rate limiting.
