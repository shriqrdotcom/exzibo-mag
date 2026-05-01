# CRIMSONLUXE — Luxury Restaurant Management SaaS

## Overview
A high-fidelity frontend prototype for a luxury dark-themed restaurant management SaaS platform. Features a cinematic, premium aesthetic (obsidian black and crimson red) and provides interfaces for Super Admins, Restaurant Owners (Admins), and customers.

## Tech Stack
- **Framework**: React 19 + Vite
- **Routing**: React Router DOM v7
- **Icons**: Lucide React, React Icons
- **Styling**: Plain CSS (glassmorphism, dark theme, crimson accents)
- **Other**: Leaflet (maps), react-image-crop

## Project Structure
- `src/pages/` — Main view components (Landing, AdminDashboard, SuperAdminDashboard, RestaurantWebsite, etc.)
- `src/components/` — Reusable UI elements (Sidebar, AdminHeader, PermissionGate, modals)
- `src/context/` — React Context providers (RoleContext for RBAC, AnalyticsContext)
- `src/lib/` — Utilities (local notification system via localStorage)
- `public/` — Static assets (menu images, icons)
- `attached_assets/` — Design references and screenshots

## Data & Auth
- **No backend** — all data is persisted via localStorage or hardcoded in contexts
- **No external auth** — roles managed via RoleContext (Super Admin, Admin, Manager, Staff, Customer)
- **No external integrations** — fully self-contained frontend

## Running
- Dev server: `npm run dev` (port 5000, host 0.0.0.0)
- Build: `npm run build`
- Vite config: `allowedHosts: true` for Replit proxy compatibility

## Routes
- `/` — Landing page
- `/dashboard` — Super Admin dashboard
- `/super-admin` — Super Admin panel
- `/admin/:id` — Restaurant Admin panel (orders, bookings, menu, analytics)
- `/master-control` — Master control panel
- `/restaurant/:slug` — Customer-facing restaurant website
