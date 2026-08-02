import React from 'react'
import Sidebar from '../components/Sidebar'

// Reserved workspace for future app-member functionality.
export default function AppMembers() {
  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#050505',
      color: '#fff',
    }}>
      <Sidebar />
      <main
        aria-label="App members workspace"
        style={{ flex: 1, minWidth: 0 }}
      />
    </div>
  )
}