# Exzibo — Restaurant Management SaaS

## Overview
A full-stack restaurant management SaaS platform. Features a cinematic dark theme (obsidian black + crimson red) with interfaces for Super Admins, Restaurant Owners, and customers. Backed by Supabase for auth, database, and real-time data.

## Tech Stack
- **Framework**: React 19 + Vite 8
- **Routing**: React Router DOM v7
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Icons**: Lucide React, React Icons
- **Styling**: Plain CSS / inline styles (glassmorphism, dark theme, crimson accents)
- **Other**: Leaflet (maps), react-image-crop

## Project Structure
- `src/pages/` — Main view components (Landing, Auth, AdminDashboard, SuperAdminDashboard, RestaurantWebsite, etc.)
- `src/components/` — Reusable UI elements (Sidebar, AdminHeader, PermissionGate, modals)
- `src/context/` — React Context providers (AuthContext for Supabase auth, RoleContext for RBAC, AnalyticsContext)
- `src/lib/` — Utilities: `supabase.js` (client), `db.js` (service layer), `notifications.js`, `previewAuth.js`, `env.js`
- `supabase/` — SQL migration files for Supabase (schema, RLS policies, storage, realtime setup)
- `public/` — Static assets (menu images, icons)

## Environment Variables (Secrets)
All secrets are stored in Replit Secrets (never in code):
- `VITE_SUPABASE_URL` — Supabase project URL (used by Vite/browser bundle)
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public key (used by Vite/browser bundle)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only, never exposed to browser)
- `DATABASE_URL` — Replit PostgreSQL connection string (auto-provisioned)
- `PREVIEW_EMAIL` — (optional) Email for dev preview login bypass
- `PREVIEW_PASSWORD_HASH` — (optional) bcrypt hash of preview password
- `PREVIEW_SECRET` — (optional) HMAC secret for preview session tokens

Note: `server.js` (production) reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` first, falling back to `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Since both are set as Replit Secrets, the fallback covers production.

## Running
- Dev server: `npm run dev` (uses locally installed vite, port 5000, host 0.0.0.0)
- Build: `npm run build`
- Production: `npm start` (Express server serves built `dist/` + API routes)
- Vite config: `allowedHosts: true` for Replit proxy compatibility

## Auth & Data
- **Auth**: Supabase Auth (Google OAuth in production). Only allowlisted emails (`exzibonew@gmail.com`, `trisanu07.nandi@gmail.com`) can access the system.
- **Dev mode**: `VITE_DISABLE_AUTH=true` (set in `.replit` development env) bypasses auth and injects a mock super-admin user — never set in production.
- **Preview login**: A separate email+password bypass is built into `vite.config.js` (middleware at `/api/preview-login` and `/api/preview-verify`). Set `PREVIEW_EMAIL` and `PREVIEW_PASSWORD_HASH` secrets to use it. Since Replit is detected as a preview environment (`IS_PREVIEW=true`), the login page shows the preview credentials form instead of Google OAuth.
- **Database**: Supabase PostgreSQL with Row Level Security. Tables: `restaurants`, `menu_items`, `menu_categories`, `orders`, `bookings`, `team_members`, `user_settings`, `allowed_users`.
- **Service layer**: `src/lib/db.js` — typed functions for all Supabase CRUD operations.

## Replit Compatibility Notes
- `vite.config.js` has `server.allowedHosts: true` — required for Replit's proxy iframe
- `src/lib/env.js` detects Replit/localhost (`.replit.app`, `.replit.dev`, `.repl.co`, `localhost`) and sets `IS_PREVIEW=true`, enabling the preview login bypass
- The app is a pure frontend SPA — all Supabase calls happen client-side using the anon key with Row Level Security
- `npm run dev` uses the locally installed `vite` binary (not `npx vite`) to avoid install prompts
- Replit PostgreSQL (`DATABASE_URL`) is used alongside Supabase for isolated per-restaurant schemas (`r_<shortId>`)
- API routes in `vite.config.js` (dev) and `server.js` (prod) handle restaurant DB provisioning (`/api/restaurant-db/*`)

## User Preferences
- Keep Supabase for auth, database, and realtime — it is deeply integrated and holds live data
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

## Image Storage Architecture
All images are stored in Supabase Storage buckets.

| Image type | Bucket | Path pattern |
|---|---|---|
| Restaurant logo | `restaurant-images` | `{restaurantId}/logo/{ts}-{rand}.{ext}` |
| About section image | `restaurant-images` | `{restaurantId}/about/{ts}-{rand}.{ext}` |
| Carousel / hero images | `restaurant-images` | `{restaurantId}/carousel/{ts}-{rand}.{ext}` |
| Menu item images | `menu-images` | `{userId}/{restaurantId}/{ts}.{ext}` |

## Real-Time Architecture
Supabase Realtime channels for cross-device live sync:

| Page | Channel | Tables subscribed |
|---|---|---|
| AdminDashboard | `rt-orders-{id}` | `orders` |
| AdminDashboard | `rt-bookings-{id}` | `bookings` |
| RestaurantWebsite | `rt-menu-{id}` | `menu_items`, `menu_categories` |
| RestaurantWebsite | `rt-order-status-{id}` | `orders` (UPDATE only) |
| Restaurants list | `rt-restaurants` | `restaurants` |

## Database Setup (Supabase SQL Editor)
Run these in order in your Supabase Dashboard → SQL Editor:
1. `supabase/schema.sql` — creates all tables and RLS policies
2. `supabase/realtime_setup.sql` — enables Postgres logical replication
3. `supabase/realtime_public_access.sql` — adds public SELECT policies on orders/bookings
4. `supabase/storage_setup.sql` — creates storage buckets and access policies
5. `supabase/allowed_users_setup.sql` — creates the allowlist table and validation function
6. `supabase/super_admin_setup.sql` — sets up super admin role and RPC
7. `supabase/multi_user_access.sql` — enables team member shared access
8. `supabase/uid_and_publish_setup.sql` — UID system + menu publish control

## Replit Import Notes
- Imported into Replit: installed dependencies with pnpm, ran `npm run db:push` to sync the Drizzle schema to the Replit-managed Postgres database, and configured `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` as Replit Secrets.
- Supabase remains the primary database/auth/realtime provider (per existing user preference above). Replit's built-in Postgres (`DATABASE_URL`) is used as the shadow-write layer via Drizzle (`src/db/*`), as already designed in this codebase.
