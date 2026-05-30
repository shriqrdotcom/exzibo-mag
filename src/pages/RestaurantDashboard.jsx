/**
 * RestaurantDashboard — role-based routing layer
 *
 * URL pattern: /:restaurantSlug/:pageSlug
 * (e.g. dashboard.exzibo.online/spice-route/orders)
 *
 * Responsibilities:
 *  1. Resolve restaurantSlug → restaurant row
 *  2. Fetch current user's role via useRestaurantRole()
 *  3. Activate the role in RoleContext so AdminDashboard permission gates work
 *  4. Enforce the access control matrix; redirect to /orders when unauthorized
 *  5. Delegate rendering to AdminDashboard (or TeamMembers for /roles page)
 */

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../context/RoleContext'
import { useRestaurantRole } from '../hooks/useRestaurantRole'
import { getRestaurantBySlug } from '../lib/db'
import AdminDashboard from './AdminDashboard'

// ── Access control matrix ────────────────────────────────────────────────
// Each page slug maps to the set of roles that may visit it.
// Unauthorized access → silent redirect to orders.
const PAGE_ACCESS = {
  orders:       ['menu_studio', 'owner', 'admin', 'staff'],
  bookings:     ['menu_studio', 'owner', 'admin', 'staff'],
  booking:      ['menu_studio', 'owner', 'admin', 'staff'],  // URL alias
  menu:         ['menu_studio', 'owner', 'admin'],
  tables:       ['menu_studio', 'owner', 'admin'],
  analytics:    ['menu_studio', 'owner', 'admin'],
  settings:     ['menu_studio', 'owner', 'admin'],
  roles:        ['menu_studio', 'owner', 'admin'],
  subscription: ['menu_studio', 'owner'],
  profile:      ['menu_studio', 'owner', 'admin', 'staff'],
  dashboard:    ['menu_studio', 'owner', 'admin', 'staff'],
}

// Map URL page slugs → AdminDashboard internal section IDs
const PAGE_TO_SECTION = {
  orders:       'orders',
  bookings:     'bookings',
  booking:      'bookings',   // URL alias normalised here
  menu:         'menu',
  tables:       'settings',   // table config lives inside settings
  analytics:    'customers',
  settings:     'settings',
  subscription: 'settings',
  profile:      'profile',
  dashboard:    'orders',
}

// ── Inline UI helpers ─────────────────────────────────────────────────────

function FullPageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f9fa',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40, height: 40,
          borderRadius: '50%',
          border: '3px solid #e8eaf0',
          borderTop: '3px solid #6C63FF',
          animation: 'spin 0.7s linear infinite',
          margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600, margin: 0 }}>Loading…</p>
      </div>
    </div>
  )
}

function NotFoundPage({ slug }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f9fa', padding: '32px 16px',
    }}>
      <div style={{
        textAlign: 'center', maxWidth: 380,
        background: '#fff', borderRadius: 20,
        padding: '48px 36px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        border: '1px solid #f1f5f9',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: '#fef2f2', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 28,
        }}>🍽️</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
          Restaurant Not Found
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
          No restaurant with the link <strong style={{ color: '#6C63FF' }}>/{slug}</strong> was found.
          It may have been removed or the link is incorrect.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: '#6C63FF',
            color: '#fff',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Go Home
        </a>
      </div>
    </div>
  )
}

function AccessDeniedPage() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f9fa', padding: '32px 16px',
    }}>
      <div style={{
        textAlign: 'center', maxWidth: 380,
        background: '#fff', borderRadius: 20,
        padding: '48px 36px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        border: '1px solid #f1f5f9',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: '#fef2f2', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 28,
        }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
          Access Denied
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
          You don't have permission to access this restaurant's dashboard.
          Contact the restaurant owner to request access.
        </p>
        <button
          onClick={() => navigate('/auth', { replace: true })}
          style={{
            padding: '10px 24px',
            background: '#6C63FF',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Back to Login
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function RestaurantDashboard() {
  const { restaurantSlug, pageSlug = 'orders' } = useParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { activateRole } = useRole()

  const [restaurant, setRestaurant]           = useState(null)
  const [restaurantLoading, setRestaurantLoading] = useState(true)
  const [notFound, setNotFound]               = useState(false)
  const [roleReady, setRoleReady]             = useState(false)

  // ── 1. Auth guard ──────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      // Save the intended path so Auth can redirect back after login
      try { localStorage.setItem('auth_redirect', window.location.pathname) } catch {}
      navigate('/auth', { replace: true })
    }
  }, [authLoading, user, navigate])

  // ── 2. Resolve restaurant slug → row ───────────────────────────
  useEffect(() => {
    if (!restaurantSlug || !user) return
    setRestaurantLoading(true)
    setNotFound(false)
    setRoleReady(false)

    getRestaurantBySlug(restaurantSlug)
      .then(r => {
        if (!r) setNotFound(true)
        else setRestaurant(r)
      })
      .catch(() => setNotFound(true))
      .finally(() => setRestaurantLoading(false))
  }, [restaurantSlug, user])

  // ── 3. Fetch role from Supabase ────────────────────────────────
  const { role, loading: roleLoading } = useRestaurantRole(restaurant?.id)

  // ── 4. Activate role & enforce access matrix ───────────────────
  useEffect(() => {
    if (roleLoading || !restaurant) return

    if (!role) {
      // No role found → wait to show AccessDeniedPage (handled in render)
      setRoleReady(true)
      return
    }

    // Set role in shared RoleContext so AdminDashboard permission gates fire
    activateRole(role)
    setRoleReady(true)

    // Enforce page access
    const page = pageSlug || 'orders'
    const allowed = PAGE_ACCESS[page]
    if (allowed && !allowed.includes(role)) {
      navigate(`/${restaurantSlug}/orders`, { replace: true })
    }
  }, [role, roleLoading, restaurant, pageSlug, restaurantSlug, activateRole, navigate])

  // ── 5. Handle /roles → redirect to /admin/:id/team ────────────
  useEffect(() => {
    if (!roleReady || !restaurant) return
    if (pageSlug === 'roles') {
      navigate(`/admin/${restaurant.id}/team`, { replace: true })
    }
  }, [roleReady, restaurant, pageSlug, navigate])

  // ── Render ─────────────────────────────────────────────────────
  if (authLoading || restaurantLoading || (restaurant && roleLoading)) {
    return <FullPageLoader />
  }

  if (!user) return null  // redirect in progress

  if (notFound) return <NotFoundPage slug={restaurantSlug} />

  if (roleReady && !role) return <AccessDeniedPage />

  if (!roleReady) return <FullPageLoader />

  // roles page: redirect in progress
  if (pageSlug === 'roles') return <FullPageLoader />

  const section = PAGE_TO_SECTION[pageSlug] || 'orders'

  return (
    <AdminDashboard
      restaurantId={restaurant.id}
      initialSection={section}
    />
  )
}
