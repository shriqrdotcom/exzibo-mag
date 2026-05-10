import React, { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle2, Clock, ChevronRight, Bell, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'Just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function roleColor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('super') || r.includes('master')) return { bg: 'rgba(232,50,26,0.15)', text: '#E8321A', border: 'rgba(232,50,26,0.3)' }
  if (r.includes('admin') || r.includes('owner')) return { bg: 'rgba(99,102,241,0.15)', text: '#818CF8', border: 'rgba(99,102,241,0.3)' }
  if (r.includes('manager')) return { bg: 'rgba(245,158,11,0.15)', text: '#FCD34D', border: 'rgba(245,158,11,0.3)' }
  return { bg: 'rgba(34,197,94,0.15)', text: '#4ADE80', border: 'rgba(34,197,94,0.3)' }
}

export default function NotificationDrawer({ isOpen, onClose, onUnreadChange }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [animIn, setAnimIn] = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('help_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!error && data) {
        setNotifications(data)
        const unread = data.filter(n => n.status === 'unread').length
        onUnreadChange?.(unread)
      }
    } catch (e) {
      console.warn('[NotificationDrawer] fetch error:', e.message)
    } finally {
      setLoading(false)
    }
  }, [onUnreadChange])

  // Open/close animation
  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
      fetchNotifications()
    } else {
      setAnimIn(false)
      const t = setTimeout(() => setVisible(false), 320)
      return () => clearTimeout(t)
    }
  }, [isOpen, fetchNotifications])

  // Realtime subscription — always active so badge updates even when drawer is closed
  useEffect(() => {
    const channel = supabase
      .channel('rt-help-notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'help_notifications',
      }, () => {
        fetchNotifications()
      })
      .subscribe()
    fetchNotifications()
    return () => { supabase.removeChannel(channel) }
  }, [fetchNotifications])

  async function markRead(id) {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, status: 'read' } : n)
    )
    try {
      await supabase
        .from('help_notifications')
        .update({ status: 'read' })
        .eq('id', id)
    } catch (e) {
      console.warn('[NotificationDrawer] markRead error:', e.message)
    }
    const updated = notifications.map(n => n.id === id ? { ...n, status: 'read' } : n)
    onUnreadChange?.(updated.filter(n => n.status === 'unread').length)
  }

  async function resolveNotification(id) {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, status: 'resolved' } : n)
    )
    try {
      await supabase
        .from('help_notifications')
        .update({ status: 'resolved' })
        .eq('id', id)
    } catch (e) {
      console.warn('[NotificationDrawer] resolve error:', e.message)
    }
    const updated = notifications.map(n => n.id === id ? { ...n, status: 'resolved' } : n)
    onUnreadChange?.(updated.filter(n => n.status === 'unread').length)
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => n.status === 'unread').map(n => n.id)
    if (unreadIds.length === 0) return
    setNotifications(prev => prev.map(n => n.status === 'unread' ? { ...n, status: 'read' } : n))
    onUnreadChange?.(0)
    try {
      await supabase
        .from('help_notifications')
        .update({ status: 'read' })
        .in('id', unreadIds)
    } catch (e) {
      console.warn('[NotificationDrawer] markAllRead error:', e.message)
    }
  }

  if (!visible) return null

  const unreadCount = notifications.filter(n => n.status === 'unread').length

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 998,
          background: animIn ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
          backdropFilter: animIn ? 'blur(2px)' : 'blur(0px)',
          transition: 'background 0.32s ease, backdrop-filter 0.32s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '400px',
          maxWidth: '92vw',
          zIndex: 999,
          background: '#111',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT,
          transform: animIn ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 24px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={17} color="#E8321A" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '16px', color: '#fff', letterSpacing: '-0.01em' }}>
                  Help Requests
                </div>
                <div style={{ fontSize: '11px', color: '#555', fontWeight: 500, marginTop: '1px' }}>
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    padding: '6px 12px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#888', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: FONT, letterSpacing: '0.03em',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={15} color="#888" />
              </button>
            </div>
          </div>
        </div>

        {/* Notification list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', color: '#444', fontSize: '13px' }}>
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '200px', gap: '12px', color: '#444',
            }}>
              <Bell size={32} color="#2a2a2a" />
              <div style={{ fontSize: '13px', fontWeight: 500 }}>No help requests yet</div>
              <div style={{ fontSize: '12px', color: '#333' }}>Requests will appear here in real-time</div>
            </div>
          ) : (
            notifications.map(n => {
              const rc = roleColor(n.user_role)
              const isUnread = n.status === 'unread'
              const isResolved = n.status === 'resolved'
              return (
                <div
                  key={n.id}
                  onClick={() => { if (isUnread) markRead(n.id) }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '14px',
                    background: isUnread
                      ? 'rgba(232,50,26,0.06)'
                      : isResolved
                        ? 'rgba(255,255,255,0.02)'
                        : 'rgba(255,255,255,0.03)',
                    border: isUnread
                      ? '1px solid rgba(232,50,26,0.15)'
                      : '1px solid rgba(255,255,255,0.05)',
                    marginBottom: '8px',
                    cursor: isUnread ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                    opacity: isResolved ? 0.5 : 1,
                    position: 'relative',
                  }}
                >
                  {/* Unread dot */}
                  {isUnread && (
                    <div style={{
                      position: 'absolute', top: '14px', right: '14px',
                      width: '8px', height: '8px', borderRadius: '50%', background: '#E8321A',
                      boxShadow: '0 0 8px rgba(232,50,26,0.6)',
                    }} />
                  )}

                  {/* Restaurant name */}
                  <div style={{
                    fontSize: '13px', fontWeight: 700, color: isResolved ? '#444' : '#fff',
                    marginBottom: '6px', paddingRight: '18px',
                    letterSpacing: '-0.01em',
                  }}>
                    {n.restaurant_name}
                  </div>

                  {/* Role badge + time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '99px',
                      background: rc.bg, border: `1px solid ${rc.border}`,
                      color: rc.text, fontSize: '10px', fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                      {n.user_role}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#555' }}>
                      <Clock size={10} color="#555" />
                      {timeAgo(n.created_at)}
                    </span>
                  </div>

                  {/* Message */}
                  <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.5, marginBottom: '10px' }}>
                    {n.message}
                  </div>

                  {/* Actions */}
                  {!isResolved && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {isUnread && (
                        <button
                          onClick={e => { e.stopPropagation(); markRead(n.id) }}
                          style={{
                            padding: '5px 10px', borderRadius: '7px',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                            color: '#888', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                            fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          <CheckCircle2 size={11} /> Mark read
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); resolveNotification(n.id) }}
                        style={{
                          padding: '5px 10px', borderRadius: '7px',
                          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                          color: '#4ADE80', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                          fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                      >
                        <CheckCircle2 size={11} /> Resolve
                      </button>
                    </div>
                  )}

                  {isResolved && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#4ADE80' }}>
                      <CheckCircle2 size={11} /> Resolved
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            fontSize: '11px', color: '#333', fontWeight: 500,
            textAlign: 'center', flexShrink: 0,
          }}>
            Showing last {notifications.length} requests · Real-time sync active
          </div>
        )}
      </div>
    </>
  )
}
