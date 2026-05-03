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

## Real-Time Architecture
Supabase Realtime channels are used for cross-device live sync. Each channel uses filtered `postgres_changes` subscriptions so clients only receive events for their restaurant. A polling fallback runs in parallel so no event is ever permanently missed.

| Page | Channel | Tables subscribed | Fallback poll |
|---|---|---|---|
| AdminDashboard | `rt-orders-{id}` | `orders` | 10 s |
| AdminDashboard | `rt-bookings-{id}` | `bookings` | 15 s |
| RestaurantWebsite | `rt-menu-{id}` | `menu_items`, `menu_categories` | 20 s |
| RestaurantWebsite | `rt-order-status-{id}` | `orders` (UPDATE only) | — |
| Restaurants list | `rt-restaurants` | `restaurants` | — |

On INSERT: new row prepended to local state + localStorage cache updated.
On UPDATE: row patched in place.
On DELETE: row removed.
All realtime handlers also call `notifyAnalyticsUpdate()` so analytics recompute live.

## Field Normalization (snake_case ↔ camelCase)
The Supabase `orders` table uses snake_case columns (`table_number`, `customer_name`, `customer_phone`, `customer_location`, `total`, `created_at`). AdminDashboard and RestaurantWebsite work in camelCase (`table`, `customerName`, `phone`, `location`, `grandTotal`, `submittedAt`). Two exported helpers in `src/lib/db.js` bridge this gap:
- `normalizeOrder(row)` — converts a DB row to the camelCase shape all UI components expect
- `normalizeBooking(row)` — same for bookings (`customer_name` → `name`, etc.)

Both `getOrders` and `getBookings` run every returned row through these normalizers.
Both `createOrder` and `createBooking` accept camelCase input and map it to snake_case before inserting.
The AdminDashboard realtime handlers wrap `payload.new` with the normalizer before adding to React state.

## Customer → Supabase Order & Booking Flow
When a customer places an order or table booking on the public restaurant page (`/restaurant/:slug`):
1. The order/booking is written to localStorage (same-device fallback, always works).
2. If the `restaurant.id` is a valid Supabase UUID, a fire-and-forget `.insert()` is also sent to Supabase via the anon key — no auth required (`public_insert_orders` / `public_insert_bookings` RLS policies allow this).
3. The AdminDashboard's existing `rt-orders-{id}` / `rt-bookings-{id}` realtime channels immediately receive the INSERT event and display the new order/booking across ALL devices signed into that admin panel.
4. When the admin confirms/cancels an order, the `rt-order-status-{id}` channel on the customer page receives the UPDATE event and reflects the new status instantly without a page refresh.

**Required SQL:** Run `supabase/realtime_public_access.sql` once in the Supabase SQL Editor to add `public_read_orders` and `public_read_bookings` SELECT policies. Without these, anon clients can insert but not subscribe to realtime status updates.

## Private Access System
All protected routes require the signed-in user's email to exist in the `allowed_users` Supabase table. This is enforced server-side via a `SECURITY DEFINER` RPC function (`is_user_allowed()`):

- **No public signup** — email/password signup UI is removed; the login page shows Google OAuth only.
- **Allowlist validation** — after every login and token refresh, `supabase.rpc('is_user_allowed')` is called. This runs a `SECURITY DEFINER` Postgres function that checks the email against `allowed_users` (bypassing RLS). The table itself is never accessible from the client.
- **Instant denial** — if the email is not in the allowlist or `is_active = false`, `supabase.auth.signOut()` is called immediately and `accessDenied` is set to `true` in `AuthContext`. The user is redirected to `/auth` and sees an "Access Denied" message.
- **Token refresh re-validation** — every token refresh triggers re-validation, so removing a user from the allowlist takes effect on their next refresh (within the JWT TTL).
- **No hardcoded emails** — emails live only in the Supabase database; none appear in source code.

**To add an authorized user:** Run this SQL in your Supabase SQL Editor:
```sql
INSERT INTO public.allowed_users (email, role)
VALUES ('their-gmail@gmail.com', 'admin');
```

**Setup:** Run `supabase/allowed_users_setup.sql` once in Supabase SQL Editor, then insert your two Gmail accounts.

## Database Setup
1. Run `supabase/schema.sql` in your Supabase project's SQL Editor to create all tables and RLS policies.
2. **Run `supabase/realtime_setup.sql`** to enable Postgres logical replication for `orders`, `bookings`, `restaurants`, `menu_items`, `menu_categories`. **Required for cross-device live sync.**
3. **Run `supabase/realtime_public_access.sql`** to add public SELECT policies on `orders` and `bookings`. **Required for customer-side realtime order-status subscription and for INSERT … RETURNING to succeed from the anon key.**
3. Run `supabase/storage_setup.sql` to create the `restaurant-images` and `menu-images` storage buckets and their access policies.
4. Optionally run `supabase/migration_public_restaurant_read.sql` to add the public SELECT policy on the `restaurants` table (required for the public `/restaurant/:slug` page).
5. Optionally run `supabase/migration_restaurants.sql` to add extended columns to the `restaurants` table.
