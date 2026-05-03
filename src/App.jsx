import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AnalyticsProvider } from './context/AnalyticsContext'
import { RoleProvider } from './context/RoleContext'

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

// ── Root route: always show the main/landing page ───────────────────────────
// "/" is public — accessible whether logged in or not.
// Dashboard is accessed only when the user clicks it manually.

// ── Protected route guard ────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) {
    // Save the page they wanted so we can return them after login
    const intended = location.pathname + location.search
    if (intended !== '/auth') localStorage.setItem('auth_redirect', intended)
    return <Navigate to="/auth" replace />
  }
  return children
}

// ── All routes — only rendered once auth state is known ────────────────────
function AppRoutes() {
  const { loading, user } = useAuth()
  const navigate = useNavigate()

  // After login completes, redirect to the page they originally intended.
  // This handles the OAuth return-to-/dashboard case: we intercept and
  // navigate to whatever was stored before the OAuth flow started.
  useEffect(() => {
    if (!loading && user) {
      const saved = localStorage.getItem('auth_redirect')
      if (saved) {
        localStorage.removeItem('auth_redirect')
        const safe = saved.startsWith('/') && !saved.startsWith('//') && !saved.startsWith('/auth')
        if (safe) navigate(saved, { replace: true })
        // No fallback redirect — user stays on "/" (the main page they landed on)
      }
    }
  }, [loading, user, navigate])

  // Block ALL rendering until auth state is resolved — zero UI flash.
  if (loading) return <GlobalLoader />

  return (
    <Routes>
      {/* Public — main page is always visible, auth page for login */}
      <Route path="/"     element={<Landing />} />
      <Route path="/auth" element={<Auth />} />

      {/* Customer-facing — always public (these are for restaurant guests) */}
      <Route path="/restaurant/:slug"                element={<RestaurantWebsite />} />
      <Route path="/restaurant/:slug/food/:itemName" element={<FoodDetail />} />
      <Route path="/r/:slug"                         element={<RestaurantWebsite />} />
      <Route path="/table"                           element={<TablePage />} />
      <Route path="/menu/:linkName/:tableNumber"     element={<MenuLinkRoute />} />
      <Route path="/menu/:linkName"                  element={<MenuLinkRoute />} />

      {/* Protected — require valid session */}
      <Route path="/dashboard"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/master-control"    element={<ProtectedRoute><MasterControl /></ProtectedRoute>} />
      <Route path="/admin/:id"         element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/:id/team"    element={<ProtectedRoute><TeamMembers /></ProtectedRoute>} />
      <Route path="/admin/:id/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/profile"           element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/super-admin"       element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
      <Route path="/team-members"      element={<ProtectedRoute><TeamMembersAdmin /></ProtectedRoute>} />
      <Route path="/settings"          element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/create-website"    element={<ProtectedRoute><CreateWebsite /></ProtectedRoute>} />
      <Route path="/restaurants"       element={<ProtectedRoute><Restaurants /></ProtectedRoute>} />

      {/* Catch-all → auth gate */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <RoleProvider>
        <AnalyticsProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AnalyticsProvider>
      </RoleProvider>
    </AuthProvider>
  )
}
