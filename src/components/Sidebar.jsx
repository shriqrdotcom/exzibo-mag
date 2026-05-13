import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Settings, Zap, Users, Table2, ShieldCheck, Bell, Info, Trash2, Play } from 'lucide-react'
import PermissionGate from './PermissionGate'
import { supabase } from '../lib/supabase'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',      path: '/dashboard',       permission: 'dashboard' },
  { icon: Users,           label: 'Team Members',   path: '/team-members',    permission: 'teamManagement' },
  { icon: Table2,          label: 'Table',          path: '/table',           permission: 'dashboard' },
  { icon: ShieldCheck,     label: 'Master Control', path: '/master-control',  permission: 'dashboard' },
  { icon: Settings,        label: 'Settings',       path: '/settings',        permission: 'settings' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshUnread = useCallback(async () => {
    try {
      const { count } = await supabase
        .from('help_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'unread')
      setUnreadCount(count ?? 0)
    } catch { /* table may not exist yet */ }
  }, [])

  useEffect(() => {
    refreshUnread()
    const channel = supabase
      .channel('rt-help-badge')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'help_notifications',
      }, () => refreshUnread())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refreshUnread])

  const notifActive = location.pathname === '/notifications'

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
      {/* Logo */}
      <div style={{ marginBottom: '40px', paddingLeft: '8px' }}>
        <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.05em', color: '#fff' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.2em', color: '#555', marginTop: '4px', textTransform: 'uppercase' }}>
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

        {/* DEMO nav item */}
        <button
          onClick={() => navigate('/restaurant/demo')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#888',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'left',
            width: '100%',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.color = '#fff'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#888'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
          }}
        >
          <Play size={18} />
          DEMO
        </button>

        {/* Notifications nav item */}
        <button
          onClick={() => navigate('/notifications')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '12px',
            background: notifActive ? '#E8321A' : 'transparent',
            border: notifActive ? 'none' : '1px solid rgba(255,255,255,0.06)',
            color: notifActive ? '#fff' : '#888',
            fontSize: '14px',
            fontWeight: notifActive ? 600 : 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            textAlign: 'left',
            width: '100%',
            position: 'relative',
          }}
          onMouseEnter={e => {
            if (!notifActive) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            }
          }}
          onMouseLeave={e => {
            if (!notifActive) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#888'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
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
                background: notifActive ? 'rgba(255,255,255,0.9)' : '#E8321A',
                color: notifActive ? '#E8321A' : '#fff',
                fontSize: '9px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                boxShadow: '0 0 6px rgba(232,50,26,0.6)',
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
              background: 'rgba(232,50,26,0.15)',
              color: '#E8321A',
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
              <Trash2 size={18} />
              Deleted
            </button>
          )
        })()}

        {/* ── INFORMATION section ── */}
        <div style={{ marginTop: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 8px 6px',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#444',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              Information
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Information nav button */}
          {(() => {
            const isActive = location.pathname === '/information'
            return (
              <button
                onClick={() => navigate('/information')}
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
                <Info size={18} />
                Information
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
