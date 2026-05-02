# Exzibo — Restaurant Management SaaS

## Overview
A full-stack restaurant management SaaS platform. Features a cinematic dark theme (obsidian black + crimson red) with interfaces for Super Admins, Restaurant Owners, and customers. Backed by Supabase for auth, database, and real-time data.

## Tech Stack
- **Framework**: React 19 + Vite
- **Routing**: React Router DOM v7
- **Backend**: Supabase (PostgreSQL + Auth)
- **Icons**: Lucide React, React Icons
- **Styling**: Plain CSS / inline styles (glassmorphism, dark theme, crimson accents)
- **Other**: Leaflet (maps), react-image-crop

## Project Structure
- `src/pages/` — Main view components (Landing, Auth, AdminDashboard, SuperAdminDashboard, RestaurantWebsite, etc.)
- `src/components/` — Reusable UI elements (Sidebar, AdminHeader, PermissionGate, modals)
- `src/context/` — React Context providers (AuthContext for Supabase auth, RoleContext for RBAC, AnalyticsContext)
- `src/lib/` — Utilities: `supabase.js` (client), `db.js` (service layer), `notifications.js`
- `supabase/schema.sql` — Full database schema to run in Supabase SQL Editor
- `public/` — Static assets (menu images, icons)
- `attached_assets/` — Design references and screenshots

## Auth & Data
- **Auth**: Supabase Auth (email/password). Protected routes redirect to `/auth` if unauthenticated.
- **Database**: Supabase PostgreSQL with Row Level Security. Tables: `restaurants`, `menu_items`, `menu_tabs`, `orders`, `bookings`, `team_members`, `user_settings`.
- **Service layer**: `src/lib/db.js` — typed functions for all Supabase CRUD operations.
- **Legacy**: Some pages still use localStorage as a fallback during the Supabase migration.

## Environment Variables (Secrets)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public key

## Running
- Dev server: `npm run dev` (port 5000, host 0.0.0.0)
- Build: `npm run build`
- Vite config: `allowedHosts: true` for Replit proxy compatibility

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

Storage utility functions live in `src/lib/db.js`:
- `uploadToStorage(file, bucket, pathPrefix)` — uploads a File object
- `uploadDataUrlToStorage(dataUrl, bucket, pathPrefix)` — uploads a base64 data URL

Upload sites:
- **Logo**: `ProfileSlide.jsx` `saveLogo()` — uploads then calls `updateRestaurant({logo: url})`
- **Carousel**: `AdminDashboard.jsx` `SettingsPanel.handleCarouselFiles()` — uploads then calls `updateRestaurant({images: urls})`
- **About image**: `AdminDashboard.jsx` `SettingsPanel` save button — uploads before writing localStorage
- **Menu items**: `AdminDashboard.jsx` `MenuPanel` `resolveMenuImage()` — called before DB write

Demo restaurants (restaurantId === 'demo') use base64/localStorage as fallback (no auth session available).

## Database Setup
1. Run `supabase/schema.sql` in your Supabase project's SQL Editor to create all tables and RLS policies.
2. Run `supabase/storage_setup.sql` to create the `restaurant-images` and `menu-images` storage buckets and their access policies.
3. Optionally run `supabase/migration_public_restaurant_read.sql` to add the public SELECT policy on the `restaurants` table (required for the public `/restaurant/:slug` page).
4. Optionally run `supabase/migration_restaurants.sql` to add extended columns to the `restaurants` table.
