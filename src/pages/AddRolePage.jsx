import React from 'react'
import { ShieldPlus, Shield, Check, Lock } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'

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

export default function AddRolePage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: BG_MAIN }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="ADD ROLE" />
        <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto', maxWidth: '860px' }}>

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
          <div style={{ display: 'flex', gap: '12px', margin: '28px 0 0', flexWrap: 'wrap' }}>
            {[
              { label: 'Total Roles',            value: DEFAULT_ROLES.length },
              { label: 'Default Roles',           value: DEFAULT_ROLES.length },
              { label: 'Permissions Available',   value: ALL_PERMISSIONS.length },
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

          {/* Roles list */}
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
