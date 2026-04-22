import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import MenuEditor from './pages/MenuEditor'
import Settings from './pages/Settings'
import CreateWebsite from './pages/CreateWebsite'
import Restaurants from './pages/Restaurants'
import RestaurantWebsite from './pages/RestaurantWebsite'
import FoodDetail from './pages/FoodDetail'
import AdminDashboard from './pages/AdminDashboard'
import TeamMembers from './pages/TeamMembers'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import TeamMembersAdmin from './pages/TeamMembersAdmin'
import DemoCreateWebsite from './pages/DemoCreateWebsite'
import DemoList from './pages/DemoList'
import DemoDashboard from './pages/DemoDashboard'
import TablePage from './pages/TablePage'
import MenuLinkRoute from './pages/MenuLinkRoute'
import { AnalyticsProvider } from './context/AnalyticsContext'
import { RoleProvider } from './context/RoleContext'

export default function App() {
  return (
    <RoleProvider>
    <AnalyticsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/:id" element={<AdminDashboard />} />
          <Route path="/admin/:id/team" element={<TeamMembers />} />
          <Route path="/super-admin" element={<SuperAdminDashboard />} />
          <Route path="/team-members" element={<TeamMembersAdmin />} />
          <Route path="/menu-editor" element={<MenuEditor />} />
          <Route path="/menu-editor/:uid" element={<MenuEditor />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/create-website" element={<CreateWebsite />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/restaurant/:slug" element={<RestaurantWebsite />} />
          <Route path="/restaurant/:slug/food/:itemName" element={<FoodDetail />} />
          <Route path="/r/:slug" element={<RestaurantWebsite />} />
          <Route path="/demo/create" element={<DemoCreateWebsite />} />
          <Route path="/demo/list" element={<DemoList />} />
          <Route path="/demo/dashboard" element={<DemoDashboard />} />
          <Route path="/demo/dashboard/:id" element={<DemoDashboard />} />
          <Route path="/table" element={<TablePage />} />
          <Route path="/menu/:linkName/:tableNumber" element={<MenuLinkRoute />} />
          <Route path="/menu/:linkName" element={<MenuLinkRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AnalyticsProvider>
    </RoleProvider>
  )
}
