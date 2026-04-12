import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Search, X, Check, Pencil, Trash2,
  Loader2, AlertCircle, Users, ChevronDown, Camera,
} from 'lucide-react'

const ROLES = ['Admin', 'Owner', 'Manager', 'Waiter', 'Chef', 'Cleaner', 'Security']

const ROLE_STYLE = {
  Admin:    { bg: '#EDE9FE', color: '#6D28D9', dot: '#7C3AED' },
  Owner:    { bg: '#FEF3C7', color: '#92400E', dot: '#D97706' },
  Manager:  { bg: '#DBEAFE', color: '#1D4ED8', dot: '#3B82F6' },
  Waiter:   { bg: '#D1FAE5', color: '#065F46', dot: '#10B981' },
  Chef:     { bg: '#FFEDD5', color: '#9A3412', dot: '#F97316' },
  Cleaner:  { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E' },
  Security: { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444' },
}

const FILTER_PILLS = ['All', 'Admin', 'Manager', 'Chef', 'Waiter', 'Owner']

const DEMO_MEMBERS = [
  { id: 'demo1', name: 'Trish Sharma', role: 'Admin',   avatar: 'https://i.pravatar.cc/150?img=1' },
  { id: 'demo2', name: 'Avinav Kumar', role: 'Waiter',  avatar: 'https://i.pravatar.cc/150?img=2' },
  { id: 'demo3', name: 'Rahul Mehta',  role: 'Chef',    avatar: 'https://i.pravatar.cc/150?img=3' },
  { id: 'demo4', name: 'Priya Singh',  role: 'Manager', avatar: 'https://i.pravatar.cc/150?img=5' },
]

function storageKey(id) {
  return `exzibo_team_${id || 'default'}`
}

function loadMembers(id) {
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (raw) return JSON.parse(raw)
    return DEMO_MEMBERS
  } catch { return DEMO_MEMBERS }
}

function saveMembers(id, members) {
  localStorage.setItem(storageKey(id), JSON.stringify(members))
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function TeamMembers() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => {
    setMembers(loadMembers(id))
  }, [id])

  function persistMembers(updated) {
    setMembers(updated)
    saveMembers(id, updated)
  }

  function handleSave(member) {
    let updated
    if (member.id) {
      updated = members.map(m => m.id === member.id ? member : m)
    } else {
      updated = [...members, { ...member, id: uid() }]
    }
    persistMembers(updated)
    setShowForm(false)
    setEditTarget(null)
  }

  function handleDelete(memberId) {
    persistMembers(members.filter(m => m.id !== memberId))
    setDeleteId(null)
  }

  function openEdit(member) {
    setEditTarget(member)
    setShowForm(true)
  }

  function openAdd() {
    setEditTarget(null)
    setShowForm(true)
  }

  const filtered = members.filter(m => {
    const matchRole = filterRole === 'All' || m.role === filterRole
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  const accentStart = '#6366F1'
  const accentEnd = '#8B5CF6'

  return (
    <div style={{
      minHeight: '100vh', background: '#F2F2F7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>

      {/* Gradient header */}
      <div style={{
        background: `linear-gradient(135deg, ${accentStart} 0%, ${accentEnd} 100%)`,
        padding: '0 0 32px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-20px', left: '60px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
          <button
            onClick={() => navigate(`/admin/${id || 'default'}`)}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff', backdropFilter: 'blur(8px)',
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={openAdd}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)',
              color: '#fff', fontWeight: 700, fontSize: '13px',
              cursor: 'pointer', backdropFilter: 'blur(8px)',
            }}
          >
            <Plus size={15} /> Add Member
          </button>
        </div>

        {/* Title */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '13px',
              background: 'rgba(255,255,255,0.22)', border: '1.5px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Users size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '24px', color: '#fff', letterSpacing: '-0.02em' }}>
                Team Members
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>
                Manage your restaurant staff
              </div>
            </div>
          </div>

          {/* Stats chips */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            {[
              { label: `${members.length} Total`, bg: 'rgba(255,255,255,0.18)' },
              ...Object.entries(
                members.reduce((acc, m) => { acc[m.role] = (acc[m.role] || 0) + 1; return acc }, {})
              ).slice(0, 3).map(([role, count]) => ({ label: `${count} ${role}`, bg: 'rgba(255,255,255,0.12)' })),
            ].map((chip, i) => (
              <div key={i} style={{
                padding: '4px 10px', borderRadius: '20px',
                background: chip.bg, border: '1px solid rgba(255,255,255,0.2)',
                fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em',
              }}>
                {chip.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 16px', maxWidth: '520px', margin: '0 auto' }}>

        {/* Search */}
        <div style={{
          background: '#fff', borderRadius: '14px', padding: '0 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: '14px',
          border: '1.5px solid #E9E9EF',
        }}>
          <Search size={16} color="#aaa" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or role…"
            style={{
              flex: 1, padding: '12px 0', border: 'none', outline: 'none',
              fontSize: '14px', color: '#111', background: 'transparent', fontWeight: 500,
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '2px' }}>
              <X size={15} color="#bbb" />
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px' }}>
          {FILTER_PILLS.map(pill => (
            <button key={pill} onClick={() => setFilterRole(pill)} style={{
              padding: '6px 14px', borderRadius: '20px', border: 'none',
              background: filterRole === pill ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : '#fff',
              color: filterRole === pill ? '#fff' : '#555',
              fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em',
              cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: filterRole === pill ? `0 2px 8px ${accentStart}40` : '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'all 0.15s',
            }}>
              {pill}
            </button>
          ))}
        </div>

        {/* Member list */}
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '44px 20px',
            background: '#fff', borderRadius: '18px',
            border: '1px solid #F0F0F5',
          }}>
            <Users size={40} color="#D1D5DB" style={{ marginBottom: '12px' }} />
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#9CA3AF', marginBottom: '4px' }}>
              {search || filterRole !== 'All' ? 'No members match your search' : 'No team members yet'}
            </div>
            <div style={{ fontSize: '13px', color: '#C4C4C4' }}>
              {search || filterRole !== 'All' ? 'Try adjusting your filters' : 'Tap "+ Add Member" to get started'}
            </div>
          </div>
        ) : (
          <div style={{
            background: '#fff', borderRadius: '18px',
            border: '1px solid #F0F0F5',
            overflow: 'hidden',
          }}>
            {filtered.map((member, idx) => (
              <MemberRow
                key={member.id}
                member={member}
                isLast={idx === filtered.length - 1}
                onEdit={() => openEdit(member)}
                onDelete={() => setDeleteId(member.id)}
              />
            ))}
          </div>
        )}

        {/* Add member FAB (mobile friendly) */}
        <button onClick={openAdd} style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '54px', height: '54px', borderRadius: '50%',
          background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
          border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: `0 6px 20px ${accentStart}60`,
          zIndex: 100, transition: 'transform 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Add / Edit form panel */}
      {showForm && (
        <MemberForm
          member={editTarget}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          accentStart={accentStart}
          accentEnd={accentEnd}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <DeleteConfirm
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

function MemberRow({ member, isLast, onEdit, onDelete }) {
  const rs = ROLE_STYLE[member.role] || { bg: '#F3F4F6', color: '#374151', dot: '#6B7280' }
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '13px 16px',
        background: hovered ? '#F7F7FA' : '#fff',
        borderBottom: isLast ? 'none' : '1px solid #F0F0F5',
        transition: 'background 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: '46px', height: '46px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {member.avatar && !imgError
          ? <img src={member.avatar} alt={member.name}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontWeight: 800, fontSize: '17px', color: '#fff' }}>
              {member.name.slice(0, 1).toUpperCase()}
            </span>}
      </div>

      {/* Name + role */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: '14px', color: '#111',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: '3px',
        }}>
          {member.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: rs.dot, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: '#888', fontWeight: 500 }}>{member.role}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button onClick={onEdit} style={{
          width: '32px', height: '32px', borderRadius: '10px',
          background: '#F0F0F5', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555',
        }}>
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} style={{
          width: '32px', height: '32px', borderRadius: '10px',
          background: '#FEF2F2', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444',
        }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function MemberForm({ member, onSave, onClose, accentStart, accentEnd }) {
  const isEdit = !!member?.id
  const avatarInputRef = useRef(null)

  const [name, setName] = useState(member?.name || '')
  const [role, setRole] = useState(member?.role || 'Waiter')
  const [avatar, setAvatar] = useState(member?.avatar || '')
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  async function handleAvatarUpload(file) {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) return
    if (file.size > 3 * 1024 * 1024) return
    setUploadingAvatar(true)
    try {
      const b64 = await fileToBase64(file)
      setAvatar(b64)
    } catch {}
    finally { setUploadingAvatar(false) }
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) { setNameError('Name is required.'); return }
    setNameError(''); setSaving(true)
    await new Promise(r => setTimeout(r, 350))
    onSave({ id: member?.id || null, name: trimmed, role, avatar })
    setSaving(false)
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 200, backdropFilter: 'blur(3px)',
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px',
        background: '#fff', zIndex: 201,
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        padding: '0 0 40px',
        animation: 'slideUp 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#E0E0E8' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px 16px', borderBottom: '1px solid #F0F0F5',
        }}>
          <div style={{ fontWeight: 800, fontSize: '17px', color: '#111' }}>
            {isEdit ? 'Edit Member' : 'Add Team Member'}
          </div>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: '#F0F0F5', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
          }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '20px 20px 0' }}>

          {/* Avatar upload */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
            <div
              onClick={() => avatarInputRef.current?.click()}
              style={{
                width: '86px', height: '86px', borderRadius: '50%',
                background: avatar ? 'transparent' : `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', cursor: 'pointer', position: 'relative',
                border: '3px solid #E9E9EF', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
              {avatar
                ? <img src={avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontWeight: 800, fontSize: '28px', color: '#fff' }}>
                    {name ? name.slice(0, 1).toUpperCase() : '?'}
                  </span>}
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: uploadingAvatar ? 1 : 0, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => { if (!uploadingAvatar) e.currentTarget.style.opacity = '1' }}
                onMouseLeave={e => { if (!uploadingAvatar) e.currentTarget.style.opacity = '0' }}
              >
                {uploadingAvatar
                  ? <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  : <Camera size={20} color="#fff" />}
              </div>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = '' }}
            />
            <div style={{ fontSize: '11px', color: '#aaa', fontWeight: 600, marginTop: '6px' }}>
              Tap to upload photo
            </div>
          </div>

          {/* Name */}
          <FormLabel label="Full Name" />
          <input
            value={name}
            onChange={e => { setName(e.target.value); setNameError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Enter member name…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '11px 14px', borderRadius: '12px',
              border: `1.5px solid ${nameError ? '#FECACA' : '#E0E0E8'}`,
              fontSize: '14px', fontWeight: 600, color: '#111',
              outline: 'none', background: '#F7F7FA',
              marginBottom: nameError ? '6px' : '14px', transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = accentStart}
            onBlur={e => e.target.style.borderColor = nameError ? '#FECACA' : '#E0E0E8'}
          />
          {nameError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#EF4444', fontSize: '11px', fontWeight: 600, marginBottom: '10px' }}>
              <AlertCircle size={12} /> {nameError}
            </div>
          )}

          {/* Role */}
          <FormLabel label="Role" />
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{
                width: '100%', padding: '11px 38px 11px 14px',
                borderRadius: '12px', border: '1.5px solid #E0E0E8',
                fontSize: '14px', fontWeight: 600, color: '#111',
                background: '#F7F7FA', outline: 'none',
                appearance: 'none', cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = accentStart}
              onBlur={e => e.target.style.borderColor = '#E0E0E8'}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <ChevronDown size={16} color="#999" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>

          {/* Role preview */}
          {role && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#999', fontWeight: 600 }}>Badge preview:</div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '20px',
                background: (ROLE_STYLE[role] || { bg: '#F3F4F6' }).bg,
                color: (ROLE_STYLE[role] || { color: '#374151' }).color,
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: (ROLE_STYLE[role] || { dot: '#6B7280' }).dot, display: 'inline-block' }} />
                {role}
              </div>
            </div>
          )}

          {/* Save */}
          <button onClick={handleSubmit} disabled={saving} style={{
            width: '100%', padding: '13px 0', borderRadius: '13px',
            background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
            border: 'none', color: '#fff', fontWeight: 800, fontSize: '14px',
            letterSpacing: '0.04em', cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            opacity: saving ? 0.75 : 1, transition: 'opacity 0.15s',
            boxShadow: `0 4px 16px ${accentStart}40`,
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

function DeleteConfirm({ onConfirm, onCancel }) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '420px', background: '#fff', zIndex: 301,
        borderRadius: '24px 24px 0 0', padding: '24px 20px 40px',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        animation: 'slideUp 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#E0E0E8' }} />
        </div>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          background: '#FEF2F2', margin: '12px auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Trash2 size={22} color="#EF4444" />
        </div>
        <div style={{ fontWeight: 800, fontSize: '17px', color: '#111', textAlign: 'center', marginBottom: '6px' }}>Remove Member?</div>
        <div style={{ fontSize: '13px', color: '#888', textAlign: 'center', marginBottom: '24px', lineHeight: 1.5 }}>
          This member will be permanently removed from your team. This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px', borderRadius: '13px', background: '#F0F0F5', border: 'none',
            fontWeight: 700, fontSize: '14px', color: '#555', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '12px', borderRadius: '13px',
            background: 'linear-gradient(135deg, #EF4444, #DC2626)', border: 'none',
            fontWeight: 700, fontSize: '14px', color: '#fff', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
          }}>
            Remove
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>
    </>
  )
}

function FormLabel({ label }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '7px' }}>
      {label}
    </div>
  )
}
