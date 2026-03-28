import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import MenuEditor from './pages/MenuEditor'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import CreateWebsite from './pages/CreateWebsite'
import Restaurants from './pages/Restaurants'
import RestaurantDetail from './pages/RestaurantDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/menu-editor" element={<MenuEditor />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/create-website" element={<CreateWebsite />} />
        <Route path="/restaurants" element={<Restaurants />} />
        <Route path="/restaurant/:id" element={<RestaurantDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
