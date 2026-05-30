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
import { useParams, useNavigate } from 'react-router-dom'
import { useRole } from '../context/RoleContext'
import { useRestaurantRole } from '../hooks/useRestaurantRole'
import { getRestaurantBySlug } from '../lib/db'
import AdminDashboard from './AdminDashboard'

// ── Access control matrix ─────────────────────────────────────────────────
const PAGE_ACCESS = {
  orders:       ['menu_studio', 'owner', 'admin', 'staff'],
  bookings:     ['menu_studio', 'owner', 'admin', 'staff'],
  booking:      ['menu_studio', 'owner', 'admin', 'staff'],
  menu:         ['menu_studio', 'owner', 'admin'],
  tables:       ['menu_studio', 'owner', 'admin'],
  analytics:    ['menu_studio', 'owner', 'admin'],
  settings:     ['menu_studio', 'owner', 'admin'],
  roles:        ['menu_studio', 'owner', 'admin'],
  subscription: ['menu_studio', 'owner'],
  profile:      ['menu_studio', 'owner', 'admin', 'staff'],
  dashboard:    ['menu_studio', 'owner', 'admin', 'staff'],
  admin:        ['menu_studio', 'owner', 'admin', 'staff'],
  manager:      ['menu_studio', 'owner', 'admin'],
  employee:     ['menu_studio', 'owner', 'admin', 'staff'],
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
  const { activateRole } = useRole()

  const [restaurant, setRestaurant]         = useState(null)
  const [restaurantLoading, setRestaurantLoading] = useState(true)
  const [notFound, setNotFound]             = useState(false)
  const [showPicker, setShowPicker]         = useState(false)

  // ── 1. Resolve restaurant slug ─────────────────────────────────
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

  // ── 2. Get role from localStorage ─────────────────────────────
  const { role, setRole } = useRestaurantRole(restaurant?.id)

  // ── 3. Activate role in RoleContext (AdminDashboard reads it) ──
  useEffect(() => {
    if (role) activateRole(role)
  }, [role, activateRole])

  // ── 4. Show picker when no role is stored yet ─────────────────
  useEffect(() => {
    if (!restaurantLoading && restaurant && !role) {
      setShowPicker(true)
    }
  }, [restaurantLoading, restaurant, role])

  // ── 5. Enforce access matrix ───────────────────────────────────
  useEffect(() => {
    if (!role || !pageSlug) return
    const allowed = PAGE_ACCESS[pageSlug]
    if (allowed && !allowed.includes(role)) {
      navigate(`/${restaurantSlug}/orders`, { replace: true })
    }
  }, [role, pageSlug, restaurantSlug, navigate])

  // ── 6. /roles → redirect to /admin/:id/team ───────────────────
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
  if (restaurantLoading) return <FullPageLoader />
  if (notFound) return <NotFoundPage slug={restaurantSlug} />
  if (pageSlug === 'roles' && restaurant && role) return <FullPageLoader />

  // Show role picker overlay (on top of a light background while loading)
  if (showPicker || (!role && restaurant)) {
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

  if (!role) return <FullPageLoader />

  const section = PAGE_TO_SECTION[pageSlug] || 'orders'

  return (
    <AdminDashboard
      restaurantId={restaurant.id}
      initialSection={section}
    />
  )
}
