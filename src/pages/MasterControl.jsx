import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import HelpRequestsDrawer from '../components/HelpRequestsDrawer'
import { LogIn, ShieldCheck, X, ArrowRight, AlertCircle, BellRing } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getRouteConfig } from '../lib/routeConfig'
import { getSubdomain } from '../lib/subdomain'
import { stripRoleSuffix } from '../lib/uid'

const LAST_UID_KEY = 'exzibo_master_last_uid'
const DEFAULT_SUPER_ADMIN_UID = '0000000001'

async function resolveAdminTargetByUID(uid) {
  // Strip any role suffix (e.g. 8910934784-OWN-001 → 8910934784) before all lookups
  const trimmed = stripRoleSuffix(String(uid || '').trim())
  if (!trimmed) return null

  // Super-admin shortcut
  if (trimmed === DEFAULT_SUPER_ADMIN_UID) return { id: 'default', slug: null }

  // ── Fast path: localStorage cache ────────────────────────────────────────
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = all.find(r => String(r.uid) === trimmed || r.id === trimmed)
    if (found) {
      console.log('[MasterControl] UID resolved via localStorage:', found.id)
      return { id: String(found.id), slug: found.slug || null }
    }
  } catch { /* noop */ }

  // ── Neon API lookup ───────────────────────────────────────────────────────
  try {
    const r = await fetch(`/api/neon/restaurant/by-uid/${encodeURIComponent(trimmed)}`)
    if (r.ok) {
      const data = await r.json()
      if (data) {
        console.log('[MasterControl] UID resolved via Neon API:', data.id)
        return { id: String(data.id), slug: data.slug || null }
      }
    }
  } catch (err) {
    console.warn('[MasterControl] Neon UID lookup threw:', err.message)
  }

  // Strategy 2: caller may have pasted the internal UUID (id) directly
  if (trimmed.includes('-') && trimmed.length === 36) {
    try {
      const r = await fetch(`/api/neon/restaurant/${encodeURIComponent(trimmed)}`)
      if (r.ok) {
        const data = await r.json()
        if (data) {
          console.log('[MasterControl] UID resolved via Neon direct id:', data.id)
          return { id: String(data.id), slug: data.slug || null }
        }
      }
    } catch (err) {
      console.error('[MasterControl] Neon direct id lookup threw:', err)
    }
  }

  console.warn('[MasterControl] No restaurant found for UID:', trimmed)
  return null
}

export default function MasterControl() {
  const navigate = useNavigate()
  const { uid: uidParam } = useParams()
  const { isSuperAdmin, loading: authLoading, user } = useAuth()
  const [allowed, setAllowed] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [uid, setUid] = useState('')
  const [error, setError] = useState('')
  const [inlineUid, setInlineUid] = useState('')
  const [inlineError, setInlineError] = useState('')
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError, setAutoError] = useState('')
  const [accessLoading, setAccessLoading] = useState(false)
  const [dashRoutePrefix, setDashRoutePrefix] = useState('')

  useEffect(() => {
    getRouteConfig('dashboard_route_prefix')
      .then(val => { if (val) setDashRoutePrefix(val) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (authLoading) return
    // Auth temporarily bypassed for this page
    setAllowed(true)
    const last = localStorage.getItem(LAST_UID_KEY) || ''
    setUid(last)
    setInlineUid(last)
  }, [authLoading])

  // ── Production cache pre-warm ─────────────────────────────────────────────
  useEffect(() => {
    const cached = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    if (cached.length > 0) return
    fetch('/api/neon/restaurants')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          localStorage.setItem('exzibo_restaurants', JSON.stringify(data))
        }
      })
      .catch(() => {})
  }, [])

  // Auto-navigate when a UID is passed via URL param (e.g. /master-control/6920307970)
  useEffect(() => {
    if (!uidParam || !allowed) return
    const trimmed = uidParam.trim()
    if (!trimmed) return
    console.log('[MasterControl] Auto-opening UID from URL param:', trimmed)
    setAutoLoading(true)
    setAutoError('')
    resolveAdminTargetByUID(trimmed).then(target => {
      if (!target) {
        setAutoLoading(false)
        setAutoError(`Restaurant UID "${trimmed}" not found. It may not exist in the database.`)
        return
      }
      localStorage.setItem(LAST_UID_KEY, trimmed)
      const dest = buildNavTarget(target)
      console.log('[MasterControl] Auto-navigating to:', dest)
      goToDest(dest, { replace: true })
    }).catch(err => {
      console.error('[MasterControl] Auto-navigate failed:', err)
      setAutoLoading(false)
      setAutoError('Failed to resolve restaurant. Please try entering the UID manually.')
    })
  }, [uidParam, allowed, navigate])

  // Build the navigation target.
  // Returns either a relative path (for same-subdomain React Router navigate)
  // or an absolute URL (for cross-subdomain window.location.href redirect).
  //
  // All slug-based URLs include ?role=menu_studio so RestaurantDashboard
  // activates the correct role on load (instead of inheriting whatever was
  // previously stored in localStorage).
  function buildNavTarget(target) {
    const sub = getSubdomain()

    // dashboard.exzibo.online — use canonical slug URL with from=master so
    // RestaurantDashboard activates menu_studio role AND passes fromMaster to AdminDashboard
    if (sub === 'dashboard') {
      if (target.id === 'default') return '/admin/default?from=master'
      return target.slug
        ? `/${target.slug}/orders?role=menu_studio&from=master`
        : `/admin/${target.id}?from=master`
    }

    // superadmin.exzibo.online — cross-subdomain redirect to dashboard subdomain
    if (sub === 'superadmin') {
      const path = target.id === 'default'
        ? '/admin/default?from=master'
        : target.slug
          ? `/${target.slug}/orders?role=menu_studio&from=master`
          : `/admin/${target.id}?from=master`
      return `https://dashboard.exzibo.online${path}`
    }

    // Default (dev / Replit preview / bare domain)
    try { localStorage.setItem('exzibo_active_role', 'menu_studio') } catch {}
    if (target.id === 'default') return '/admin/default?from=master'
    return `/admin/${target.id}?from=master`
  }

  // Helper: navigate to a dest that may be absolute (cross-subdomain) or relative
  function goToDest(dest, opts = {}) {
    if (dest.startsWith('http://') || dest.startsWith('https://')) {
      window.location.href = dest
    } else {
      navigate(dest, opts)
    }
  }

  async function accessPanel(value, setErr) {
    const trimmed = String(value || '').trim()
    if (!trimmed) {
      setErr('Please enter a Restaurant UID')
      return
    }
    setErr('')
    setAccessLoading(true)
    try {
      console.log('[MasterControl] Searching for UID:', trimmed)
      const target = await resolveAdminTargetByUID(trimmed)
      if (!target) {
        setErr('UID not found — verify the UID and try again')
        console.warn('[MasterControl] accessPanel: UID not resolved:', trimmed)
        return
      }
      localStorage.setItem(LAST_UID_KEY, trimmed)
      const dest = buildNavTarget(target)
      console.log('[MasterControl] Navigating to:', dest)
      goToDest(dest)
    } catch (err) {
      console.error('[MasterControl] accessPanel error:', err)
      setErr(`Search failed: ${err.message || 'check your connection and try again'}`)
    } finally {
      setAccessLoading(false)
    }
  }

  if (allowed === null) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '14px' }}>
          Verifying access…
        </div>
      </div>
    )
  }

  if (autoLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            border: '3px solid rgba(168,85,247,0.2)',
            borderTopColor: '#A855F7',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ color: '#888', fontSize: '13px', letterSpacing: '0.05em' }}>
            Opening Master Control for UID: {uidParam}…
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (autoError) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <AlertCircle size={32} color="#EF4444" />
          <span style={{ color: '#EF4444', fontSize: '14px' }}>{autoError}</span>
          <button
            onClick={() => navigate('/master-control')}
            style={{
              marginTop: '8px', padding: '10px 20px',
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)',
              borderRadius: '10px', color: '#A855F7',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            ← Back to Master Control
          </button>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '14px' }}>
          Access denied. Redirecting…
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="Menu Studio" showSearch={false} />


        <main style={{ flex: 1, overflowY: 'auto', padding: '32px', position: 'relative' }}>


          <div style={{ position: 'absolute', top: '24px', right: '32px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* NOTIFICATION button */}
            <button
              onClick={() => setShowDrawer(true)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                background: unreadCount > 0 ? 'rgba(232,50,26,0.1)' : 'rgba(255,255,255,0.05)',
                border: unreadCount > 0 ? '1px solid rgba(232,50,26,0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: unreadCount > 0 ? '#E8321A' : '#888',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(232,50,26,0.15)'
                e.currentTarget.style.borderColor = 'rgba(232,50,26,0.4)'
                e.currentTarget.style.color = '#E8321A'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = unreadCount > 0 ? 'rgba(232,50,26,0.1)' : 'rgba(255,255,255,0.05)'
                e.currentTarget.style.borderColor = unreadCount > 0 ? 'rgba(232,50,26,0.3)' : 'rgba(255,255,255,0.1)'
                e.currentTarget.style.color = unreadCount > 0 ? '#E8321A' : '#888'
              }}
            >
              <BellRing size={15} />
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  minWidth: '18px',
                  height: '18px',
                  borderRadius: '99px',
                  background: '#E8321A',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  boxShadow: '0 0 10px rgba(232,50,26,0.5)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

          </div>

          <div style={{ maxWidth: '640px', margin: '60px auto 0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '16px',
            }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'rgba(232,50,26,0.12)',
                border: '1px solid rgba(232,50,26,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ShieldCheck size={26} color="#E8321A" />
              </div>
              <div>
                <h1 style={{
                  margin: 0,
                  fontSize: '32px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#fff',
                }}>
                  Menu Studio
                </h1>
                <p style={{ margin: '4px 0 0', color: '#777', fontSize: '13px' }}>
                  Universal restaurant admin loader
                </p>
              </div>
            </div>

            {/* ── Pinned master account ── */}
            <div style={{
              background: '#111',
              border: '1px solid rgba(232,50,26,0.18)',
              borderRadius: '20px',
              padding: '20px 28px',
              marginTop: '32px',
            }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: '#555',
                textTransform: 'uppercase',
                marginBottom: '14px',
              }}>
                Your Account
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '5px' }}>UID</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ccc', fontFamily: 'monospace', letterSpacing: '0.03em', wordBreak: 'break-all' }}>
                    {user?.id || '—'}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '5px' }}>Role</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#E8321A', boxShadow: '0 0 8px rgba(232,50,26,0.7)', display: 'inline-block' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#E8321A', letterSpacing: '0.08em' }}>MASTER</span>
                  </div>
                </div>
                <button
                  onClick={() => !accessLoading && accessPanel(user?.id || '', setInlineError)}
                  disabled={accessLoading || !user?.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    background: '#E8321A', border: 'none', borderRadius: '10px',
                    color: '#fff', padding: '11px 22px',
                    fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', flexShrink: 0,
                    cursor: (accessLoading || !user?.id) ? 'default' : 'pointer',
                    opacity: (accessLoading || !user?.id) ? 0.5 : 1,
                    transition: 'box-shadow 0.2s',
                  }}
                  onMouseEnter={e => { if (!accessLoading && user?.id) e.currentTarget.style.boxShadow = '0 0 22px rgba(232,50,26,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                >
                  <ArrowRight size={14} />
                  VIEW
                </button>
              </div>
            </div>

            {/* ── Enter restaurant UID ── */}
            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '32px',
              marginTop: '16px',
            }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: '#888',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}>
                Enter Restaurant UID
              </label>
              <div style={{
                display: 'flex',
                gap: '10px',
              }}>
                <input
                  value={inlineUid}
                  onChange={e => { setInlineUid(e.target.value); setInlineError('') }}
                  onKeyDown={e => e.key === 'Enter' && !accessLoading && accessPanel(inlineUid, setInlineError)}
                  placeholder="e.g. 0000000001 or 8472019465"
                  disabled={accessLoading}
                  style={{
                    flex: 1,
                    background: '#0A0A0A',
                    border: `1px solid ${inlineError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    color: '#fff',
                    fontSize: '15px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    opacity: accessLoading ? 0.6 : 1,
                  }}
                />
                <button
                  onClick={() => !accessLoading && accessPanel(inlineUid, setInlineError)}
                  disabled={accessLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: accessLoading ? 'rgba(232,50,26,0.5)' : '#E8321A',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#fff',
                    padding: '14px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: accessLoading ? 'default' : 'pointer',
                    transition: 'box-shadow 0.2s, background 0.2s',
                    minWidth: '140px',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={e => { if (!accessLoading) e.currentTarget.style.boxShadow = '0 0 25px rgba(232,50,26,0.45)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                >
                  {accessLoading ? (
                    <>
                      <div style={{
                        width: '13px', height: '13px', borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        animation: 'mcSpin 0.7s linear infinite',
                        flexShrink: 0,
                      }} />
                      Searching…
                    </>
                  ) : (
                    <>
                      Access Panel
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
              {inlineError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '12px',
                  color: '#EF4444',
                  fontSize: '13px',
                }}>
                  <AlertCircle size={14} />
                  {inlineError}
                </div>
              )}
              <p style={{ margin: '20px 0 0', color: '#555', fontSize: '12px', lineHeight: 1.6 }}>
                Paste a restaurant's UID to instantly load its admin panel. Only Super Admins can use this entry point.
              </p>
            </div>
          </div>

        </main>
      </div>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '440px',
              maxWidth: '90vw',
              background: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LogIn size={18} color="#E8321A" />
                <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 700, letterSpacing: '0.02em' }}>
                  Master Login
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              Restaurant UID
            </label>
            <input
              autoFocus
              value={uid}
              onChange={e => { setUid(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && accessPanel(uid, setError)}
              placeholder="Paste Restaurant UID..."
              style={{
                width: '100%',
                background: '#0A0A0A',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '10px',
                color: '#EF4444',
                fontSize: '12px',
              }}>
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            <button
              onClick={() => !accessLoading && accessPanel(uid, setError)}
              disabled={accessLoading}
              style={{
                width: '100%',
                marginTop: '20px',
                background: accessLoading ? 'rgba(232,50,26,0.5)' : '#E8321A',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                padding: '13px',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: accessLoading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background 0.2s',
              }}
            >
              {accessLoading ? (
                <>
                  <div style={{
                    width: '13px', height: '13px', borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    animation: 'mcSpin 0.7s linear infinite',
                  }} />
                  Searching…
                </>
              ) : (
                <>
                  Access Panel
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Help Requests Drawer ── */}
      <HelpRequestsDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        onUnreadChange={count => setUnreadCount(count)}
      />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.75; transform: scale(0.92); }
        }
        @keyframes mcSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
