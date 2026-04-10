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
import { AnalyticsProvider } from './context/AnalyticsContext'

export default function App() {
  return (
    <AnalyticsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/:id" element={<AdminDashboard />} />
          <Route path="/menu-editor" element={<MenuEditor />} />
          <Route path="/menu-editor/:uid" element={<MenuEditor />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/create-website" element={<CreateWebsite />} />
          <Route path="/restaurants" element={<Restaurants />} />
          <Route path="/restaurant/:slug" element={<RestaurantWebsite />} />
          <Route path="/restaurant/:slug/food/:itemName" element={<FoodDetail />} />
          <Route path="/r/:slug" element={<RestaurantWebsite />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AnalyticsProvider>
  )
}
