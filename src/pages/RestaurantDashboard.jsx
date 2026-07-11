/**
 * RestaurantDashboard — publicly accessible role-based routing layer
 *
 * URL: /:restaurantSlug/:pageSlug  (dashboard.exzibo.online/danab/orders)
 *
 * NO login required. NO auth redirect. Role is stored in localStorage.
 * On first visit (no stored role), an in-dashboard role picker is shown.
 * Role can be changed anytime via the switcher injected into the UI.
 */

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { useRole } from '../context/RoleContext'
import { useRestaurantRole } from '../hooks/useRestaurantRole'
import { useAuth } from '../context/AuthContext'
import { getRestaurantBySlug } from '../lib/db'
import { DISABLE_AUTH } from '../lib/env'
import AdminDashboard from './AdminDashboard'
import ProfilePage from './ProfilePage'

const VALID_ROLES = new Set(['menu_studio', 'owner', 'admin', 'staff', 'superadmin'])

// Page slugs that are actually role names — redirect them to /orders.
// These arrive when the dynamic /:restaurantSlug/:pageSlug route catches URLs
// like /danab/owner or /danab/menu_studio that were previously handled by
// RoleSlugRedirect static routes.
const ROLE_SLUG_PAGES = new Set(['owner', 'admin', 'staff', 'menu_studio', 'manager', 'employee', 'dashboard'])

// ── Access control matrix ─────────────────────────────────────────────────
const PAGE_ACCESS = {
  orders:       ['superadmin', 'menu_studio', 'owner', 'admin', 'staff'],
  bookings:     ['superadmin', 'menu_studio', 'owner', 'admin', 'staff'],
  booking:      ['superadmin', 'menu_studio', 'owner', 'admin', 'staff'],
  menu:         ['superadmin', 'menu_studio', 'owner', 'admin'],
  tables:       ['superadmin', 'menu_studio', 'owner', 'admin'],
  analytics:    ['superadmin', 'menu_studio', 'owner', 'admin'],
  settings:     ['superadmin', 'menu_studio', 'owner', 'admin'],
  roles:        ['superadmin', 'menu_studio', 'owner', 'admin'],
  subscription: ['superadmin', 'menu_studio', 'owner'],
  profile:      ['superadmin', 'menu_studio', 'owner', 'admin', 'staff'],
  dashboard:    ['superadmin', 'menu_studio', 'owner', 'admin', 'staff'],
  admin:        ['superadmin', 'menu_studio', 'owner', 'admin', 'staff'],
  manager:      ['superadmin', 'menu_studio', 'owner', 'admin'],
  employee:     ['superadmin', 'menu_studio', 'owner', 'admin', 'staff'],
}

// Map URL page slugs → AdminDashboard internal section IDs
const PAGE_TO_SECTION = {
  orders:       'orders',
  bookings:     'bookings',
  booking:      'bookings',
  menu:         'menu',
  tables:       'settings',
  analytics:    'customers',
  settings:     'settings',
  subscription: 'settings',
  profile:      'profile',
  dashboard:    'orders',
  admin:        'orders',
  manager:      'orders',
  employee:     'orders',
}

// Role display config for the picker
const ROLE_CONFIG = {
  menu_studio: {
    label: 'Menu Studio',
    emoji: '⚡',
    color: '#6C63FF',
    bg: '#f0eeff',
    border: '#c4bfff',
    desc: 'Full platform access — all pages, all controls',
  },
  owner: {
    label: 'Owner',
    emoji: '👑',
    color: '#F59E0B',
    bg: '#fffbeb',
    border: '#fde68a',
    desc: 'Complete restaurant management, subscription & billing',
  },
  admin: {
    label: 'Admin',
    emoji: '🛠',
    color: '#3B82F6',
    bg: '#eff6ff',
    border: '#bfdbfe',
    desc: 'Operational access — orders, menu, analytics, settings',
  },
  staff: {
    label: 'Staff',
    emoji: '👤',
    color: '#10B981',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    desc: 'Limited access — orders, bookings, profile',
  },
}

// ── Role picker overlay ───────────────────────────────────────────────────

function RolePicker({ restaurantName, onSelect }) {
  const [selected, setSelected] = useState(null)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.7)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#fff',
        borderRadius: 24,
        padding: '32px 28px 28px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: '#f0eeff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: 24,
          }}>🍽️</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
            {restaurantName || 'Restaurant Dashboard'}
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
            Select your access level to continue
          </p>
        </div>

        {/* Role cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {Object.entries(ROLE_CONFIG).map(([roleKey, cfg]) => {
            const isSelected = selected === roleKey
            return (
              <button
                key={roleKey}
                onClick={() => setSelected(roleKey)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px',
                  background: isSelected ? cfg.bg : '#f8fafc',
                  border: `2px solid ${isSelected ? cfg.border : '#e2e8f0'}`,
                  borderRadius: 14,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  width: '100%',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: isSelected ? cfg.bg : '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                  border: isSelected ? `1.5px solid ${cfg.border}` : '1.5px solid transparent',
                }}>{cfg.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: isSelected ? cfg.color : '#0f172a',
                    marginBottom: 2,
                  }}>{cfg.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, lineHeight: 1.4 }}>
                    {cfg.desc}
                  </div>
                </div>
                {isSelected && (
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: cfg.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Confirm */}
        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          style={{
            width: '100%',
            padding: '13px',
            background: selected ? '#6C63FF' : '#e2e8f0',
            color: selected ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: selected ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
          }}
        >
          {selected ? `Continue as ${ROLE_CONFIG[selected]?.label}` : 'Select a role to continue'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#cbd5e1', marginTop: 14, marginBottom: 0 }}>
          Your selection is saved locally. You can change it anytime.
        </p>
      </div>
    </div>
  )
}

// ── Page loader ───────────────────────────────────────────────────────────

function FullPageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f9fa',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          border: '3px solid #e8eaf0',
          borderTop: '3px solid #6C63FF',
          animation: 'spin 0.7s linear infinite',
          margin: '0 auto 14px',
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, margin: 0 }}>Loading…</p>
      </div>
    </div>
  )
}

// ── Not found ─────────────────────────────────────────────────────────────

function NotFoundPage({ slug }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8f9fa', padding: '32px 16px',
    }}>
      <div style={{
        textAlign: 'center', maxWidth: 360,
        background: '#fff', borderRadius: 20, padding: '48px 32px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, background: '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px', fontSize: 26,
        }}>🍽️</div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
          Restaurant Not Found
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 22px', lineHeight: 1.6 }}>
          No restaurant with link <strong style={{ color: '#6C63FF' }}>/{slug}</strong> exists.
          The link may be incorrect or the restaurant has been removed.
        </p>
        <a href="https://exzibo.online" style={{
          display: 'inline-block', padding: '10px 22px',
          background: '#6C63FF', color: '#fff', borderRadius: 10,
          fontWeight: 700, fontSize: 13, textDecoration: 'none',
        }}>Go to Exzibo</a>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function RestaurantDashboard() {
  const { restaurantSlug, pageSlug = 'orders' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activateRole } = useRole()
  const { user, loading: authLoading, signOut } = useAuth()

  // ── Production session auth state (not used in DISABLE_AUTH/dev mode) ──
  const [sessionRole, setSessionRole]     = useState(null)
  const [sessionChecked, setSessionChecked] = useState(DISABLE_AUTH)
  const [sessionDenied, setSessionDenied]   = useState(false)

  // ── 0. Read ?role= and ?from=master URL params synchronously at init ────
  // navigation.js injects ?role=<normalizedRole> when opening a
  // role-specific link (e.g. Menu Studio → ?role=menu_studio).
  // We pre-populate the global localStorage key immediately so that
  // useRestaurantRole() returns the correct role on its very first call,
  // before the restaurant row has even loaded.
  // ?from=master is captured here and passed as a prop to AdminDashboard
  // so the Menu Studio special features (send button, live orders toggle)
  // are shown even after the URL is cleaned to the canonical slug form.
  const [fromMaster] = useState(() => searchParams.get('from') === 'master')
  const [urlRoleParam] = useState(() => {
    const p = searchParams.get('role')
    if (p && VALID_ROLES.has(p)) {
      try { localStorage.setItem('exzibo_active_role', p) } catch {}
      return p
    }
    return null
  })

  const [restaurant, setRestaurant]             = useState(null)
  const [restaurantLoading, setRestaurantLoading] = useState(true)
  const [notFound, setNotFound]                 = useState(false)
  const [showPicker, setShowPicker]             = useState(false)

  // ── 1. Resolve restaurant slug → row ───────────────────────────
  useEffect(() => {
    if (!restaurantSlug) { setNotFound(true); setRestaurantLoading(false); return }
    setRestaurantLoading(true)
    setNotFound(false)

    getRestaurantBySlug(restaurantSlug)
      .then(r => {
        if (!r) setNotFound(true)
        else setRestaurant(r)
      })
      .catch(() => setNotFound(true))
      .finally(() => setRestaurantLoading(false))
  }, [restaurantSlug])

  // ── 1b. In production: check session + team membership once restaurant loads
  useEffect(() => {
    if (DISABLE_AUTH || !restaurant) return
    if (sessionChecked) return

    // No Better Auth session → redirect to login
    if (!authLoading && !user) {
      try { localStorage.setItem('auth_redirect', window.location.pathname) } catch {}
      navigate('/auth', { replace: true })
      return
    }
    if (authLoading || !user) return  // wait for session to resolve

    fetch(`/api/auth-check?type=member&restaurantId=${encodeURIComponent(restaurant.id)}`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(data => {
        if (data.allowed && data.role) {
          setSessionRole(data.role)
        } else {
          setSessionDenied(true)
        }
        setSessionChecked(true)
      })
      .catch(() => {
        setSessionDenied(true)
        setSessionChecked(true)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant, authLoading, user, sessionChecked])

  // ── 2. Get / set role via localStorage ─────────────────────────
  const { role: localRole, setRole } = useRestaurantRole(restaurant?.id)
  // In production use DB-sourced role; in dev use localStorage
  const role = DISABLE_AUTH ? localRole : sessionRole

  // ── 3. Persist URL role param once restaurant.id is known ──────
  // Saves the per-restaurant key in addition to the global fallback
  // already set in the useState initializer, then cleans the URL.
  useEffect(() => {
    if (urlRoleParam && restaurant?.id) {
      setRole(urlRoleParam)                         // saves per-restaurant + global key
      // Strip the ?role= param so the canonical clean URL is what the user sees
      navigate(`/${restaurantSlug}/${pageSlug}`, { replace: true })
    }
  // Only run when restaurant.id first becomes available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id])

  // ── 4. Activate role in RoleContext (AdminDashboard reads it) ──
  useEffect(() => {
    if (role) activateRole(role)
  }, [role, activateRole])

  // ── 5. Show picker when no role is stored (dev/DISABLE_AUTH only) ─
  useEffect(() => {
    if (!DISABLE_AUTH) return  // in production, no picker — use session role
    if (!restaurantLoading && restaurant && !role) {
      setShowPicker(true)
    }
  }, [restaurantLoading, restaurant, role])

  // ── 6. Enforce access matrix ───────────────────────────────────
  useEffect(() => {
    if (!role || !pageSlug) return
    const allowed = PAGE_ACCESS[pageSlug]
    if (allowed && !allowed.includes(role)) {
      navigate(`/${restaurantSlug}/orders`, { replace: true })
    }
  }, [role, pageSlug, restaurantSlug, navigate])

  // ── 7. /roles → redirect to /admin/:id/team ───────────────────
  useEffect(() => {
    if (restaurant && role && pageSlug === 'roles') {
      navigate(`/admin/${restaurant.id}/team`, { replace: true })
    }
  }, [restaurant, role, pageSlug, navigate])

  // ── Handle role picker selection ───────────────────────────────
  function handleRoleSelect(selectedRole) {
    setRole(selectedRole)
    setShowPicker(false)
  }

  // ── Render ─────────────────────────────────────────────────────

  // Role-name page slugs (e.g. /danab/owner) → redirect to /orders.
  // The dynamic /:restaurantSlug/:pageSlug route catches these now.
  if (ROLE_SLUG_PAGES.has(pageSlug)) {
    return <Navigate to={`/${restaurantSlug}/orders`} replace />
  }

  if (restaurantLoading) return <FullPageLoader />
  if (notFound) return <NotFoundPage slug={restaurantSlug} />
  if (pageSlug === 'roles' && restaurant && role) return <FullPageLoader />

  // ── Production auth guards (skipped in DISABLE_AUTH/dev mode) ──────────
  if (!DISABLE_AUTH) {
    if (authLoading || !sessionChecked) return <FullPageLoader />
    if (sessionDenied) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0A0A0A',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Inter', sans-serif", gap: '16px',
        }}>
          <div style={{ fontSize: '40px' }}>🔒</div>
          <div style={{ fontWeight: 800, fontSize: '22px', color: '#fff' }}>Access Denied</div>
          <div style={{ color: '#555', fontSize: '14px', textAlign: 'center', maxWidth: '320px' }}>
            Your account is not a member of this restaurant. Contact the restaurant owner to be added.
          </div>
          <button
            onClick={() => { signOut(); window.location.href = '/auth' }}
            style={{
              marginTop: '8px', padding: '10px 24px', borderRadius: '10px',
              background: '#E8321A', border: 'none', color: '#fff',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}
          >Sign out</button>
        </div>
      )
    }
  }

  // Show role picker when no role is set and no URL param provided it
  if (showPicker || (!role && !urlRoleParam && restaurant && DISABLE_AUTH)) {
    return (
      <>
        <div style={{ minHeight: '100vh', background: '#f8f9fa' }} />
        <RolePicker
          restaurantName={restaurant?.name}
          onSelect={handleRoleSelect}
        />
      </>
    )
  }

  // Still waiting for the URL role param to be persisted
  if (!role) return <FullPageLoader />

  // Profile is a full-page component, not a section inside AdminDashboard
  if (pageSlug === 'profile') {
    return <ProfilePage restaurantId={restaurant.id} />
  }

  const section = PAGE_TO_SECTION[pageSlug] || 'orders'

  // menu_studio role always gets the full Master Control view — send button,
  // Show Live Orders toggle, MENU STUDIO label — regardless of how they arrived.
  const effectiveFromMaster = fromMaster || role === 'menu_studio'

  return (
    <AdminDashboard
      restaurantId={restaurant.id}
      initialSection={section}
      fromMaster={effectiveFromMaster}
    />
  )
}
