# Exzibo — Restaurant Management SaaS

## Overview
A full-stack restaurant management SaaS platform. Features a cinematic dark theme (obsidian black + crimson red) with interfaces for Super Admins, Restaurant Owners, and customers. Backed by Supabase for auth, database, and real-time data.

## Tech Stack
- **Framework**: React 19 + Vite
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
- `supabase/schema.sql` — Full database schema to run in Supabase SQL Editor
- `public/` — Static assets (menu images, icons)
- `attached_assets/` — Design references and screenshots

## Environment Variables (Secrets)
- `VITE_SUPABASE_URL` — Supabase project URL (set in Replit Secrets)
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public key (set in Replit Secrets)
- `PREVIEW_EMAIL` — (optional) Email for dev preview login bypass
- `PREVIEW_PASSWORD` — (optional) Password for dev preview login bypass
- `PREVIEW_SECRET` — (optional) HMAC secret for preview session tokens

## Running
- Dev server: `npm run dev` (port 5000, host 0.0.0.0)
- Build: `npm run build`
- Vite config: `allowedHosts: true` for Replit proxy compatibility

## Auth & Data
- **Auth**: Supabase Auth (Google OAuth in production). Only allowlisted emails can access the system.
- **Preview/Dev mode**: A separate email+password bypass is built into `vite.config.js` (middleware at `/api/preview-login` and `/api/preview-verify`). Set `PREVIEW_EMAIL` and `PREVIEW_PASSWORD` secrets to use it.
- **Database**: Supabase PostgreSQL with Row Level Security. Tables: `restaurants`, `menu_items`, `menu_categories`, `orders`, `bookings`, `team_members`, `user_settings`, `allowed_users`.
- **Service layer**: `src/lib/db.js` — typed functions for all Supabase CRUD operations.

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
All images are stored exclusively in Supabase Storage — no base64 blobs in localStorage or the database.

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
1. Run `supabase/schema.sql` — creates all tables and RLS policies
2. Run `supabase/realtime_setup.sql` — enables Postgres logical replication
3. Run `supabase/realtime_public_access.sql` — adds public SELECT policies on orders/bookings
4. Run `supabase/storage_setup.sql` — creates storage buckets and access policies
5. Run `supabase/allowed_users_setup.sql` — creates the allowlist table and validation function
6. Run `supabase/super_admin_setup.sql` — sets up super admin role and RPC
7. Run `supabase/multi_user_access.sql` — enables team member shared access
8. Optionally run `supabase/uid_and_publish_setup.sql` — UID system + menu publish control
