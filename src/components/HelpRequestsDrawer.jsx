import React, { useState, useEffect, useCallback } from 'react'
import { X, Bell, CheckCircle2, Clock, Trash2, BellRing, ThumbsUp, ThumbsDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
const FILTERS = ['All', 'Unread', 'Read', 'Resolved']

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

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function roleColor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('super') || r.includes('master')) return { bg: 'rgba(232,50,26,0.15)', text: '#E8321A', border: 'rgba(232,50,26,0.3)' }
  if (r.includes('admin') || r.includes('owner'))  return { bg: 'rgba(99,102,241,0.15)',  text: '#818CF8', border: 'rgba(99,102,241,0.3)' }
  if (r.includes('manager'))                        return { bg: 'rgba(245,158,11,0.15)', text: '#FCD34D', border: 'rgba(245,158,11,0.3)' }
  return { bg: 'rgba(34,197,94,0.15)', text: '#4ADE80', border: 'rgba(34,197,94,0.3)' }
}

export default function HelpRequestsDrawer({ isOpen, onClose, onUnreadChange }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('All')
  const [animIn, setAnimIn]               = useState(false)
  const [visible, setVisible]             = useState(false)

  /* ── animation control ── */
  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
    } else {
      setAnimIn(false)
      const t = setTimeout(() => setVisible(false), 320)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  /* ── data fetch ── */
  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('help_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!error && data) setNotifications(data)
    } catch (e) {
      console.warn('[HelpRequestsDrawer] fetch error:', e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /* ── realtime subscription ── */
  useEffect(() => {
    fetchNotifications()
    const channel = supabase
      .channel('rt-help-drawer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_notifications' }, payload => {
        if (payload.eventType === 'INSERT') {
          setNotifications(prev => [payload.new, ...prev])
        } else {
          fetchNotifications()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchNotifications])

  /* ── notify parent of unread count ── */
  const unreadCount = notifications.filter(n => n.status === 'unread').length
  useEffect(() => {
    if (onUnreadChange) onUnreadChange(unreadCount)
  }, [unreadCount, onUnreadChange])

  /* ── actions ── */
  async function markRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n))
    await supabase.from('help_notifications').update({ status: 'read' }).eq('id', id)
  }

  async function resolveNotification(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'resolved' } : n))
    await supabase.from('help_notifications').update({ status: 'resolved' }).eq('id', id)
  }

  async function deleteNotification(id) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('help_notifications').delete().eq('id', id)
  }

  async function markAllRead() {
    const ids = notifications.filter(n => n.status === 'unread').map(n => n.id)
    if (!ids.length) return
    setNotifications(prev => prev.map(n => n.status === 'unread' ? { ...n, status: 'read' } : n))
    await supabase.from('help_notifications').update({ status: 'read' }).in('id', ids)
  }

  /* ── filtered list ── */
  const filtered = notifications.filter(n => {
    if (filter === 'All')      return true
    if (filter === 'Unread')   return n.status === 'unread'
    if (filter === 'Read')     return n.status === 'read'
    if (filter === 'Resolved') return n.status === 'resolved'
    return true
  })

  if (!visible) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: animIn ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
          backdropFilter: animIn ? 'blur(4px)' : 'blur(0px)',
          transition: 'background 0.32s ease, backdrop-filter 0.32s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
          width: '460px', maxWidth: '100vw',
          background: '#111',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column',
          transform: animIn ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          fontFamily: FONT,
          boxShadow: '-24px 0 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '24px 24px 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <BellRing size={18} color="#E8321A" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '17px', color: '#fff', letterSpacing: '-0.01em' }}>
                  Help Requests
                </div>
                <div style={{ fontSize: '12px', color: '#555', fontWeight: 500, marginTop: '2px' }}>
                  {unreadCount > 0
                    ? <><span style={{ color: '#E8321A', fontWeight: 700 }}>{unreadCount} unread</span> · Real-time sync</>
                    : 'All caught up · Real-time sync'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    padding: '7px 12px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                    color: '#888', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: FONT, transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
                >
                  <CheckCircle2 size={12} /> Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  width: '34px', height: '34px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#666', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '4px', paddingBottom: '16px' }}>
            {FILTERS.map(f => {
              const active = filter === f
              const count = f === 'All'      ? notifications.length
                : f === 'Unread'   ? notifications.filter(n => n.status === 'unread').length
                : f === 'Read'     ? notifications.filter(n => n.status === 'read').length
                : notifications.filter(n => n.status === 'resolved').length
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '6px 12px', borderRadius: '8px',
                    background: active ? '#E8321A' : 'rgba(255,255,255,0.04)',
                    border: active ? 'none' : '1px solid rgba(255,255,255,0.07)',
                    color: active ? '#fff' : '#555',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: FONT, transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    boxShadow: active ? '0 0 16px rgba(232,50,26,0.3)' : 'none',
                  }}
                >
                  {f}
                  {count > 0 && (
                    <span style={{
                      minWidth: '16px', height: '16px', borderRadius: '99px', padding: '0 3px',
                      background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)',
                      color: active ? '#fff' : '#666',
                      fontSize: '9px', fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Scrollable list ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px', color: '#444', fontSize: '13px' }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '240px', gap: '14px', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '16px',
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={20} color="#333" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#444', marginBottom: '5px' }}>
                  No {filter !== 'All' ? filter.toLowerCase() + ' ' : ''}requests
                </div>
                <div style={{ fontSize: '12px', color: '#333', lineHeight: 1.5 }}>
                  {filter === 'All'
                    ? 'Help requests will appear here\nin real-time when users click HELP'
                    : `No ${filter.toLowerCase()} notifications at this time`}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map(n => {
                const rc = roleColor(n.user_role)
                const isUnread   = n.status === 'unread'
                const isResolved = n.status === 'resolved'
                return (
                  <div
                    key={n.id}
                    style={{
                      background: isUnread ? 'rgba(232,50,26,0.05)' : 'rgba(255,255,255,0.025)',
                      border: isUnread ? '1px solid rgba(232,50,26,0.18)' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '14px',
                      padding: '16px 18px',
                      display: 'flex', alignItems: 'flex-start', gap: '12px',
                      opacity: isResolved ? 0.55 : 1,
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    {/* Unread accent bar */}
                    {isUnread && (
                      <div style={{
                        position: 'absolute', left: 0, top: '10px', bottom: '10px',
                        width: '3px', borderRadius: '0 3px 3px 0',
                        background: '#E8321A', boxShadow: '0 0 8px rgba(232,50,26,0.5)',
                      }} />
                    )}

                    {/* Role avatar */}
                    <div style={{
                      width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                      background: rc.bg, border: `1px solid ${rc.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '15px', fontWeight: 800, color: rc.text,
                    }}>
                      {(n.user_role || 'A')[0].toUpperCase()}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Restaurant name + role badge + status indicators */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: isResolved ? '#555' : '#fff', letterSpacing: '-0.01em' }}>
                          {n.restaurant_name}
                        </span>
                        <span style={{
                          padding: '2px 7px', borderRadius: '99px',
                          background: rc.bg, border: `1px solid ${rc.border}`,
                          color: rc.text, fontSize: '9px', fontWeight: 700,
                          letterSpacing: '0.07em', textTransform: 'uppercase',
                        }}>
                          {n.user_role}
                        </span>
                        {isUnread && (
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: '#E8321A', boxShadow: '0 0 6px rgba(232,50,26,0.7)',
                            display: 'inline-block',
                          }} />
                        )}
                        {isResolved && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#4ADE80', fontSize: '10px', fontWeight: 600 }}>
                            <CheckCircle2 size={10} /> Resolved
                          </span>
                        )}
                      </div>

                      {/* Restaurant UID + feedback badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        {n.restaurant_uid && (
                          <span style={{
                            fontFamily: 'monospace', fontSize: '10px',
                            color: '#555', letterSpacing: '0.04em',
                          }}>
                            UID: {n.restaurant_uid}
                          </span>
                        )}
                        {n.feedback === 'helpful' && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '99px',
                            background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)',
                            color: '#4ADE80', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
                          }}>
                            <ThumbsUp size={9} /> HELPFUL
                          </span>
                        )}
                        {n.feedback === 'not_helpful' && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '99px',
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                            color: '#F87171', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
                          }}>
                            <ThumbsDown size={9} /> NOT HELPFUL
                          </span>
                        )}
                      </div>

                      {/* Message */}
                      <p style={{
                        margin: '0 0 8px', fontSize: '12px', fontWeight: 500,
                        color: isResolved ? '#444' : '#777', lineHeight: 1.55,
                        wordBreak: 'break-word',
                      }}>
                        {n.message}
                      </p>

                      {/* Time + actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#444' }}>
                          <Clock size={10} color="#444" />
                          {timeAgo(n.created_at)} · {formatDate(n.created_at)}
                        </span>

                        {!isResolved && (
                          <div style={{ display: 'flex', gap: '5px', marginLeft: 'auto' }}>
                            {isUnread && (
                              <button
                                onClick={() => markRead(n.id)}
                                style={{
                                  padding: '5px 10px', borderRadius: '7px',
                                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                                  color: '#777', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                  fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '3px',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#777'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                              >
                                <CheckCircle2 size={11} /> Read
                              </button>
                            )}
                            <button
                              onClick={() => resolveNotification(n.id)}
                              style={{
                                padding: '5px 10px', borderRadius: '7px',
                                background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)',
                                color: '#4ADE80', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '3px',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.13)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.07)'}
                            >
                              <CheckCircle2 size={11} /> Resolve
                            </button>
                          </div>
                        )}

                        {isResolved && (
                          <button
                            onClick={() => deleteNotification(n.id)}
                            style={{
                              marginLeft: 'auto', padding: '5px 10px', borderRadius: '7px',
                              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                              color: '#444', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                              fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '3px',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#444'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
                          >
                            <Trash2 size={11} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
