import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { LayoutDashboard, Settings, Zap, Users, Table2, ShieldCheck, Bell, Info, Trash2, Play, ImageDown, Route, ShieldPlus, Clock, Radio } from 'lucide-react'
import PermissionGate from './PermissionGate'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',      path: '/dashboard',       permission: 'dashboard' },
  { icon: Radio,           label: 'Live Order',     path: '/live-order',      permission: 'dashboard' },
  { icon: Users,           label: 'Team Members',   path: '/team-members',    permission: 'teamManagement' },
  { icon: Table2,          label: 'Table',          path: '/table',           permission: 'dashboard' },
  { icon: ShieldCheck,     label: 'Menu Studio', path: '/master-control',  permission: 'dashboard' },
  { icon: Settings,        label: 'Settings',       path: '/settings',        permission: 'settings' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [unreadCount, setUnreadCount] = useState(0)
  const isDemoActive = location.pathname === '/dashboard' && searchParams.get('section') === 'demo'
  const isCompressorActive = location.pathname === '/dashboard' && searchParams.get('section') === 'image-compressor'

  const refreshUnread = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications?action=getHelp')
      if (!r.ok) return
      const rows = await r.json()
      setUnreadCount(rows.filter(n => n.status === 'unread').length)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    refreshUnread()
    const poll = setInterval(refreshUnread, 30_000)
    return () => clearInterval(poll)
  }, [refreshUnread])

  const notifActive = location.pathname === '/notifications'

  return (
    <aside style={{
      width: '256px',
      minWidth: '256px',
      height: '100vh',
      background: '#000000',
      borderRight: '1px solid rgba(255,255,255,0.04)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 12px',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: '36px', paddingLeft: '12px' }}>
        <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.06em', color: '#fff' }}>
          EXZIBO
        </div>
        <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.22em', color: '#444', marginTop: '3px', textTransform: 'uppercase' }}>
          Premium Management
        </div>
      </div>

      {/* Nav items */}
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
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                  color: isActive ? '#fff' : '#555',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  width: '100%',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.color = '#aaa'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#555'
                  }
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            </PermissionGate>
          )
        })}

        {/* DEMO nav item */}
        <button
          onClick={() => navigate('/dashboard?section=demo')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: isDemoActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            border: 'none',
            borderLeft: isDemoActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
            color: isDemoActive ? '#fff' : '#555',
            fontSize: '13px',
            fontWeight: isDemoActive ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'left',
            width: '100%',
          }}
          onMouseEnter={e => {
            if (!isDemoActive) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.color = '#aaa'
            }
          }}
          onMouseLeave={e => {
            if (!isDemoActive) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#555'
            }
          }}
        >
          <Play size={16} />
          DEMO
        </button>

        {/* IMAGE COMPRESSOR nav item */}
        <button
          onClick={() => navigate('/dashboard?section=image-compressor')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: isCompressorActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            border: 'none',
            borderLeft: isCompressorActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
            color: isCompressorActive ? '#fff' : '#555',
            fontSize: '13px',
            fontWeight: isCompressorActive ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'left',
            width: '100%',
          }}
          onMouseEnter={e => {
            if (!isCompressorActive) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.color = '#aaa'
            }
          }}
          onMouseLeave={e => {
            if (!isCompressorActive) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#555'
            }
          }}
        >
          <ImageDown size={16} />
          Image Compressor
        </button>

        {/* Notifications nav item */}
        <button
          onClick={() => navigate('/notifications')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: notifActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            border: 'none',
            borderLeft: notifActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
            color: notifActive ? '#fff' : '#555',
            fontSize: '13px',
            fontWeight: notifActive ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            textAlign: 'left',
            width: '100%',
            position: 'relative',
          }}
          onMouseEnter={e => {
            if (!notifActive) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.color = '#aaa'
            }
          }}
          onMouseLeave={e => {
            if (!notifActive) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#555'
            }
          }}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Bell size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-6px',
                right: '-7px',
                minWidth: '16px',
                height: '16px',
                borderRadius: '99px',
                background: '#fff',
                color: '#111',
                fontSize: '9px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                lineHeight: 1,
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          Notifications
          {unreadCount > 0 && !notifActive && (
            <span style={{
              marginLeft: 'auto',
              padding: '2px 7px',
              borderRadius: '99px',
              background: 'rgba(255,255,255,0.08)',
              color: '#aaa',
              fontSize: '10px',
              fontWeight: 700,
            }}>
              {unreadCount} new
            </span>
          )}
        </button>

        {/* Deleted Restaurants nav item */}
        {(() => {
          const isActive = location.pathname === '/deleted-restaurants'
          return (
            <button
              onClick={() => navigate('/deleted-restaurants')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '10px',
                background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: 'none', borderLeft: isActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                color: isActive ? '#fff' : '#555', fontSize: '13px',
                fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                transition: 'all 0.15s ease', textAlign: 'left', width: '100%',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#aaa' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555' } }}
            >
              <Trash2 size={16} />Deleted
            </button>
          )
        })()}

        {/* Dynamic Route nav item */}
        {(() => {
          const isActive = location.pathname === '/dynamic-route'
          return (
            <button
              onClick={() => navigate('/dynamic-route')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '10px',
                background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: 'none', borderLeft: isActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                color: isActive ? '#fff' : '#555', fontSize: '13px',
                fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                transition: 'all 0.15s ease', textAlign: 'left', width: '100%',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#aaa' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555' } }}
            >
              <Route size={16} />Dynamic Route
            </button>
          )
        })()}

        {/* Add Role nav item */}
        {(() => {
          const isActive = location.pathname === '/add-role'
          return (
            <button
              onClick={() => navigate('/add-role')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '10px',
                background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: 'none', borderLeft: isActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                color: isActive ? '#fff' : '#555', fontSize: '13px',
                fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                transition: 'all 0.15s ease', textAlign: 'left', width: '100%',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#aaa' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555' } }}
            >
              <ShieldPlus size={16} />Add Role
            </button>
          )
        })()}

        {/* Order Time nav item */}
        {(() => {
          const isActive = location.pathname === '/order-time'
          return (
            <button
              onClick={() => navigate('/order-time')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '10px',
                background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: 'none', borderLeft: isActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                color: isActive ? '#fff' : '#555', fontSize: '13px',
                fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                transition: 'all 0.15s ease', textAlign: 'left', width: '100%',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#aaa' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555' } }}
            >
              <Clock size={16} />Order Time
            </button>
          )
        })()}

        {/* ── INFORMATION section ── */}
        <div style={{ marginTop: '12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 14px 6px',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
            <span style={{
              fontSize: '9px', fontWeight: 700,
              letterSpacing: '0.18em', color: '#333',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>Information</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
          </div>

          {/* Information nav button */}
          {(() => {
            const isActive = location.pathname === '/information'
            return (
              <button
                onClick={() => navigate('/information')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', borderRadius: '10px',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  border: 'none', borderLeft: isActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
                  color: isActive ? '#fff' : '#555', fontSize: '13px',
                  fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                  transition: 'all 0.15s ease', textAlign: 'left', width: '100%',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#aaa' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555' } }}
              >
                <Info size={16} />Information
              </button>
            )
          })()}
        </div>
      </nav>

      {/* Go Live button */}
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '11px',
          borderRadius: '10px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#aaa',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#fff'
          e.currentTarget.style.borderColor = '#fff'
          e.currentTarget.style.color = '#111'
          e.currentTarget.style.boxShadow = '0 0 20px rgba(255,255,255,0.12)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
          e.currentTarget.style.color = '#aaa'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <Zap size={14} />
        GO LIVE
      </button>
    </aside>
  )
}
