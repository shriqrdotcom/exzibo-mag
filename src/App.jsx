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
// Reads :slug from URL params, resolves it to a DB uuid, then internally
// redirects to the corresponding /admin/:id route so AdminDashboard can work
// without any modification (it reads `id` from useParams as usual).
function SlugResolver({ subPath }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) { setNotFound(true); return }
    getRestaurantBySlug(slug)
      .then(restaurant => {
        if (!restaurant || !restaurant.id) { setNotFound(true); return }
        const base = `/admin/${restaurant.id}`
        const target =
          subPath === 'master'  ? `${base}?from=master` :
          subPath === 'team'    ? `${base}/team`         :
          subPath === 'profile' ? `${base}/profile`      :
          base
        navigate(target, { replace: true })
      })
      .catch(() => setNotFound(true))
  }, [slug])

  if (notFound) return <NotFound message={`Restaurant "${slug}" not found`} />
  return <GlobalLoader />
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPERADMIN SUBDOMAIN APP   superadmin.exzibo.online
// ═══════════════════════════════════════════════════════════════════════════
function SuperAdminApp() {
  const { loading } = useAuth()
  if (loading) return <GlobalLoader />
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={
        <SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU SUBDOMAIN APP   menu.exzibo.online
// Fully public — no auth required.
// ═══════════════════════════════════════════════════════════════════════════
function MenuApp() {
  return (
    <Routes>
      {/* Primary slug-based routes */}
      <Route path="/:slug"                      element={<RestaurantWebsite />} />
      <Route path="/:slug/food/:itemName"        element={<FoodDetail />} />

      {/* Compatibility aliases — RestaurantWebsite and FoodDetail use navigate()
          with /restaurant/:slug paths internally; these aliases ensure those
          navigations resolve correctly instead of hitting the 404 catch-all. */}
      <Route path="/restaurant/:slug"                element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug/food/:itemName" element={<FoodDetail />} />

      {/* QR / table-order routes */}
      <Route path="/m/:linkName/:tableNumber"    element={<MenuLinkRoute />} />
      <Route path="/m/:linkName"                 element={<MenuLinkRoute />} />
      <Route path="/table"                       element={<TablePage />} />

      {/* Root → 404 (no slug provided) */}
      <Route path="/" element={<NotFound message="Please use a restaurant link, e.g. menu.exzibo.online/your-restaurant" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD SUBDOMAIN APP   dashboard.exzibo.online
// Slug-based entry → resolves to uuid → renders existing admin components.
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
      {/* Auth page for this subdomain */}
      <Route path="/auth" element={<Auth />} />

      {/* Slug-based entry points — each resolves to an internal /admin/:id route */}
      <Route path="/:slug"         element={<ProtectedRoute><SlugResolver /></ProtectedRoute>} />
      <Route path="/:slug/team"    element={<ProtectedRoute><SlugResolver subPath="team" /></ProtectedRoute>} />
      <Route path="/:slug/profile" element={<ProtectedRoute><SlugResolver subPath="profile" /></ProtectedRoute>} />

      {/* Master route: SuperAdmin-gated — slug resolves to /admin/:id?from=master */}
      <Route path="/:slug/master"  element={<SuperAdminRoute><SlugResolver subPath="master" /></SuperAdminRoute>} />

      {/* Internal routes that SlugResolver redirects to (components read :id from params) */}
      <Route path="/admin/:id"         element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/:id/team"    element={<ProtectedRoute><TeamMembers /></ProtectedRoute>} />
      <Route path="/admin/:id/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      {/* MasterControl internal route — rendered after slug/master resolves */}
      <Route path="/master-control"      element={<SuperAdminRoute><MasterControl /></SuperAdminRoute>} />
      <Route path="/master-control/:uid" element={<SuperAdminRoute><MasterControl /></SuperAdminRoute>} />

      {/* Root → prompt for a restaurant */}
      <Route path="/" element={
        user
          ? <NotFound message="Please use a restaurant link, e.g. dashboard.exzibo.online/your-restaurant" />
          : <Navigate to="/auth" replace />
      } />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT APP (dev / Replit / main domain)
// All existing routes — completely unchanged.
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
      <Route path="/master-control"          element={<ProtectedRoute><MasterControl /></ProtectedRoute>} />
      <Route path="/master-control/:uid"     element={<ProtectedRoute><MasterControl /></ProtectedRoute>} />
      <Route path="/admin/:id"               element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/:id/team"          element={<ProtectedRoute><TeamMembers /></ProtectedRoute>} />
      <Route path="/admin/:id/profile"       element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/profile"                 element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/super-admin"             element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
      <Route path="/team-members"            element={<ProtectedRoute><TeamMembersAdmin /></ProtectedRoute>} />
      <Route path="/settings"                element={<ProtectedRoute><Settings /></ProtectedRoute>} />
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
// SUBDOMAIN ROUTER — picks the right app based on hostname
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
