import React, { useState, useEffect, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Bell, CheckCircle2, Clock, Trash2, X, ThumbsUp, ThumbsDown } from 'lucide-react'
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

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function roleColor(role) {
  const r = (role || '').toLowerCase()
  if (r.includes('super') || r.includes('master')) return { bg: 'rgba(232,50,26,0.12)', text: '#E8321A', border: 'rgba(232,50,26,0.25)' }
  if (r.includes('admin') || r.includes('owner'))  return { bg: 'rgba(99,102,241,0.12)', text: '#818CF8', border: 'rgba(99,102,241,0.25)' }
  if (r.includes('manager'))                        return { bg: 'rgba(245,158,11,0.12)', text: '#FCD34D', border: 'rgba(245,158,11,0.25)' }
  return { bg: 'rgba(34,197,94,0.12)', text: '#4ADE80', border: 'rgba(34,197,94,0.25)' }
}

const STATUS_FILTERS = ['All', 'Unread', 'Read', 'Resolved']

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [pulse, setPulse] = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('help_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!error && data) setNotifications(data)
    } catch (e) {
      console.warn('[NotificationsPage] fetch error:', e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const channel = supabase
      .channel('rt-notifications-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_notifications' }, payload => {
        if (payload.eventType === 'INSERT') {
          setNotifications(prev => [payload.new, ...prev])
          setPulse(true)
          setTimeout(() => setPulse(false), 800)
        } else {
          fetchNotifications()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchNotifications])

  async function markRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n))
    await supabase.from('help_notifications').update({ status: 'read' }).eq('id', id)
  }

  async function resolveNotification(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'resolved' } : n))
    await supabase.from('help_notifications').update({ status: 'resolved' }).eq('id', id)
  }

  async function markAllRead() {
    const ids = notifications.filter(n => n.status === 'unread').map(n => n.id)
    if (!ids.length) return
    setNotifications(prev => prev.map(n => n.status === 'unread' ? { ...n, status: 'read' } : n))
    await supabase.from('help_notifications').update({ status: 'read' }).in('id', ids)
  }

  async function deleteNotification(id) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('help_notifications').delete().eq('id', id)
  }

  const filtered = notifications.filter(n => {
    if (filter === 'All')      return true
    if (filter === 'Unread')   return n.status === 'unread'
    if (filter === 'Read')     return n.status === 'read'
    if (filter === 'Resolved') return n.status === 'resolved'
    return true
  })

  const unreadCount = notifications.filter(n => n.status === 'unread').length

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden', fontFamily: FONT }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="Notifications" showSearch={false} />

        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

          {/* ── Page title + actions ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: 'rgba(232,50,26,0.1)', border: '1px solid rgba(232,50,26,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Bell size={24} color="#E8321A" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                  Help Requests
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#555', fontWeight: 500 }}>
                  {unreadCount > 0
                    ? <><span style={{ color: '#E8321A', fontWeight: 700 }}>{unreadCount} unread</span> · Real-time sync active</>
                    : 'All caught up · Real-time sync active'}
                </p>
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  padding: '10px 18px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ccc', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  fontFamily: FONT, transition: 'all 0.15s ease',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
              >
                <CheckCircle2 size={14} />
                Mark all read
              </button>
            )}
          </div>

          {/* ── Filter tabs ── */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
            {STATUS_FILTERS.map(f => {
              const active = filter === f
              const count = f === 'All' ? notifications.length
                : f === 'Unread'   ? notifications.filter(n => n.status === 'unread').length
                : f === 'Read'     ? notifications.filter(n => n.status === 'read').length
                : notifications.filter(n => n.status === 'resolved').length
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '8px 14px', borderRadius: '10px',
                    background: active ? '#E8321A' : 'rgba(255,255,255,0.04)',
                    border: active ? 'none' : '1px solid rgba(255,255,255,0.07)',
                    color: active ? '#fff' : '#666',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    fontFamily: FONT, transition: 'all 0.15s ease',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    boxShadow: active ? '0 0 20px rgba(232,50,26,0.3)' : 'none',
                  }}
                >
                  {f}
                  {count > 0 && (
                    <span style={{
                      minWidth: '18px', height: '18px', borderRadius: '99px',
                      background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)',
                      color: active ? '#fff' : '#888',
                      fontSize: '10px', fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#444', fontSize: '14px' }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '280px', gap: '16px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '20px',
            }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '14px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={24} color="#333" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#444', marginBottom: '6px' }}>
                  No {filter !== 'All' ? filter.toLowerCase() + ' ' : ''}requests
                </div>
                <div style={{ fontSize: '13px', color: '#333' }}>
                  {filter === 'All'
                    ? 'Help requests will appear here in real-time when users click HELP'
                    : `No ${filter.toLowerCase()} notifications at this time`}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(n => {
                const rc = roleColor(n.user_role)
                const isUnread = n.status === 'unread'
                const isResolved = n.status === 'resolved'
                return (
                  <div
                    key={n.id}
                    style={{
                      background: isUnread
                        ? 'rgba(232,50,26,0.05)'
                        : 'rgba(255,255,255,0.025)',
                      border: isUnread
                        ? '1px solid rgba(232,50,26,0.18)'
                        : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '16px',
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '16px',
                      opacity: isResolved ? 0.55 : 1,
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    {/* Left accent bar for unread */}
                    {isUnread && (
                      <div style={{
                        position: 'absolute', left: 0, top: '12px', bottom: '12px',
                        width: '3px', borderRadius: '0 3px 3px 0',
                        background: '#E8321A',
                        boxShadow: '0 0 10px rgba(232,50,26,0.5)',
                      }} />
                    )}

                    {/* Role icon circle */}
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                      background: rc.bg, border: `1px solid ${rc.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800, color: rc.text,
                    }}>
                      {(n.user_role || 'A')[0].toUpperCase()}
                    </div>

                    {/* Main content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: isResolved ? '#555' : '#fff', letterSpacing: '-0.01em' }}>
                          {n.restaurant_name}
                        </span>
                        <span style={{
                          padding: '2px 9px', borderRadius: '99px',
                          background: rc.bg, border: `1px solid ${rc.border}`,
                          color: rc.text, fontSize: '10px', fontWeight: 700,
                          letterSpacing: '0.07em', textTransform: 'uppercase',
                        }}>
                          {n.user_role}
                        </span>
                        {isUnread && (
                          <span style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: '#E8321A', boxShadow: '0 0 8px rgba(232,50,26,0.7)',
                            display: 'inline-block',
                          }} />
                        )}
                        {isResolved && (
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            color: '#4ADE80', fontSize: '11px', fontWeight: 600,
                          }}>
                            <CheckCircle2 size={11} /> Resolved
                          </span>
                        )}
                      </div>

                      {/* Restaurant UID + feedback badge */}
                      {(n.restaurant_uid || n.feedback) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {n.restaurant_uid && (
                            <span style={{
                              fontFamily: 'monospace', fontSize: '11px',
                              color: '#555', letterSpacing: '0.04em',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '6px', padding: '2px 8px',
                            }}>
                              UID: {n.restaurant_uid}
                            </span>
                          )}
                          {n.feedback === 'helpful' && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '2px 9px', borderRadius: '99px',
                              background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)',
                              color: '#4ADE80', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                            }}>
                              <ThumbsUp size={10} /> HELPFUL
                            </span>
                          )}
                          {n.feedback === 'not_helpful' && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '2px 9px', borderRadius: '99px',
                              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                              color: '#F87171', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                            }}>
                              <ThumbsDown size={10} /> NOT HELPFUL
                            </span>
                          )}
                        </div>
                      )}

                      <p style={{
                        margin: '0 0 10px', fontSize: '13px', fontWeight: 500,
                        color: isResolved ? '#444' : '#888', lineHeight: 1.6,
                      }}>
                        {n.message}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#444' }}>
                          <Clock size={11} color="#444" />
                          {timeAgo(n.created_at)} · {formatDate(n.created_at)}
                        </span>

                        {/* Action buttons */}
                        {!isResolved && (
                          <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                            {isUnread && (
                              <button
                                onClick={() => markRead(n.id)}
                                style={{
                                  padding: '6px 12px', borderRadius: '8px',
                                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                                  color: '#888', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                  fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '4px',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                              >
                                <CheckCircle2 size={12} /> Mark read
                              </button>
                            )}
                            <button
                              onClick={() => resolveNotification(n.id)}
                              style={{
                                padding: '6px 12px', borderRadius: '8px',
                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                                color: '#4ADE80', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '4px',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.14)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.08)'}
                            >
                              <CheckCircle2 size={12} /> Resolve
                            </button>
                          </div>
                        )}

                        {isResolved && (
                          <button
                            onClick={() => deleteNotification(n.id)}
                            style={{
                              marginLeft: 'auto', padding: '6px 12px', borderRadius: '8px',
                              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                              color: '#444', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                              fontFamily: FONT, display: 'flex', alignItems: 'center', gap: '4px',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#444'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
                          >
                            <Trash2 size={12} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
