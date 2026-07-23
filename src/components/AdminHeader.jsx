import React from 'react'
import { Bell, User, Menu } from 'lucide-react'
import { useSidebar } from '../context/SidebarContext'

export default function AdminHeader({ title = 'Admin Console', subtitle }) {
  const { toggleSidebar } = useSidebar()

  return (
    <header className="admin-header" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 32px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      background: '#0e0e0e',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div className="admin-header-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Hamburger button for mobile */}
        <button
          className="sidebar-hamburger"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          style={{
            display: 'none',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#888',
            cursor: 'pointer',
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = '#888'}
        >
          <Menu size={18} />
        </button>
        <span style={{ color: '#E8321A', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        {subtitle && (
          <>
            <span style={{ color: '#444', fontSize: '13px' }}>/</span>
            <span style={{ color: '#888', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              {subtitle}
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
        <button style={{
          background: 'transparent',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
        onMouseLeave={e => e.currentTarget.style.color = '#888'}
        >
          <Bell size={18} />
        </button>

        <button style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#888',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        >
          <User size={18} />
        </button>
      </div>
    </header>
  )
}
