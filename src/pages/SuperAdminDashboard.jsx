import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Check,
  Loader2, AlertCircle, Users, ChevronDown, Camera,
  UtensilsCrossed, Shield, Crown,
} from 'lucide-react'

const ACCENT_START = '#6366F1'
const ACCENT_END = '#8B5CF6'
const STORAGE_KEY = 'exzibo_super_staff'

const STAFF_ROLES = ['Chef', 'Waiter', 'Cleaner', 'Security', 'Cashier', 'Delivery']
const MANAGER_ROLES = ['Manager', 'Assistant Manager', 'Floor Manager']
const OWNER_ROLES = ['Owner', 'Co-Owner', 'Director']

const ROLE_STYLE = {
  Chef:              { bg: '#FFEDD5', color: '#9A3412', dot: '#F97316' },
  Waiter:            { bg: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  Cleaner:           { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E' },
  Security:          { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
  Cashier:           { bg: '#FEF9C3', color: '#854D0E', dot: '#EAB308' },
  Delivery:          { bg: '#E0F2FE', color: '#0C4A6E', dot: '#0EA5E9' },
  Manager:           { bg: '#DBEAFE', color: '#1D4ED8', dot: '#3B82F6' },
  'Assistant Manager': { bg: '#E0E7FF', color: '#3730A3', dot: '#6366F1' },
  'Floor Manager':   { bg: '#EDE9FE', color: '#5B21B6', dot: '#7C3AED' },
  Owner:             { bg: '#FEF3C7', color: '#92400E', dot: '#D97706' },
  'Co-Owner':        { bg: '#FFF7ED', color: '#7C2D12', dot: '#EA580C' },
  Director:          { bg: '#F5F3FF', color: '#4C1D95', dot: '#8B5CF6' },
}

const SECTIONS = [
  {
    id: 'staff',
    label: 'Staff',
    description: 'Chefs, Waiters & support staff',
    icon: UtensilsCrossed,
    roles: STAFF_ROLES,
    accentBg: '#FFEDD5',
    accentColor: '#EA580C',
    gradStart: '#F97316',
    gradEnd: '#EA580C',
  },
  {
    id: 'manager',
    label: 'Managers',
    description: 'Floor and operations managers',
    icon: Shield,
    roles: MANAGER_ROLES,
    accentBg: '#DBEAFE',
    accentColor: '#2563EB',
    gradStart: '#3B82F6',
    gradEnd: '#2563EB',
  },
  {
    id: 'owner',
    label: 'Owners',
    description: 'Business owners and directors',
    icon: Crown,
    roles: OWNER_ROLES,
    accentBg: '#FEF3C7',
    accentColor: '#D97706',
    gradStart: '#F59E0B',
    gradEnd: '#D97706',
  },
]

function loadStaff() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveStaff(staff) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(staff))
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [staff, setStaff] = useState([])
  const [formConfig, setFormConfig] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { setStaff(loadStaff()) }, [])

  function persistStaff(updated) { setStaff(updated); saveStaff(updated) }

  function handleSave(member) {
    let updated
    if (member.id) {
      updated = staff.map(s => s.id === member.id ? member : s)
    } else {
      updated = [...staff, { ...member, id: uid(), active: true }]
    }
    persistStaff(updated)
    setFormConfig(null)
  }

  function handleDelete(id) {
    persistStaff(staff.filter(s => s.id !== id))
    setDeleteTarget(null)
  }

  function openAdd(section) {
    setFormConfig({ section, member: null })
  }

  function openEdit(section, member) {
    setFormConfig({ section, member })
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F2F2F7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${ACCENT_START} 0%, ${ACCENT_END} 100%)`,
        padding: '0 0 28px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-20px', left: '40px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
          <button onClick={() => navigate(-1)} style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{
            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '10px', padding: '5px 12px',
            fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.08em',
          }}>
            SUPER ADMIN
          </div>
        </div>

        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '13px',
              background: 'rgba(255,255,255,0.22)', border: '1.5px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Users size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '22px', color: '#fff', letterSpacing: '-0.02em' }}>Manage Staff</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>Add, edit & remove team members</div>
            </div>
          </div>

          {/* Total stats */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <StatChip label={`${staff.length} Total`} />
            {SECTIONS.map(s => {
              const count = staff.filter(m => m.category === s.id).length
              if (count === 0) return null
              return <StatChip key={s.id} label={`${count} ${s.label}`} />
            })}
          </div>
        </div>
      </div>

      {/* Section cards */}
      <div style={{ padding: '20px 16px', maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {SECTIONS.map(section => {
          const members = staff.filter(m => m.category === section.id)
          return (
            <SectionCard
              key={section.id}
              section={section}
              members={members}
              onAdd={() => openAdd(section)}
              onEdit={member => openEdit(section, member)}
              onDelete={member => setDeleteTarget(member)}
            />
          )
        })}
      </div>

      {/* Add / Edit form */}
      {formConfig && (
        <StaffForm
          section={formConfig.section}
          member={formConfig.member}
          onSave={handleSave}
          onClose={() => setFormConfig(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.name}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function StatChip({ label }) {
  return (
    <div style={{
      padding: '4px 10px', borderRadius: '20px',
      background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.2)',
      fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em',
    }}>
      {label}
    </div>
  )
}

function SectionCard({ section, members, onAdd, onEdit, onDelete }) {
  const Icon = section.icon
  return (
    <div style={{
      background: '#fff', borderRadius: '20px',
      border: '1px solid #F0F0F5',
      overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        background: `linear-gradient(135deg, ${section.gradStart}18, ${section.gradEnd}10)`,
        borderBottom: `1px solid ${section.gradStart}20`,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '11px',
            background: `linear-gradient(135deg, ${section.gradStart}, ${section.gradEnd})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 3px 10px ${section.gradStart}40`,
          }}>
            <Icon size={17} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#111' }}>{section.label}</div>
            <div style={{ fontSize: '11px', color: '#888', fontWeight: 500 }}>{section.description}</div>
          </div>
        </div>
        <button onClick={onAdd} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '7px 12px', borderRadius: '10px',
          background: `linear-gradient(135deg, ${section.gradStart}, ${section.gradEnd})`,
          border: 'none', color: '#fff', fontWeight: 700, fontSize: '12px',
          cursor: 'pointer', boxShadow: `0 2px 8px ${section.gradStart}40`,
          whiteSpace: 'nowrap',
        }}>
          <Plus size={13} /> Add
        </button>
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#C4C4C4', fontWeight: 500 }}>
            No {section.label.toLowerCase()} added yet
          </div>
        </div>
      ) : (
        members.map((member, idx) => (
          <StaffRow
            key={member.id}
            member={member}
            isLast={idx === members.length - 1}
            onEdit={() => onEdit(member)}
            onDelete={() => onDelete(member)}
          />
        ))
      )}
    </div>
  )
}

function StaffRow({ member, isLast, onEdit, onDelete }) {
  const rs = ROLE_STYLE[member.role] || { bg: '#F3F4F6', color: '#374151', dot: '#6B7280' }
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '11px 16px',
        background: hovered ? '#F7F7FA' : '#fff',
        borderBottom: isLast ? 'none' : '1px solid #F5F5F7',
        transition: 'background 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: '42px', height: '42px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {member.avatar && !imgError
          ? <img src={member.avatar} alt={member.name} onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontWeight: 800, fontSize: '16px', color: '#fff' }}>{member.name.slice(0, 1).toUpperCase()}</span>}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#111', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '20px',
            background: rs.bg, color: rs.color,
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: rs.dot, display: 'inline-block' }} />
            {member.role}
          </span>
          {member.phone && <span style={{ fontSize: '11px', color: '#bbb' }}>{member.phone}</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
        <button onClick={onEdit} style={{
          width: '30px', height: '30px', borderRadius: '9px',
          background: '#F0F0F5', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
        }}>
          <Pencil size={12} />
        </button>
        <button onClick={onDelete} style={{
          width: '30px', height: '30px', borderRadius: '9px',
          background: '#FEF2F2', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444',
        }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function StaffForm({ section, member, onSave, onClose }) {
  const isEdit = !!member?.id
  const avatarInputRef = useRef(null)

  const [name, setName] = useState(member?.name || '')
  const [role, setRole] = useState(member?.role || section.roles[0])
  const [phone, setPhone] = useState(member?.phone || '')
  const [email, setEmail] = useState(member?.email || '')
  const [password, setPassword] = useState(member?.password || '')
  const [avatar, setAvatar] = useState(member?.avatar || '')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  async function handleAvatarUpload(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type) || file.size > 3 * 1024 * 1024) return
    setUploadingAvatar(true)
    try { setAvatar(await fileToBase64(file)) } catch {}
    finally { setUploadingAvatar(false) }
  }

  function validate() {
    const e = {}
    if (!name.trim()) e.name = 'Name is required'
    if (phone && !/^\+?[\d\s\-]{7,15}$/.test(phone.trim())) e.phone = 'Enter a valid phone number'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email'
    if (!isEdit && !password.trim()) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 350))
    onSave({
      id: member?.id || null,
      category: section.id,
      name: name.trim(), role,
      phone: phone.trim(), email: email.trim(),
      password: password || member?.password || '',
      avatar,
    })
    setSaving(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px', background: '#fff', zIndex: 201,
        borderRadius: '24px 24px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        maxHeight: '90vh', overflowY: 'auto',
        animation: 'slideUp 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#E0E0E8' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 14px', borderBottom: '1px solid #F0F0F5' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '17px', color: '#111' }}>
              {isEdit ? 'Edit Member' : `Add ${section.label.slice(0, -1) || 'Member'}`}
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '1px' }}>{section.description}</div>
          </div>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#F0F0F5', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '20px 20px 32px' }}>

          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
            <div
              onClick={() => avatarInputRef.current?.click()}
              style={{
                width: '80px', height: '80px', borderRadius: '50%',
                background: avatar ? 'transparent' : `linear-gradient(135deg, ${section.gradStart}, ${section.gradEnd})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', cursor: 'pointer', position: 'relative',
                border: '3px solid #E9E9EF', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
              {avatar
                ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontWeight: 800, fontSize: '26px', color: '#fff' }}>{name ? name.slice(0, 1).toUpperCase() : '?'}</span>}
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
              >
                {uploadingAvatar ? <Loader2 size={18} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={18} color="#fff" />}
              </div>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = '' }} />
            <div style={{ fontSize: '11px', color: '#aaa', fontWeight: 600, marginTop: '6px' }}>Tap to upload photo</div>
          </div>

          {/* Name */}
          <FormField label="Full Name" error={errors.name}>
            <input value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
              placeholder="Enter full name…" style={fieldStyle(errors.name)}
              onFocus={e => e.target.style.borderColor = section.gradStart}
              onBlur={e => e.target.style.borderColor = errors.name ? '#FECACA' : '#E0E0E8'}
            />
          </FormField>

          {/* Role */}
          <FormField label="Role">
            <div style={{ position: 'relative' }}>
              <select value={role} onChange={e => setRole(e.target.value)} style={{ ...fieldStyle(), appearance: 'none', paddingRight: '36px', cursor: 'pointer' }}
                onFocus={e => e.target.style.borderColor = section.gradStart}
                onBlur={e => e.target.style.borderColor = '#E0E0E8'}
              >
                {section.roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={15} color="#999" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </FormField>

          {/* Phone */}
          <FormField label="Phone Number" error={errors.phone}>
            <input value={phone} onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: '' })) }}
              placeholder="+91 98765 43210" type="tel" style={fieldStyle(errors.phone)}
              onFocus={e => e.target.style.borderColor = section.gradStart}
              onBlur={e => e.target.style.borderColor = errors.phone ? '#FECACA' : '#E0E0E8'}
            />
          </FormField>

          {/* Email */}
          <FormField label="Email Address" error={errors.email}>
            <input value={email} onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })) }}
              placeholder="example@gmail.com" type="email" style={fieldStyle(errors.email)}
              onFocus={e => e.target.style.borderColor = section.gradStart}
              onBlur={e => e.target.style.borderColor = errors.email ? '#FECACA' : '#E0E0E8'}
            />
          </FormField>

          {/* Password */}
          <FormField label={isEdit ? 'New Password (leave blank to keep)' : 'Password'} error={errors.password}>
            <input value={password} onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })) }}
              placeholder={isEdit ? 'Leave blank to keep current' : 'Set a password…'}
              type="password" style={fieldStyle(errors.password)}
              onFocus={e => e.target.style.borderColor = section.gradStart}
              onBlur={e => e.target.style.borderColor = errors.password ? '#FECACA' : '#E0E0E8'}
            />
          </FormField>

          {/* Save button */}
          <button onClick={handleSubmit} disabled={saving} style={{
            width: '100%', padding: '13px 0', borderRadius: '13px',
            background: `linear-gradient(135deg, ${section.gradStart}, ${section.gradEnd})`,
            border: 'none', color: '#fff', fontWeight: 800, fontSize: '14px', letterSpacing: '0.04em',
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            opacity: saving ? 0.75 : 1, boxShadow: `0 4px 16px ${section.gradStart}40`,
          }}>
            {saving
              ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> SAVING…</>
              : <><Check size={15} /> {isEdit ? 'UPDATE MEMBER' : 'ADD MEMBER'}</>}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

function DeleteConfirm({ name, onConfirm, onCancel }) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '420px', background: '#fff', zIndex: 301,
        borderRadius: '24px 24px 0 0', padding: '20px 20px 40px',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#E0E0E8' }} />
        </div>
        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#FEF2F2', margin: '8px auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontWeight: 800, fontSize: '16px', color: '#111', textAlign: 'center', marginBottom: '6px' }}>Remove {name}?</div>
        <div style={{ fontSize: '13px', color: '#888', textAlign: 'center', marginBottom: '22px', lineHeight: 1.5 }}>
          This member will be permanently removed from the team.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: '13px', background: '#F0F0F5', border: 'none', fontWeight: 700, fontSize: '14px', color: '#555', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '12px', borderRadius: '13px', background: 'linear-gradient(135deg,#EF4444,#DC2626)', border: 'none', fontWeight: 700, fontSize: '14px', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(239,68,68,0.35)' }}>Remove</button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>
    </>
  )
}

function FormField({ label, error, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      {children}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#EF4444', fontSize: '11px', fontWeight: 600, marginTop: '5px' }}>
          <AlertCircle size={11} /> {error}
        </div>
      )}
    </div>
  )
}

function fieldStyle(hasError) {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px', borderRadius: '12px',
    border: `1.5px solid ${hasError ? '#FECACA' : '#E0E0E8'}`,
    fontSize: '14px', fontWeight: 600, color: '#111',
    outline: 'none', background: '#F7F7FA', transition: 'border-color 0.15s',
  }
}
