import React, { useState } from 'react'
import { ShieldPlus, Shield, Check, Lock, Search, ExternalLink, UserCheck, Crown, UtensilsCrossed } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { supabase } from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import { openRoleDashboard } from '../lib/navigation'
import { stripRoleSuffix, generateRoleUID } from '../lib/uid'

const ACCENT   = '#E8321A'
const BG_MAIN  = '#0A0A0A'
const BG_CARD  = 'rgba(255,255,255,0.03)'
const BORDER   = 'rgba(255,255,255,0.07)'
const TEXT_DIM = '#666'
const TEXT_MID = '#999'

const ALL_PERMISSIONS = [
  { key: 'dashboard',      label: 'Dashboard',       desc: 'View the main dashboard and stats' },
  { key: 'orders',         label: 'Orders',          desc: 'View and manage customer orders' },
  { key: 'bookings',       label: 'Bookings',        desc: 'View and manage table bookings' },
  { key: 'menuEdit',       label: 'Menu Edit',       desc: 'Add, edit and remove menu items' },
  { key: 'analytics',      label: 'Analytics',       desc: 'Access revenue and traffic analytics' },
  { key: 'settings',       label: 'Settings',        desc: 'Change restaurant settings' },
  { key: 'profile',        label: 'Profile',         desc: 'View and update profile info' },
  { key: 'teamManagement', label: 'Team Management', desc: 'Invite and manage team members' },
]

const DEFAULT_ROLES = [
  {
    id: 'menuStudio',
    name: 'Menu Studio',
    description: 'Full access to menu creation and studio editing tools',
    permissions: ['dashboard', 'menuEdit'],
    color: '#A855F7',
    isDefault: true,
  },
  {
    id: 'owner',
    name: 'Owner',
    description: 'Full access to all features and settings',
    permissions: ['dashboard', 'menuEdit', 'settings', 'profile', 'teamManagement', 'orders', 'bookings', 'analytics'],
    color: '#E8321A',
    isDefault: true,
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Can manage operations but not team or billing',
    permissions: ['dashboard', 'orders', 'bookings', 'menuEdit', 'analytics', 'settings', 'profile'],
    color: '#3B82F6',
    isDefault: true,
  },
  {
    id: 'staff',
    name: 'Staff',
    description: 'Front-of-house access only',
    permissions: ['orders', 'bookings', 'profile'],
    color: '#22c55e',
    isDefault: true,
  },
]

const ASSIGNABLE_ROLES = [
  {
    key: 'owner',
    label: 'Owner',
    description: 'Full access to all features and settings',
    cardBg: '#F5A623',
    textColor: '#1A1A1A',
    icon: Crown,
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'Can manage operations but not team or billing',
    cardBg: '#E91E8C',
    textColor: '#1A1A1A',
    icon: Shield,
  },
  {
    key: 'staff',
    label: 'Staff',
    description: 'Front-of-house access only',
    cardBg: '#FFFFFF',
    textColor: '#1A1A1A',
    icon: UtensilsCrossed,
  },
]

function PermissionBadge({ perm, granted }) {
  const meta = ALL_PERMISSIONS.find(p => p.key === perm)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 9px', borderRadius: '99px',
      background: granted ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${granted ? 'rgba(34,197,94,0.25)' : BORDER}`,
      color: granted ? '#4ade80' : TEXT_DIM,
      fontSize: '11px', fontWeight: 600,
    }}>
      {granted && <Check size={9} />}
      {meta?.label || perm}
    </span>
  )
}

function RoleCard({ role }) {
  return (
    <div style={{
      background: BG_CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: '16px',
      padding: '22px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: `${role.color}18`,
            border: `1px solid ${role.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Shield size={17} color={role.color} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{role.name}</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '2px 7px', borderRadius: '99px',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${BORDER}`,
                fontSize: '9px', fontWeight: 700,
                color: TEXT_DIM, letterSpacing: '0.08em',
              }}>
                <Lock size={8} /> DEFAULT
              </span>
            </div>
            <div style={{ fontSize: '12px', color: TEXT_MID, marginTop: '2px' }}>{role.description}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {ALL_PERMISSIONS.map(p => (
          <PermissionBadge key={p.key} perm={p.key} granted={role.permissions.includes(p.key)} />
        ))}
      </div>
    </div>
  )
}

function SectionDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '32px 0 20px' }}>
      <div style={{ flex: 1, height: '1px', background: BORDER }} />
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', color: TEXT_DIM, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: BORDER }} />
    </div>
  )
}

function AssignRoleSection() {
  const navigate = useNavigate()
  const { activateRole } = useRole()

  const [uid, setUid] = useState('')
  const [loading, setLoading] = useState(false)
  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [toast, setToast] = useState(null)
  const [assignedRoles, setAssignedRoles] = useState({})

  function showToast(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSearch() {
    const trimmed = stripRoleSuffix(uid.trim())
    if (!trimmed) return
    setLoading(true)
    setRestaurant(null)
    setNotFound(false)
    setAssignedRoles({})

    const { data, error } = await supabase
      .from('restaurants')
      .select('id, uid, name, slug')
      .eq('uid', trimmed)
      .maybeSingle()

    setLoading(false)

    if (error || !data) {
      setNotFound(true)
    } else {
      setRestaurant(data)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
  }

  async function handleAddRole(roleKey) {
    if (!restaurant) return

    const storageKey = `exzibo_assigned_role_${restaurant.uid}`
    const prev = JSON.parse(localStorage.getItem(storageKey) || '{}')
    localStorage.setItem(storageKey, JSON.stringify({ ...prev, [roleKey]: true, restaurantId: restaurant.id }))

    setAssignedRoles(r => ({ ...r, [roleKey]: true }))
    activateRole(roleKey)
    showToast('Role assigned successfully.')
  }

  function handleViewDashboard(roleKey) {
    if (!restaurant) return
    activateRole(roleKey)
    openRoleDashboard(navigate, restaurant, roleKey)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid ${BORDER}`,
      borderRadius: '18px',
      padding: '24px 28px',
      marginBottom: '8px',
    }}>
      {/* Section label */}
      <div style={{
        fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em',
        color: TEXT_DIM, textTransform: 'uppercase', marginBottom: '16px',
      }}>
        Assign Role by UID
      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} color={TEXT_DIM} style={{
            position: 'absolute', left: '14px', top: '50%',
            transform: 'translateY(-50%)', pointerEvents: 'none',
          }} />
          <input
            value={uid}
            onChange={e => { setUid(e.target.value); setNotFound(false); setRestaurant(null); setAssignedRoles({}) }}
            onKeyDown={handleKeyDown}
            placeholder="e.g. REST-XXXXXXXX"
            style={{
              width: '100%', padding: '12px 14px 12px 40px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${notFound ? ACCENT : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '12px', color: '#fff', fontSize: '14px',
              outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { if (!notFound) e.target.style.borderColor = 'rgba(255,255,255,0.25)' }}
            onBlur={e => { if (!notFound) e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !uid.trim()}
          style={{
            padding: '12px 24px', borderRadius: '12px',
            background: loading ? 'rgba(34,197,94,0.4)' : '#22c55e',
            border: 'none', color: '#fff',
            fontSize: '12px', fontWeight: 800,
            letterSpacing: '0.08em', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: !uid.trim() ? 0.5 : 1,
            transition: 'all 0.15s', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: '7px',
          }}
          onMouseEnter={e => { if (!loading && uid.trim()) e.currentTarget.style.background = '#16a34a' }}
          onMouseLeave={e => { if (!loading && uid.trim()) e.currentTarget.style.background = '#22c55e' }}
        >
          {loading ? 'Searching…' : 'ENTER'}
        </button>
      </div>

      {/* Not found error */}
      {notFound && (
        <div style={{
          marginTop: '12px', padding: '10px 14px',
          background: 'rgba(232,50,26,0.08)',
          border: '1px solid rgba(232,50,26,0.2)',
          borderRadius: '10px', fontSize: '13px',
          color: '#F87171', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '16px' }}>⚠</span>
          No restaurant found with this UID. Please check and try again.
        </div>
      )}

      {/* Restaurant found banner */}
      {restaurant && (
        <div style={{
          marginTop: '14px', padding: '10px 16px',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.22)',
          borderRadius: '10px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <Check size={15} color="#4ade80" />
          <div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80' }}>
              {restaurant.name || 'Restaurant'}
            </span>
            <span style={{ fontSize: '12px', color: TEXT_MID, marginLeft: '10px' }}>
              UID: {restaurant.uid}
            </span>
          </div>
        </div>
      )}

      {/* Three role cards */}
      {restaurant && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '14px',
          marginTop: '20px',
        }}>
          {ASSIGNABLE_ROLES.map(role => {
            const Icon = role.icon
            const assigned = assignedRoles[role.key]
            return (
              <div
                key={role.key}
                style={{
                  background: role.cardBg,
                  borderRadius: '12px',
                  padding: '22px 20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  display: 'flex', flexDirection: 'column', gap: '0',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: 'rgba(0,0,0,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '12px',
                }}>
                  <Icon size={20} color={role.textColor} />
                </div>

                {/* Title */}
                <div style={{ fontSize: '17px', fontWeight: 800, color: role.textColor, marginBottom: '6px' }}>
                  {role.label}
                </div>

                {/* Description */}
                <div style={{ fontSize: '12px', color: role.textColor, opacity: 0.7, lineHeight: 1.45, marginBottom: '12px', flex: 1 }}>
                  {role.description}
                </div>

                {/* Role UID pill — only shown inside this section, never outside */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(0,0,0,0.18)',
                  border: '1px solid rgba(0,0,0,0.22)',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  marginBottom: '14px',
                  alignSelf: 'flex-start',
                }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em',
                    color: role.textColor, opacity: 0.55, textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>
                    Role UID
                  </span>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, fontFamily: 'monospace',
                    color: role.textColor, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                  }}>
                    {generateRoleUID(restaurant.uid, role.key)}
                  </span>
                </div>

                {/* Assigned badge */}
                {assigned && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    marginBottom: '10px',
                    fontSize: '11px', fontWeight: 700,
                    color: role.textColor, opacity: 0.8,
                  }}>
                    <UserCheck size={13} />
                    Assigned
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => handleAddRole(role.key)}
                    style={{
                      width: '100%', padding: '9px 0',
                      background: assigned ? 'rgba(0,0,0,0.5)' : '#1A1A1A',
                      border: 'none', borderRadius: '8px',
                      color: '#fff', fontSize: '12px', fontWeight: 800,
                      letterSpacing: '0.04em', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    {assigned ? <><Check size={12} /> Assigned</> : 'Add Role'}
                  </button>
                  <button
                    onClick={() => handleViewDashboard(role.key)}
                    style={{
                      width: '100%', padding: '9px 0',
                      background: 'transparent',
                      border: `1.5px solid rgba(0,0,0,0.25)`,
                      borderRadius: '8px',
                      color: role.textColor, fontSize: '12px', fontWeight: 700,
                      letterSpacing: '0.04em', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <ExternalLink size={12} />
                    View Dashboard
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? '#22c55e' : ACCENT,
          color: '#fff', padding: '12px 24px', borderRadius: '12px',
          fontSize: '13px', fontWeight: 700,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          zIndex: 9999, animation: 'fadeInUp 0.25s ease',
          display: 'flex', alignItems: 'center', gap: '8px',
          whiteSpace: 'nowrap',
        }}>
          <Check size={15} />
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function AddRolePage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: BG_MAIN }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="ADD ROLE" />
        <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto', maxWidth: '900px' }}>

          {/* Page heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: 'rgba(232,50,26,0.1)',
              border: '1px solid rgba(232,50,26,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ShieldPlus size={22} color={ACCENT} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                Role Management
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: TEXT_MID }}>
                Define custom roles and control which features each role can access.
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '12px', margin: '28px 0 24px', flexWrap: 'wrap' }}>
            {[
              { label: 'Total Roles',           value: DEFAULT_ROLES.length },
              { label: 'Default Roles',          value: DEFAULT_ROLES.length },
              { label: 'Permissions Available',  value: ALL_PERMISSIONS.length },
            ].map(({ label, value }) => (
              <div key={label} style={{
                flex: '1 1 120px', padding: '16px 20px',
                background: BG_CARD, border: `1px solid ${BORDER}`,
                borderRadius: '14px',
              }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>{value}</div>
                <div style={{ fontSize: '11px', color: TEXT_MID, fontWeight: 600, marginTop: '2px', letterSpacing: '0.04em' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* ── ASSIGN ROLE BY UID section ── */}
          <AssignRoleSection />

          {/* All roles list */}
          <SectionDivider label={`All Roles (${DEFAULT_ROLES.length})`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {DEFAULT_ROLES.map(role => (
              <RoleCard key={role.id} role={role} />
            ))}
          </div>

          <div style={{ height: '48px' }} />
        </main>
      </div>
    </div>
  )
}
