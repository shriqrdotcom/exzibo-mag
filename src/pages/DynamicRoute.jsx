import React from 'react'
import Sidebar from '../components/Sidebar'

export default function DynamicRoute() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
          Dynamic Route
        </h1>
        <p style={{ color: '#555', fontSize: '14px' }}>
          This section is under construction.
        </p>
      </main>
    </div>
  )
}
