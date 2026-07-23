---
name: Admin dashboard responsive layout
description: How the admin dashboard was made responsive — SidebarContext pattern, CSS class conventions, and which pages use them.
---

## Pattern

Every admin page that uses `<Sidebar />` follows the same flex layout:

```jsx
<div className="admin-layout" style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
  <Sidebar />
  <div className="admin-content-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <AdminHeader ... />
    <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
      ...
    </main>
  </div>
</div>
```

The `className` attributes are load-bearing — they activate the mobile responsive CSS rules in `src/index.css`. Without them, the sidebar won't become a drawer, content won't constrain horizontally, and touch targets won't resize.

## Key files

| File | Role |
|------|------|
| `src/context/SidebarContext.jsx` | Provides `sidebarOpen`, `toggleSidebar`, `closeSidebar` |
| `src/components/Sidebar.jsx` | Slide-out drawer on mobile; overlay + transform |
| `src/components/AdminHeader.jsx` | Hamburger button on mobile (≤1023px) |
| `src/index.css` (lines 250+) | All responsive CSS: sidebar drawer, stats grids, tables, modals, touch targets |
| `src/App.jsx` | `SuperAdminApp` and `DashboardApp` wrapped with `<SidebarProvider>` |

## Critical: all three app entry points need SidebarProvider

`DefaultApp`, `SuperAdminApp`, and `DashboardApp` in `src/App.jsx` all render pages that use `<Sidebar>` and `<AdminHeader>`, so ALL THREE must be wrapped with `<SidebarProvider>`. On Replit preview/localhost, `getSubdomain()` returns `null` → `DefaultApp` is used. If it's missing the provider, `useSidebar()` returns the no-op fallback and the hamburger toggle silently does nothing.

## Pages with responsive classes

`admin-layout` + `admin-content-area`: Analytics, Dashboard, DeletedRestaurants, DynamicRoute, MasterControl, MenuPage, Settings, TablePage, TeamMembersAdmin, LiveOrder, NotificationsPage, InformationPage, AddRolePage.
