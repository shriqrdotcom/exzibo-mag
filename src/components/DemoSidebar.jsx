import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Plus, Zap } from 'lucide-react'

export default function DemoSidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/demo/dashboard' },
    { icon: Plus, label: 'Create Demo App', path: '/demo/create' },
    { icon: Zap, label: 'List of Demo', path: '/demo/list' },
  ]

  return (
    <aside style={{
      width: '270px',
      minWidth: '270px',
      height: '100vh',
      background: '#0e0e0e',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      padding: '28px 16px',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ marginBottom: '40px', paddingLeft: '8px' }}>
        <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.05em', color: '#fff' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.2em', color: '#555', marginTop: '4px', textTransform: 'uppercase' }}>
          Demo Mode
        </div>
        <div style={{
          marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: 'rgba(232,50,26,0.1)', border: '1px solid rgba(232,50,26,0.2)',
          borderRadius: '6px', padding: '3px 8px',
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: '#E8321A',
        }}>
          🧪 DEMO ENVIRONMENT
        </div>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path
          return (
            <button
              key={label}
              onClick={() => navigate(path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: isActive ? '#E8321A' : 'transparent',
                border: isActive ? 'none' : '1px solid rgba(255,255,255,0.06)',
                color: isActive ? '#fff' : '#888',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = '#fff'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#888'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                }
              }}
            >
              <Icon size={18} />
              <span style={{ flex: 1 }}>{label}</span>
            </button>
          )
        })}
      </nav>

      <button
        onClick={() => navigate('/dashboard')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '13px',
          borderRadius: '50px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#E8321A'
          e.currentTarget.style.borderColor = '#E8321A'
          e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.4)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <Zap size={15} />
        GO LIVE
      </button>
    </aside>
  )
}
