import React, { useState, useEffect } from 'react'
import { ShieldPlus, Shield, Trash2, Pencil, Check, X, Plus, Lock } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'

const ACCENT     = '#E8321A'
const BG_MAIN    = '#0A0A0A'
const BG_CARD    = 'rgba(255,255,255,0.03)'
const BORDER     = 'rgba(255,255,255,0.07)'
const TEXT_DIM   = '#666'
const TEXT_MID   = '#999'

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

const STORAGE_KEY = 'exzibo_custom_roles'

function loadCustomRoles() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function saveCustomRoles(roles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roles))
}

function generateId() {
  return 'role_' + Math.random().toString(36).slice(2, 9)
}

const ROLE_COLORS = ['#A855F7', '#F59E0B', '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#8B5CF6']

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

function RoleCard({ role, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: BG_CARD,
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.12)' : BORDER}`,
        borderRadius: '16px',
        padding: '22px 24px',
        transition: 'border-color 0.2s, background 0.2s',
        position: 'relative',
      }}
    >
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
              {role.isDefault && (
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
              )}
            </div>
            <div style={{ fontSize: '12px', color: TEXT_MID, marginTop: '2px' }}>{role.description}</div>
          </div>
        </div>

        {!role.isDefault && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => onEdit(role)}
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
                color: '#aaa', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#aaa' }}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(role.id)}
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(232,50,26,0.08)', border: '1px solid rgba(232,50,26,0.2)',
                color: ACCENT, cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,50,26,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(232,50,26,0.08)' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Permission pills */}
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

function PermissionToggle({ permKey, label, desc, checked, onChange }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '13px 16px', borderRadius: '12px',
        background: checked ? 'rgba(232,50,26,0.05)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${checked ? 'rgba(232,50,26,0.2)' : BORDER}`,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <div
        style={{
          width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
          background: checked ? ACCENT : 'transparent',
          border: `2px solid ${checked ? ACCENT : 'rgba(255,255,255,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        {checked && <Check size={12} color="#fff" strokeWidth={3} />}
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: checked ? '#fff' : '#aaa' }}>{label}</div>
        <div style={{ fontSize: '11px', color: TEXT_DIM, marginTop: '2px' }}>{desc}</div>
      </div>
    </label>
  )
}

const BLANK_FORM = { name: '', description: '', permissions: [], color: ROLE_COLORS[0] }

export default function AddRolePage() {
  const [customRoles, setCustomRoles] = useState(loadCustomRoles)
  const [form, setForm] = useState(BLANK_FORM)
  const [editingId, setEditingId] = useState(null)
  const [nameError, setNameError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { saveCustomRoles(customRoles) }, [customRoles])

  function togglePermission(key) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }))
  }

  function handleSelectAll() {
    setForm(f => ({
      ...f,
      permissions: f.permissions.length === ALL_PERMISSIONS.length
        ? []
        : ALL_PERMISSIONS.map(p => p.key),
    }))
  }

  function startEdit(role) {
    setEditingId(role.id)
    setForm({ name: role.name, description: role.description, permissions: [...role.permissions], color: role.color })
    setNameError('')
    setSaved(false)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(BLANK_FORM)
    setNameError('')
  }

  function handleSave() {
    const trimmed = form.name.trim()
    if (!trimmed) { setNameError('Role name is required.'); return }

    const allRoles = [...DEFAULT_ROLES, ...customRoles]
    const duplicate = allRoles.some(r => r.id !== editingId && r.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) { setNameError('A role with this name already exists.'); return }

    if (editingId) {
      setCustomRoles(prev => prev.map(r => r.id === editingId
        ? { ...r, name: trimmed, description: form.description.trim(), permissions: form.permissions, color: form.color }
        : r
      ))
    } else {
      setCustomRoles(prev => [...prev, {
        id: generateId(),
        name: trimmed,
        description: form.description.trim() || `Custom role: ${trimmed}`,
        permissions: form.permissions,
        color: form.color,
        isDefault: false,
      }])
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setEditingId(null)
    setForm(BLANK_FORM)
    setNameError('')
  }

  function handleDelete(id) {
    setCustomRoles(prev => prev.filter(r => r.id !== id))
    if (editingId === id) cancelEdit()
  }

  const allRoles = [...DEFAULT_ROLES, ...customRoles]

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
              { label: 'Total Roles', value: allRoles.length },
              { label: 'Default Roles', value: DEFAULT_ROLES.length },
              { label: 'Custom Roles', value: customRoles.length },
              { label: 'Permissions Available', value: ALL_PERMISSIONS.length },
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

          {/* All roles list */}
          <SectionDivider label={`All Roles (${allRoles.length})`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {allRoles.map(role => (
              <RoleCard key={role.id} role={role} onEdit={startEdit} onDelete={handleDelete} />
            ))}
          </div>

          {/* Add / Edit form */}
          <SectionDivider label={editingId ? 'Edit Role' : 'Create New Role'} />
          <div style={{
            background: BG_CARD, border: `1px solid ${editingId ? 'rgba(232,50,26,0.25)' : BORDER}`,
            borderRadius: '18px', padding: '28px 28px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '9px',
                background: 'rgba(232,50,26,0.1)', border: '1px solid rgba(232,50,26,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {editingId ? <Pencil size={15} color={ACCENT} /> : <Plus size={15} color={ACCENT} />}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                {editingId ? 'Editing Role' : 'New Role'}
              </div>
            </div>

            {/* Role name */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                Role Name <span style={{ color: ACCENT }}>*</span>
              </div>
              <input
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameError('') }}
                placeholder="e.g. Cashier, Kitchen Staff…"
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${nameError ? ACCENT : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '12px', color: '#fff', fontSize: '14px',
                  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                }}
                onFocus={e => e.target.style.borderColor = ACCENT}
                onBlur={e => e.target.style.borderColor = nameError ? ACCENT : 'rgba(255,255,255,0.1)'}
              />
              {nameError && (
                <div style={{ fontSize: '12px', color: ACCENT, fontWeight: 600, marginTop: '6px' }}>
                  ⚠ {nameError}
                </div>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                Description
              </div>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this role…"
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', color: '#fff', fontSize: '14px',
                  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                }}
                onFocus={e => e.target.style.borderColor = ACCENT}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            {/* Color picker */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Role Color
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ROLE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: c, border: `3px solid ${form.color === c ? '#fff' : 'transparent'}`,
                      cursor: 'pointer', outline: 'none', transition: 'border-color 0.15s',
                      boxShadow: form.color === c ? `0 0 12px ${c}80` : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Permissions ({form.permissions.length}/{ALL_PERMISSIONS.length})
                </div>
                <button
                  onClick={handleSelectAll}
                  style={{
                    padding: '4px 10px', borderRadius: '99px',
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
                    color: '#aaa', fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {form.permissions.length === ALL_PERMISSIONS.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ALL_PERMISSIONS.map(p => (
                  <PermissionToggle
                    key={p.key}
                    permKey={p.key}
                    label={p.label}
                    desc={p.desc}
                    checked={form.permissions.includes(p.key)}
                    onChange={() => togglePermission(p.key)}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {editingId && (
                <button
                  onClick={cancelEdit}
                  style={{
                    padding: '13px 22px', borderRadius: '12px',
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
                    color: '#aaa', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px',
                  }}
                >
                  <X size={14} /> Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                style={{
                  flex: 1, padding: '13px 24px', borderRadius: '12px',
                  background: saved ? '#22c55e' : ACCENT,
                  border: 'none', color: '#fff', fontSize: '13px', fontWeight: 800,
                  cursor: 'pointer', letterSpacing: '0.04em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'background 0.2s',
                  boxShadow: `0 6px 20px ${saved ? 'rgba(34,197,94,0.35)' : 'rgba(232,50,26,0.35)'}`,
                }}
                onMouseEnter={e => { if (!saved) e.currentTarget.style.background = '#c42a14' }}
                onMouseLeave={e => { if (!saved) e.currentTarget.style.background = ACCENT }}
              >
                {saved
                  ? <><Check size={15} /> Saved!</>
                  : editingId
                    ? <><Pencil size={14} /> Update Role</>
                    : <><Plus size={15} /> Create Role</>
                }
              </button>
            </div>
          </div>

          <div style={{ height: '48px' }} />
        </main>
      </div>
    </div>
  )
}
