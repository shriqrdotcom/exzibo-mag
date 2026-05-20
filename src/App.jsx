import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AnalyticsProvider } from './context/AnalyticsContext'
import { RoleProvider } from './context/RoleContext'
import { getSubdomain } from './lib/subdomain'
import { getRestaurantBySlug } from './lib/db'

import Landing              from './pages/Landing'
import Auth                 from './pages/Auth'
import Dashboard            from './pages/Dashboard'
import Settings             from './pages/Settings'
import CreateWebsite        from './pages/CreateWebsite'
import Restaurants          from './pages/Restaurants'
import RestaurantWebsite    from './pages/RestaurantWebsite'
import FoodDetail           from './pages/FoodDetail'
import AdminDashboard       from './pages/AdminDashboard'
import TeamMembers          from './pages/TeamMembers'
import SuperAdminDashboard  from './pages/SuperAdminDashboard'
import TeamMembersAdmin     from './pages/TeamMembersAdmin'
import TablePage            from './pages/TablePage'
import MenuLinkRoute        from './pages/MenuLinkRoute'
import MasterControl        from './pages/MasterControl'
import ProfilePage          from './pages/ProfilePage'
import EditProfile          from './pages/EditProfile'
import NotificationsPage    from './pages/NotificationsPage'
import InformationPage      from './pages/InformationPage'
import DeletedRestaurants   from './pages/DeletedRestaurants'
import DynamicRoute         from './pages/DynamicRoute'

// ── Full-screen loader ──────────────────────────────────────────────────────
function GlobalLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0A0A0A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          border: '3px solid rgba(232,50,26,0.2)',
          borderTopColor: '#E8321A',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 14px',
        }} />
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px', color: '#444',
          fontWeight: 700, letterSpacing: '0.1em',
        }}>LOADING…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Simple 404 page ─────────────────────────────────────────────────────────
function NotFound({ message }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '12px',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ fontSize: '48px', fontWeight: 800, color: '#222' }}>404</div>
      <div style={{ color: '#555', fontSize: '14px' }}>
        {message || 'Page not found'}
      </div>
    </div>
  )
}

// ── Protected route guard ────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) {
    const intended = location.pathname + location.search
    if (intended !== '/auth') localStorage.setItem('auth_redirect', intended)
    return <Navigate to="/auth" replace />
  }
  return children
}

// ── SuperAdmin guard — must be authenticated AND isSuperAdmin ───────────────
function SuperAdminRoute({ children }) {
  const { user, loading, isSuperAdmin } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) {
    const intended = location.pathname + location.search
    if (intended !== '/auth') localStorage.setItem('auth_redirect', intended)
    return <Navigate to="/auth" replace />
  }
  if (!isSuperAdmin) return <Navigate to="/auth" replace />
  return children
}

// ── Slug resolver — only used for master-control redirect ───────────────────
// For admin/section routes, SlugAdminRoute renders AdminDashboard in-place
// so the pretty slug URL is preserved in the address bar.
function SlugResolver({ subPath }) {
  const { restaurantSlug } = useParams()
  const navigate = useNavigate()
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!restaurantSlug) { setNotFound(true); return }
    getRestaurantBySlug(restaurantSlug)
      .then(restaurant => {
        if (!restaurant || !restaurant.id) { setNotFound(true); return }
        if (subPath === 'master') {
          const target = restaurant.uid
            ? `/master-control/${restaurant.uid}`
            : '/master-control'
          navigate(target, { replace: true })
        }
      })
      .catch(() => setNotFound(true))
  }, [restaurantSlug, subPath, navigate])

  if (notFound) return <NotFound message={`Restaurant "${restaurantSlug}" not found`} />
  return <GlobalLoader />
}

// ── Slug-admin route — renders AdminDashboard in-place (no URL redirect) ───
// Resolves :restaurantSlug → restaurant UUID, then renders AdminDashboard
// directly so the address bar keeps the clean slug-based URL.
//
// Props:
//   section — initial nav tab: "orders" | "tables" | "menu" |
//             "analytics" | "dashboard"  (default: "orders")
function SlugAdminRoute({ section }) {
  const { restaurantSlug } = useParams()
  const [restaurantId, setRestaurantId] = useState(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!restaurantSlug) { setNotFound(true); return }
    getRestaurantBySlug(restaurantSlug)
      .then(restaurant => {
        if (!restaurant?.id) { setNotFound(true); return }
        setRestaurantId(restaurant.id)
      })
      .catch(() => setNotFound(true))
  }, [restaurantSlug])

  if (notFound) return <NotFound message={`Restaurant "${restaurantSlug}" not found`} />
  if (!restaurantId) return <GlobalLoader />
  return <AdminDashboard restaurantId={restaurantId} initialSection={section} />
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPERADMIN SUBDOMAIN APP   superadmin.exzibo.online
//
// Serves ONLY the Super Admin god-mode dashboard. Restaurant role pages
// (Admin, Manager, Staff, Master Control) are intentionally excluded — they
// live exclusively on dashboard.exzibo.online (DashboardApp below).
//
// Routes:
//   /                         → Landing page (public entry point)
//   /auth                     → Auth (login)
//   /dashboard                → SuperAdminDashboard — "OPEN DASHBOARD" lands here
//   /team-members             → Team Members admin (sidebar)
//   /table                    → Table page (sidebar)
//   /settings                 → Settings (sidebar)
//   /notifications            → Notifications (sidebar)
//   /deleted-restaurants      → Deleted restaurants (sidebar)
//   /information              → Information page (sidebar)
//   /restaurants              → Restaurants list
//   /create-website           → Website builder
//   /profile                  → Profile page
//   /edit-profile             → Edit profile
//   /restaurant/:slug         → Public restaurant website (preview only)
//   *                         → redirect to /
// ═══════════════════════════════════════════════════════════════════════════
function SuperAdminApp() {
  const { loading, user } = useAuth()
  const navigate = useNavigate()

  // After login, restore the original intended destination (e.g. /dashboard)
  useEffect(() => {
    if (!loading && user) {
      const saved = localStorage.getItem('auth_redirect')
      if (saved) {
        localStorage.removeItem('auth_redirect')
        const safe = saved.startsWith('/') && !saved.startsWith('//') && !saved.startsWith('/auth')
        if (safe) navigate(saved, { replace: true })
      }
    }
  }, [loading, user, navigate])

  if (loading) return <GlobalLoader />

  return (
    <Routes>
      {/* Public entry point */}
      <Route path="/"    element={<Landing />} />
      <Route path="/auth" element={<Auth />} />

      {/* Public customer-facing pages (restaurant preview / demo / themes) */}
      <Route path="/restaurant/:slug"                element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug/food/:itemName" element={<FoodDetail />} />
      <Route path="/r/:slug"                         element={<RestaurantWebsite />} />

      {/* ── Superadmin-protected routes ── */}

      {/* Main dashboard — "OPEN DASHBOARD" from Landing leads here */}
      <Route path="/dashboard"
        element={<SuperAdminRoute><Dashboard /></SuperAdminRoute>} />

      {/* Sidebar nav items */}
      <Route path="/team-members"
        element={<SuperAdminRoute><TeamMembersAdmin /></SuperAdminRoute>} />
      <Route path="/table"
        element={<SuperAdminRoute><TablePage /></SuperAdminRoute>} />
      <Route path="/settings"
        element={<SuperAdminRoute><Settings /></SuperAdminRoute>} />
      <Route path="/notifications"
        element={<SuperAdminRoute><NotificationsPage /></SuperAdminRoute>} />
      <Route path="/deleted-restaurants"
        element={<SuperAdminRoute><DeletedRestaurants /></SuperAdminRoute>} />
      <Route path="/information"
        element={<SuperAdminRoute><InformationPage /></SuperAdminRoute>} />

      {/* Other linked pages */}
      <Route path="/restaurants"
        element={<SuperAdminRoute><Restaurants /></SuperAdminRoute>} />
      <Route path="/create-website"
        element={<SuperAdminRoute><CreateWebsite /></SuperAdminRoute>} />
      <Route path="/profile"
        element={<SuperAdminRoute><ProfilePage /></SuperAdminRoute>} />
      <Route path="/edit-profile"
        element={<SuperAdminRoute><EditProfile /></SuperAdminRoute>} />
      <Route path="/dynamic-route"
        element={<SuperAdminRoute><DynamicRoute /></SuperAdminRoute>} />

      {/* Master Control — available on superadmin subdomain too */}
      <Route path="/master-control"      element={<MasterControl />} />
      <Route path="/master-control/:uid" element={<MasterControl />} />

      {/* Admin panel — reached via Master Control navigation */}
      <Route path="/admin/:id"           element={<AdminDashboard />} />
      <Route path="/admin/:id/team"      element={<TeamMembers />} />
      <Route path="/admin/:id/profile"   element={<ProfilePage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU SUBDOMAIN APP   menu.exzibo.online
//
// Fully public — no auth required.
//
// Routes:
//   /:restaurantSlug              → public restaurant website / menu
//   /:restaurantSlug/:pageSlug    → sub-page (e.g. food detail)
//   *                             → 404
// ═══════════════════════════════════════════════════════════════════════════
function MenuApp() {
  return (
    <Routes>
      {/* Literal segment must come before dynamic :tableNumber to win specificity */}
      <Route path="/:slug/food/:itemName"            element={<FoodDetail />} />
      {/* /:slug/:tableNumber/:page — e.g. /the-taj/5/menu */}
      <Route path="/:slug/:tableNumber/:page"        element={<RestaurantWebsite />} />
      {/* /:slug/:tableNumber — e.g. /the-taj/5 */}
      <Route path="/:slug/:tableNumber"              element={<RestaurantWebsite />} />
      {/* bare slug — e.g. /the-taj */}
      <Route path="/:slug"                           element={<RestaurantWebsite />} />
      <Route path="*"                                element={<NotFound />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD SUBDOMAIN APP   dashboard.exzibo.online
//
// Serves ALL restaurant role-based dashboards. SuperAdmin god-mode pages
// are intentionally excluded — they live on superadmin.exzibo.online.
//
// Public slug routes (resolved via SlugResolver → internal redirect):
//   /:restaurantSlug                  → base dashboard  (default tab)
//   /:restaurantSlug/dashboard        → dashboard tab
//   /:restaurantSlug/orders           → orders tab
//   /:restaurantSlug/tables           → tables tab
//   /:restaurantSlug/menu             → menu tab
//   /:restaurantSlug/analytics        → analytics tab
//
// Role-specific slug routes:
//   /:restaurantSlug/admin            → admin role view
//   /:restaurantSlug/manager          → manager role view
//   /:restaurantSlug/employee         → employee/staff view
//   /:restaurantSlug/master           → master control panel
//
// Internal routes (rendered after SlugResolver redirects):
//   /admin/:id                        → AdminDashboard (owner / role panel)
//   /admin/:id/team                   → Team Members page
//   /admin/:id/profile                → Restaurant profile
//   /master-control                   → Master Control panel
//   /master-control/:uid              → Master Control for a specific restaurant
// ═══════════════════════════════════════════════════════════════════════════
function DashboardApp() {
  const { loading, user } = useAuth()
  const navigate = useNavigate()

  // After login, restore the original intended destination
  useEffect(() => {
    if (!loading && user) {
      const saved = localStorage.getItem('auth_redirect')
      if (saved) {
        localStorage.removeItem('auth_redirect')
        const safe = saved.startsWith('/') && !saved.startsWith('//') && !saved.startsWith('/auth')
        if (safe) navigate(saved, { replace: true })
      }
    }
  }, [loading, user, navigate])

  if (loading) return <GlobalLoader />

  return (
    <Routes>
      {/* Auth */}
      <Route path="/auth" element={<Auth />} />

      {/* ── Section-based slug routes (/{slug}/{section}) ── */}
      {/* SlugAdminRoute renders AdminDashboard in-place — URL stays clean  */}
      <Route path="/:restaurantSlug/dashboard"  element={<SlugAdminRoute section="dashboard" />} />
      <Route path="/:restaurantSlug/orders"     element={<SlugAdminRoute section="orders" />} />
      <Route path="/:restaurantSlug/tables"     element={<SlugAdminRoute section="tables" />} />
      <Route path="/:restaurantSlug/menu"       element={<SlugAdminRoute section="menu" />} />
      <Route path="/:restaurantSlug/analytics"  element={<SlugAdminRoute section="analytics" />} />

      {/* ── Role-based slug routes ── */}
      <Route path="/:restaurantSlug/admin"     element={<SlugAdminRoute />} />
      <Route path="/:restaurantSlug/manager"   element={<SlugAdminRoute />} />
      <Route path="/:restaurantSlug/employee"  element={<SlugAdminRoute />} />
      {/* master still redirects to /master-control/:uid */}
      <Route path="/:restaurantSlug/master"    element={<SlugResolver subPath="master" />} />

      {/* ── Base slug route (no section/role) ── */}
      <Route path="/:restaurantSlug" element={<SlugAdminRoute />} />

      {/* ── Internal routes — rendered after SlugResolver redirects ── */}
      <Route path="/admin/:id"           element={<AdminDashboard />} />
      <Route path="/admin/:id/team"      element={<TeamMembers />} />
      <Route path="/admin/:id/profile"   element={<ProfilePage />} />
      <Route path="/master-control"      element={<MasterControl />} />
      <Route path="/master-control/:uid" element={<MasterControl />} />

      {/* Root */}
      <Route path="/" element={
        user
          ? <NotFound message="Please open a restaurant link, e.g. dashboard.exzibo.online/your-restaurant" />
          : <Navigate to="/auth" replace />
      } />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT APP (dev / Replit preview / main domain)
// All existing routes — completely unchanged. Used when no known subdomain
// is detected (localhost, *.replit.dev, *.replit.app, exzibo.online).
// ═══════════════════════════════════════════════════════════════════════════
function DefaultApp() {
  const { loading, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) {
      const saved = localStorage.getItem('auth_redirect')
      if (saved) {
        localStorage.removeItem('auth_redirect')
        const safe = saved.startsWith('/') && !saved.startsWith('//') && !saved.startsWith('/auth')
        if (safe) navigate(saved, { replace: true })
      }
    }
  }, [loading, user, navigate])

  if (loading) return <GlobalLoader />

  return (
    <Routes>
      {/* Public */}
      <Route path="/"     element={<Landing />} />
      <Route path="/auth" element={<Auth />} />

      {/* Customer-facing — always public */}
      <Route path="/restaurant/:slug/food/:itemName"            element={<FoodDetail />} />
      <Route path="/restaurant/:slug/:tableNumber/:page"        element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug/:tableNumber"              element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug"                           element={<RestaurantWebsite />} />
      <Route path="/r/:slug"                                    element={<RestaurantWebsite />} />
      <Route path="/table"                           element={<TablePage />} />
      <Route path="/menu/:linkName/:tableNumber"     element={<MenuLinkRoute />} />
      <Route path="/menu/:linkName"                  element={<MenuLinkRoute />} />

      {/* Protected — require valid session */}
      <Route path="/dashboard"               element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      {/* Auth temporarily removed from master-control + admin panel routes */}
      <Route path="/master-control"          element={<MasterControl />} />
      <Route path="/master-control/:uid"     element={<MasterControl />} />
      <Route path="/admin/:id"               element={<AdminDashboard />} />
      <Route path="/admin/:id/team"          element={<TeamMembers />} />
      <Route path="/admin/:id/profile"       element={<ProfilePage />} />
      <Route path="/profile"                 element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/super-admin"             element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
      <Route path="/team-members"            element={<ProtectedRoute><TeamMembersAdmin /></ProtectedRoute>} />
      <Route path="/settings"               element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/create-website"          element={<ProtectedRoute><CreateWebsite /></ProtectedRoute>} />
      <Route path="/restaurants"             element={<ProtectedRoute><Restaurants /></ProtectedRoute>} />
      <Route path="/edit-profile"            element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
      <Route path="/notifications"           element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/information"             element={<ProtectedRoute><InformationPage /></ProtectedRoute>} />
      <Route path="/deleted-restaurants"     element={<ProtectedRoute><DeletedRestaurants /></ProtectedRoute>} />
      <Route path="/dynamic-route"           element={<ProtectedRoute><DynamicRoute /></ProtectedRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBDOMAIN ROUTER — picks the right app tree based on hostname
// Evaluated once at module load; subdomains only apply on exzibo.online.
// Dev / Replit / localhost always falls through to DefaultApp.
// ═══════════════════════════════════════════════════════════════════════════
const ACTIVE_SUBDOMAIN = getSubdomain()

function SubdomainRouter() {
  if (ACTIVE_SUBDOMAIN === 'superadmin') return <SuperAdminApp />
  if (ACTIVE_SUBDOMAIN === 'dashboard')  return <DashboardApp />
  if (ACTIVE_SUBDOMAIN === 'menu')       return <MenuApp />
  return <DefaultApp />
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT — providers wrap everything
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <AuthProvider>
      <RoleProvider>
        <AnalyticsProvider>
          <BrowserRouter>
            <SubdomainRouter />
          </BrowserRouter>
        </AnalyticsProvider>
      </RoleProvider>
    </AuthProvider>
  )
}
