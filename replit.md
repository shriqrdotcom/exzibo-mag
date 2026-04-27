# CRIMSONLUXE

A luxury dark-themed restaurant management web platform with a cinematic, premium aesthetic.

## Architecture

- **Frontend**: React + Vite (single-page app, no backend)
- **Routing**: React Router DOM
- **Icons**: Lucide React
- **Port**: 5000 (dev server)

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `Landing.jsx` | Landing page — cinematic hero with CTA buttons |
| `/dashboard` | `Dashboard.jsx` | Super admin dashboard with KPI cards and enterprise partners table |
| `/admin/:id` | `AdminDashboard.jsx` | **DEFAULT ADMIN PANEL** — per-restaurant admin with Orders, Bookings, Menu, Analytics tabs (mobile-first, light theme, bottom nav bar) |
| `/admin/:id/team` | `TeamMembers.jsx` | Restaurant-specific team view with active/inactive toggles |
| `/super-admin` | `SuperAdminDashboard.jsx` | Super admin staff management (add/edit/delete staff across all restaurants) |
| `/team-members` | `TeamMembersAdmin.jsx` | Team members admin view with per-restaurant role management and role-based preview mode |
| `/settings` | `Settings.jsx` | Profile, security, preferences, session management |
| `/create-website` | `CreateWebsite.jsx` | Deployment console for onboarding new restaurants |
| `/restaurant/:slug` | `RestaurantWebsite.jsx` | Customer-facing restaurant website/menu |
| `/restaurant/:slug/food/:itemName` | `FoodDetail.jsx` | Premium dark-theme food detail page |

## Key Terminology

- **"Default Admin Panel"** → `src/pages/AdminDashboard.jsx` at route `/admin/:id`. Mobile-first light-theme UI with bottom navigation bar (Orders, Bookings, Menu, Analytics, Settings tabs). This is the per-restaurant admin interface seen by restaurant owners/managers.
- **"Super Admin Dashboard"** → `src/pages/SuperAdminDashboard.jsx` at `/super-admin`. Manages all staff across all restaurants.
- **"Dashboard"** → `src/pages/Dashboard.jsx` at `/dashboard`. Top-level admin view with KPI cards.

## Role-Based Access

- **RoleContext** (`src/context/RoleContext.jsx`) — manages preview role state (owner/manager/staff)
- **PermissionGate** (`src/components/PermissionGate.jsx`) — conditionally renders nav items by role
- **RoleBanner** (`src/components/RoleBanner.jsx`) — shown in AdminHeader when previewing a role

## Design System

- **Background**: `#0A0A0A` (obsidian black)
- **Primary Accent**: `#E8321A` (crimson red)
- **Typography**: Inter (bold headings, clean body)
- **UI**: Glassmorphism, rounded cards (18-24px radius), glow effects
- **Animations**: Fade-in, pulse glow, hover transitions

## Notification System

Frontend-only notification system for sending messages from Master Control to Admin/Manager/Staff dashboards.

- **Module**: `src/lib/notifications.js` — all storage + business logic.
- **Send UI**: Black `Send` button in AdminDashboard header (only when `?from=master`). Opens modal with TOPIC + MESSAGE + role checkboxes (Admin/Manager/Staff).
- **Popup**: Auto-shown on dashboard open for the next unconfirmed notification matching the user's role. Confirm marks it confirmed; X dismisses for the session only.
- **Bell**: Header bell icon (only when NOT `?from=master`) with red unread badge. Opens dropdown listing confirmed notifications from the last 24 hours.
- **Storage**: `exzibo_notifications`, `exzibo_notification_reads`, `exzibo_browser_id`, `exzibo_bell_last_opened`. 24-hour expiry pruned on access. Cross-tab sync via `storage` event + custom `exzibo-notifications-changed` event.
- **User identity**: `${browserUuid}::${role}` so each role on the same browser has independent confirm state. `owner`/null role mapped to `admin` for receiving.

## Commands

```bash
npm run dev    # Start dev server on port 5000
npm run build  # Production build
```
