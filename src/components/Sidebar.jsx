import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, UtensilsCrossed, Settings, Zap, Users, Table2, ShieldCheck } from 'lucide-react'
import PermissionGate from './PermissionGate'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',       path: '/dashboard',     permission: 'dashboard' },
  { icon: UtensilsCrossed, label: 'Restaurant Editor', path: '/menu-editor', permission: 'restaurantEditor' },
  { icon: Users,           label: 'Team Members',    path: '/team-members',  permission: 'teamManagement' },
  { icon: Table2,          label: 'Table',           path: '/table',         permission: 'dashboard' },
  { icon: ShieldCheck,     label: 'Master Control',  path: '/master-control', permission: 'dashboard' },
  { icon: Settings,        label: 'Settings',        path: '/settings',      permission: 'settings' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
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
          Premium Management
        </div>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {navItems.map(({ icon: Icon, label, path, permission }) => {
          const isActive = location.pathname === path
          return (
            <PermissionGate key={path} permission={permission}>
              <button
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
                {label}
              </button>
            </PermissionGate>
          )
        })}

      </nav>

      <button
        onClick={() => navigate('/')}
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
