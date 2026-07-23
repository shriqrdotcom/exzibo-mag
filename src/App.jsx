import React, { useEffect, useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AnalyticsProvider } from './context/AnalyticsContext'
import { RoleProvider } from './context/RoleContext'
import { ACTIVE_SUBDOMAIN } from './lib/subdomain'
import { getRestaurantBySlug } from './lib/db'

// ── Menu subdomain redirect — used by SuperAdminApp for /restaurant/* routes ─
// Instead of rendering the restaurant website inside superadmin, redirect the
// browser hard to the canonical menu.exzibo.online/{slug}/home URL.
function MenuRedirect() {
  const { slug } = useParams()
  useEffect(() => {
    if (slug) window.location.replace(`https://menu.exzibo.online/${slug}/home/1`)
  }, [slug])
  return <GlobalLoader />
}

// Menu subdomain pages
// RestaurantWebsite is eagerly loaded — it IS the menu page and contains the
// full MenuSkeleton, so it must be available before any network round-trip.
// FoodDetail is lazy — it only loads when a user taps a specific menu item.
import RestaurantWebsite    from './pages/RestaurantWebsite'
const FoodDetail            = lazy(() => import('./pages/FoodDetail'))

// All other pages — lazy loaded so the menu subdomain never parses their code
const GroceryCategoryGrid  = lazy(() => import('./pages/GroceryCategoryGrid'))
const Landing              = lazy(() => import('./pages/Landing'))
const Auth                 = lazy(() => import('./pages/Auth'))
const Dashboard            = lazy(() => import('./pages/Dashboard'))
const Settings             = lazy(() => import('./pages/Settings'))
const CreateWebsite        = lazy(() => import('./pages/CreateWebsite'))
const Restaurants          = lazy(() => import('./pages/Restaurants'))
const AdminDashboard       = lazy(() => import('./pages/AdminDashboard'))
const RestaurantDashboard  = lazy(() => import('./pages/RestaurantDashboard'))
const TeamMembers          = lazy(() => import('./pages/TeamMembers'))
const SuperAdminDashboard  = lazy(() => import('./pages/SuperAdminDashboard'))
const TeamMembersAdmin     = lazy(() => import('./pages/TeamMembersAdmin'))
const LiveOrder            = lazy(() => import('./pages/LiveOrder'))
const TablePage            = lazy(() => import('./pages/TablePage'))
const MenuLinkRoute        = lazy(() => import('./pages/MenuLinkRoute'))
const MasterControl        = lazy(() => import('./pages/MasterControl'))
const ProfilePage          = lazy(() => import('./pages/ProfilePage'))
const EditProfile          = lazy(() => import('./pages/EditProfile'))
const NotificationsPage    = lazy(() => import('./pages/NotificationsPage'))
const InformationPage      = lazy(() => import('./pages/InformationPage'))
const DeletedRestaurants   = lazy(() => import('./pages/DeletedRestaurants'))
const DynamicRoute         = lazy(() => import('./pages/DynamicRoute'))
const AddRolePage          = lazy(() => import('./pages/AddRolePage'))
const OrderTimePage        = lazy(() => import('./pages/OrderTimePage'))
const RestaurantListing    = lazy(() => import('./pages/RestaurantListing'))
const Favourites           = lazy(() => import('./pages/Favourites'))
import { FavouritesProvider } from './context/FavouritesContext'

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
// Maps the URL path segment (e.g. "booking") to the AdminDashboard section ID
// (e.g. "bookings").  All dashboard.exzibo.online URL slugs go through this.
const SLUG_TO_SECTION = {
  orders:    'orders',
  booking:   'bookings',
  bookings:  'bookings',
  menu:      'menu',
  analytics: 'customers',
  customers: 'customers',
  settings:  'settings',
  profile:   'profile',
  dashboard: 'orders',
  tables:    'orders',
}

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
  // Resolve URL slug → internal section ID (e.g. "booking" → "bookings")
  const resolvedSection = SLUG_TO_SECTION[section] || section || 'orders'
  return <AdminDashboard restaurantId={restaurantId} initialSection={resolvedSection} />
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
    <Suspense fallback={<GlobalLoader />}>
      <Routes>
        {/* Entry point: unauthenticated visitors go straight to the login screen */}
        <Route path="/"    element={user ? <Landing /> : <Navigate to="/auth" replace />} />
        <Route path="/auth" element={<Auth />} />

        {/* Customer-facing pages: redirect to menu.exzibo.online/{slug}/home */}
        <Route path="/restaurant/:slug"                element={<MenuRedirect />} />
        <Route path="/restaurant/:slug/food/:itemName" element={<MenuRedirect />} />
        <Route path="/r/:slug"                         element={<RestaurantWebsite />} />

        {/* ── Superadmin-protected routes ── */}

        {/* Main dashboard — "OPEN DASHBOARD" from Landing leads here */}
        <Route path="/dashboard"
          element={<SuperAdminRoute><Dashboard /></SuperAdminRoute>} />

        {/* Sidebar nav items */}
        <Route path="/live-order"
          element={<SuperAdminRoute><LiveOrder /></SuperAdminRoute>} />
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

        {/* Grocery category grid demo */}
        <Route path="/grocery-grid" element={<GroceryCategoryGrid />} />

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
        <Route path="/add-role"
          element={<SuperAdminRoute><AddRolePage /></SuperAdminRoute>} />
        <Route path="/order-time"
          element={<SuperAdminRoute><OrderTimePage /></SuperAdminRoute>} />

        {/* Menu Studio */}
        <Route path="/master-control"
          element={<SuperAdminRoute><MasterControl /></SuperAdminRoute>} />
        <Route path="/master-control/:uid"
          element={<SuperAdminRoute><MasterControl /></SuperAdminRoute>} />

        {/* Restaurant admin panel — destination after ACCESS PANEL resolves a UID */}
        <Route path="/admin/:id"         element={<SuperAdminRoute><AdminDashboard /></SuperAdminRoute>} />
        <Route path="/admin/:id/team"    element={<SuperAdminRoute><TeamMembers /></SuperAdminRoute>} />
        <Route path="/admin/:id/profile" element={<SuperAdminRoute><ProfilePage /></SuperAdminRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

// ── Redirect helpers for MenuApp ─────────────────────────────────────────────
// /:slug/:page (no table) → /:slug/:page/1  (default to table 1)
function MenuPageRedirect() {
  const { slug, page } = useParams()
  return <Navigate to={`/${slug}/${page}/1`} replace />
}

// /:slug (no page, no table) → /:slug/home/1
function MenuSlugRedirect() {
  const { slug } = useParams()
  return <Navigate to={`/${slug}/home/1`} replace />
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU SUBDOMAIN APP   menu.exzibo.online
//
// Fully public — no auth required.
//
// Route structure:  /:slug/:page/:tableNumber
//   /:slug/home/:tableNumber       → RestaurantWebsite (home tab)
//   /:slug/menu/:tableNumber       → RestaurantWebsite (menu tab)
//   /:slug/cart/:tableNumber       → RestaurantWebsite (cart tab)
//   /:slug/orders/:tableNumber     → RestaurantWebsite (orders tab)
//   /:slug/booking/:tableNumber    → RestaurantWebsite (booking tab)
//   /:slug/item/:itemName/:tableNumber → FoodDetail
//   /:slug/:page                   → redirect to /:slug/:page/1
//   /:slug                         → redirect to /:slug/home/1
//   *                              → 404
// ═══════════════════════════════════════════════════════════════════════════
function MenuApp() {
  return (
    // Suspense is required here because FoodDetail is lazy-loaded.
    // GlobalLoader (dark full-screen) is the fallback while the FoodDetail
    // chunk downloads — this only triggers the very first time a user taps
    // an item, not on the main menu page load.
    <Suspense fallback={<GlobalLoader />}>
      <Routes>
        {/* Food item detail — always has /item/ prefix and table number */}
        <Route path="/:slug/item/:itemName/:tableNumber" element={<FoodDetail />} />
        {/* Legacy food detail path — backward compatibility */}
        <Route path="/:slug/food/:itemName"             element={<FoodDetail />} />
        {/* Nav pages with table number: /:slug/:page/:tableNumber */}
        <Route path="/:slug/:page/:tableNumber"         element={<RestaurantWebsite />} />
        {/* Nav page without table — redirect to table 1 */}
        <Route path="/:slug/:page"                      element={<MenuPageRedirect />} />
        {/* Bare slug — go to home tab, table 1 */}
        <Route path="/:slug"                            element={<MenuSlugRedirect />} />
        <Route path="*"                                 element={<NotFound />} />
      </Routes>
    </Suspense>
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
  // Dashboard is publicly accessible — no login required.
  // Role is stored in localStorage and resolved inside RestaurantDashboard.
  // Any /:slug URL that uses a role name as the page segment (owner, staff,
  // admin, menu_studio) is caught here and redirected to /:slug/orders.

  return (
    <Suspense fallback={<GlobalLoader />}>
      <Routes>
        {/* Auth page (still accessible for super-admin / internal use) */}
        <Route path="/auth"  element={<Auth />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />

        {/* Grocery category grid demo — must come before /:restaurantSlug wildcard */}
        <Route path="/grocery-grid" element={<GroceryCategoryGrid />} />

        {/* ── Internal / direct-id routes (unchanged) ── */}
        <Route path="/admin/:id"           element={<AdminDashboard />} />
        <Route path="/admin/:id/team"      element={<TeamMembers />} />
        <Route path="/admin/:id/profile"   element={<ProfilePage />} />
        <Route path="/master-control"      element={<MasterControl />} />
        <Route path="/master-control/:uid" element={<MasterControl />} />

        {/* ── Dynamic slug + page route — single source of truth ── */}
        {/* /:restaurantSlug/:pageSlug exposes BOTH params via useParams() so  */}
        {/* RestaurantDashboard always knows which section to display.          */}
        {/* "master" is intercepted first because it needs a different handler. */}
        <Route path="/:restaurantSlug/master"  element={<SlugResolver subPath="master" />} />
        <Route path="/:restaurantSlug/:pageSlug" element={<RestaurantDashboard />} />

        {/* ── Base slug (no page) → default to /orders ── */}
        <Route path="/:restaurantSlug" element={<RoleSlugRedirect />} />

        {/* Root */}
        <Route path="/" element={<Navigate to="/auth" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

// Redirects any role-name URL or base slug URL to the canonical /orders page.
// Also strips query params like ?from=master so the URL stays clean.
function RoleSlugRedirect() {
  const { restaurantSlug } = useParams()
  return <Navigate to={`/${restaurantSlug}/orders`} replace />
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
    <Suspense fallback={<GlobalLoader />}>
      <Routes>
      {/* Public */}
      <Route path="/"     element={<Landing />} />
      <Route path="/auth" element={<Auth />} />

      {/* Customer-facing — always public */}
      <Route path="/restaurant/:slug/food/:itemName"            element={<FoodDetail />} />
      <Route path="/restaurant/:slug/:tableNumber/:page"        element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug/:tableNumber"              element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug"                           element={<RestaurantWebsite />} />
      {/* New table-in-path structure (dev/preview): /:slug/:page/:tableNumber */}
      <Route path="/:slug/item/:itemName/:tableNumber"          element={<FoodDetail />} />
      <Route path="/:slug/food/:itemName"                       element={<FoodDetail />} />
      <Route path="/:slug/:page/:tableNumber"                   element={<RestaurantWebsite />} />
      <Route path="/r/:slug"                                    element={<RestaurantWebsite />} />
      <Route path="/table"                           element={<TablePage />} />
      <Route path="/menu/:linkName/:tableNumber"     element={<MenuLinkRoute />} />
      <Route path="/menu/:linkName"                  element={<MenuLinkRoute />} />
      <Route path="/explore"                         element={<RestaurantListing />} />
      <Route path="/favourites"                      element={<Favourites />} />

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
      <Route path="/live-order"              element={<ProtectedRoute><LiveOrder /></ProtectedRoute>} />
      <Route path="/team-members"            element={<ProtectedRoute><TeamMembersAdmin /></ProtectedRoute>} />
      <Route path="/settings"               element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/create-website"          element={<ProtectedRoute><CreateWebsite /></ProtectedRoute>} />
      <Route path="/restaurants"             element={<ProtectedRoute><Restaurants /></ProtectedRoute>} />
      <Route path="/edit-profile"            element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
      <Route path="/notifications"           element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/information"             element={<ProtectedRoute><InformationPage /></ProtectedRoute>} />
      <Route path="/deleted-restaurants"     element={<ProtectedRoute><DeletedRestaurants /></ProtectedRoute>} />
      <Route path="/dynamic-route"           element={<ProtectedRoute><DynamicRoute /></ProtectedRoute>} />
      <Route path="/add-role"               element={<ProtectedRoute><AddRolePage /></ProtectedRoute>} />
      <Route path="/order-time"             element={<ProtectedRoute><OrderTimePage /></ProtectedRoute>} />

      {/* Grocery category grid demo */}
      <Route path="/grocery-grid" element={<GroceryCategoryGrid />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBDOMAIN ROUTER — picks the right app tree based on ACTIVE_SUBDOMAIN.
//
// ACTIVE_SUBDOMAIN is resolved by getSubdomain() in src/lib/subdomain.js:
//   • Replit preview / localhost  → "dashboard"  (matches dashboard.exzibo.online)
//   • dashboard.exzibo.online     → "dashboard"
//   • superadmin.exzibo.online    → "superadmin"
//   • menu.exzibo.online          → "menu"
//   • exzibo.online (bare)        → null → DefaultApp
//
// Preview and Production always run the SAME app tree — no environment forks.
// ═══════════════════════════════════════════════════════════════════════════
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
          <FavouritesProvider>
            <BrowserRouter>
              <SubdomainRouter />
            </BrowserRouter>
          </FavouritesProvider>
        </AnalyticsProvider>
      </RoleProvider>
    </AuthProvider>
  )
}
