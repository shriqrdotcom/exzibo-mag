import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid rgba(232,50,26,0.2)',
          borderTopColor: '#E8321A',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <div style={{ fontSize: '13px', color: '#444', fontWeight: 600, letterSpacing: '0.06em' }}>LOADING…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
  if (!user) return <Navigate to="/auth" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <RoleProvider>
        <AnalyticsProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/"                                   element={<Landing />} />
              <Route path="/auth"                               element={<Auth />} />
              <Route path="/restaurant/:slug"                   element={<RestaurantWebsite />} />
              <Route path="/restaurant/:slug/food/:itemName"    element={<FoodDetail />} />
              <Route path="/r/:slug"                            element={<RestaurantWebsite />} />
              <Route path="/table"                              element={<TablePage />} />
              <Route path="/menu/:linkName/:tableNumber"        element={<MenuLinkRoute />} />
              <Route path="/menu/:linkName"                     element={<MenuLinkRoute />} />

              {/* Protected */}
              <Route path="/dashboard"        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/master-control"   element={<ProtectedRoute><MasterControl /></ProtectedRoute>} />
              <Route path="/admin/:id"        element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/:id/team"   element={<ProtectedRoute><TeamMembers /></ProtectedRoute>} />
              <Route path="/admin/:id/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/profile"          element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/super-admin"      element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
              <Route path="/team-members"     element={<ProtectedRoute><TeamMembersAdmin /></ProtectedRoute>} />
              <Route path="/settings"         element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/create-website"   element={<ProtectedRoute><CreateWebsite /></ProtectedRoute>} />
              <Route path="/restaurants"      element={<ProtectedRoute><Restaurants /></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AnalyticsProvider>
      </RoleProvider>
    </AuthProvider>
  )
}
