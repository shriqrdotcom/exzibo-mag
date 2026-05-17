import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AnalyticsProvider } from './context/AnalyticsContext'
import { RoleProvider } from './context/RoleContext'
import { getSubdomain } from './lib/subdomain'
import { getRestaurants } from './lib/db'

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

// ── Slug resolver for dashboard subdomain ───────────────────────────────────
// Reads :restaurantSlug from URL params, fetches the restaurant list,
// finds the matching row, then renders the target component by redirecting
// to an internal route that carries the resolved :id. Role subPaths map
// directly to the corresponding internal route.
//
// Supported subPaths and their internal targets:
//   (none)      → /admin/:id              base dashboard
//   "admin"     → /admin/:id              admin role view
//   "manager"   → /admin/:id              manager role view
//   "employee"  → /admin/:id              employee role view
//   "master"    → /master-control/:uid    super-admin control panel
function SlugResolver({ subPath }) {
  const { restaurantSlug } = useParams()
  const navigate = useNavigate()
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!restaurantSlug) { setNotFound(true); return }
    getRestaurants()
      .then(list => {
        const restaurant = list.find(r => r.slug === restaurantSlug)
        if (!restaurant || !restaurant.id) { setNotFound(true); return }

        let target
        if (subPath === 'master') {
          target = restaurant.uid
            ? `/master-control/${restaurant.uid}`
            : '/master-control'
        } else {
          // base, admin, manager, employee — all render AdminDashboard
          target = `/admin/${restaurant.id}`
        }
        navigate(target, { replace: true })
      })
      .catch(() => setNotFound(true))
  }, [restaurantSlug, subPath, navigate])

  if (notFound) return <NotFound message={`Restaurant "${restaurantSlug}" not found`} />
  return <GlobalLoader />
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPERADMIN SUBDOMAIN APP   superadmin.exzibo.online
//
// Routes:
//   /                         → Landing page (public entry point)
//   /auth                     → Auth (login)
//   /dashboard                → SuperAdminDashboard — "OPEN DASHBOARD" lands here
//   /team-members             → Team Members admin (sidebar)
//   /table                    → Table page (sidebar)
//   /master-control           → Master Control panel (sidebar)
//   /master-control/:uid      → Master Control for a specific restaurant
//   /settings                 → Settings (sidebar)
//   /notifications            → Notifications (sidebar)
//   /deleted-restaurants      → Deleted restaurants (sidebar)
//   /information              → Information page (sidebar)
//   /restaurants              → Restaurants list
//   /create-website           → Website builder
//   /profile                  → Profile page
//   /edit-profile             → Edit profile
//   /admin/:id                → Restaurant admin panel
//   /restaurant/:slug         → Public restaurant website
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
      {/* Auth temporarily removed from master-control + admin panel routes */}
      <Route path="/master-control"
        element={<MasterControl />} />
      <Route path="/master-control/:uid"
        element={<MasterControl />} />
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
      {/* Auth temporarily removed from admin panel routes */}
      <Route path="/admin/:id"
        element={<AdminDashboard />} />
      <Route path="/admin/:id/team"
        element={<TeamMembers />} />
      <Route path="/admin/:id/profile"
        element={<ProfilePage />} />

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
      <Route path="/:slug"                   element={<RestaurantWebsite />} />
      <Route path="/:slug/food/:itemName"    element={<FoodDetail />} />
      <Route path="*"                        element={<NotFound />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD SUBDOMAIN APP   dashboard.exzibo.online
//
// Routes:
//   /                           → login (unauthenticated) or hint (authenticated)
//   /auth                       → Auth page
//   /:restaurantSlug            → base dashboard       (any authenticated user)
//   /:restaurantSlug/admin      → admin role view      (authenticated)
//   /:restaurantSlug/manager    → manager role view    (authenticated)
//   /:restaurantSlug/employee   → employee role view   (authenticated)
//   /:restaurantSlug/master     → master control panel (superadmin only)
//
// Slug resolution: each slug route resolves the restaurant name to its UUID
// via SlugResolver, then renders the appropriate component by redirecting
// to an internal /admin/:id or /master-control/:uid path.
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

      {/* Auth temporarily removed from role routes ── */}
      <Route path="/:restaurantSlug" element={<SlugResolver />} />
      <Route path="/:restaurantSlug/admin"     element={<SlugResolver subPath="admin" />} />
      <Route path="/:restaurantSlug/manager"   element={<SlugResolver subPath="manager" />} />
      <Route path="/:restaurantSlug/employee"  element={<SlugResolver subPath="employee" />} />
      <Route path="/:restaurantSlug/master"    element={<SlugResolver subPath="master" />} />

      {/* ── Internal routes — rendered after SlugResolver redirects ── */}
      {/* Auth temporarily removed from admin panel + master control routes */}
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
      <Route path="/restaurant/:slug"                element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug/food/:itemName" element={<FoodDetail />} />
      <Route path="/r/:slug"                         element={<RestaurantWebsite />} />
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
