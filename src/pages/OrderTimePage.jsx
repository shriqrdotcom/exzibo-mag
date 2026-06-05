import React from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'

export default function OrderTimePage() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
        </main>
      </div>
    </div>
  )
}
