import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'

const views = [
  { key: 'menu-edit', label: 'Menu Edit' },
  { key: 'food-card', label: 'Food Card' },
  { key: 'food-window', label: 'Food Window' },
]

export default function MenuPage() {
  const [activeView, setActiveView] = useState('menu-edit')

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader subtitle="Menu" />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>
              Menu
            </h1>
            <p style={{ color: '#555', fontSize: '14px', lineHeight: 1.6 }}>
              Manage your menu, food cards, and display windows from one place.
            </p>
          </div>

          <div style={{
            display: 'inline-flex',
            gap: '4px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '32px',
          }}>
            {views.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveView(key)}
                style={{
                  padding: '10px 26px',
                  borderRadius: '9px',
                  background: activeView === key ? '#E8321A' : 'transparent',
                  border: 'none',
                  color: activeView === key ? '#fff' : '#666',
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  boxShadow: activeView === key ? '0 0 18px rgba(232,50,26,0.35)' : 'none',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{
            minHeight: '400px',
            background: '#111',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center', color: '#333' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>
                {activeView === 'menu-edit' && '🍽️'}
                {activeView === 'food-card' && '🃏'}
                {activeView === 'food-window' && '🪟'}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {views.find(v => v.key === activeView)?.label} — Coming Soon
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
