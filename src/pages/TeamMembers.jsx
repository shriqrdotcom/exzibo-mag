import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, X, Users } from 'lucide-react'

const ROLE_STYLE = {
  OWNER:   { dot: '#3B82F6', color: '#1D4ED8' },
  MANAGER: { dot: '#7C3AED', color: '#5B21B6' },
  STAFF:   { dot: '#10B981', color: '#065F46' },
}

const ROLE_MAP = {
  Admin: 'STAFF', Waiter: 'STAFF', Chef: 'STAFF',
  Cleaner: 'STAFF', Security: 'STAFF', Cashier: 'STAFF', Delivery: 'STAFF',
  Manager: 'MANAGER', 'Assistant Manager': 'MANAGER', 'Floor Manager': 'MANAGER',
  Owner: 'OWNER', 'Co-Owner': 'OWNER', Director: 'OWNER',
  STAFF: 'STAFF', MANAGER: 'MANAGER', OWNER: 'OWNER',
}

function normalizeRole(role) { return ROLE_MAP[role] || 'STAFF' }

const DEMO_MEMBERS = [
  { id: 'demo1', name: 'Trish Sharma', role: 'STAFF',   avatar: 'https://i.pravatar.cc/150?img=1', active: true },
  { id: 'demo2', name: 'Avinav Kumar', role: 'STAFF',   avatar: 'https://i.pravatar.cc/150?img=2', active: true },
  { id: 'demo3', name: 'Rahul Mehta',  role: 'STAFF',   avatar: 'https://i.pravatar.cc/150?img=3', active: true },
  { id: 'demo4', name: 'Priya Singh',  role: 'MANAGER', avatar: 'https://i.pravatar.cc/150?img=5', active: false },
]

function storageKey(id) { return `exzibo_team_${id || 'default'}` }

function loadMembers(id) {
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (raw) return JSON.parse(raw)
    localStorage.setItem(storageKey(id), JSON.stringify(DEMO_MEMBERS))
    return DEMO_MEMBERS
  } catch { return DEMO_MEMBERS }
}

export default function TeamMembers() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => { setMembers(loadMembers(id)) }, [id])

  function toggleActive(memberId) {
    const updated = members.map(m => m.id === memberId ? { ...m, active: !m.active } : m)
    setMembers(updated)
    localStorage.setItem(storageKey(id), JSON.stringify(updated))
  }

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  )

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
        padding: '0 0 28px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-20px', left: '60px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px 0' }}>
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
        </div>

        {/* Title */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '13px',
              background: 'rgba(255,255,255,0.22)', border: '1.5px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Users size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '22px', color: '#fff', letterSpacing: '-0.02em' }}>Team Members</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>Manage your restaurant staff</div>
            </div>
          </div>

        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 16px', maxWidth: '520px', margin: '0 auto' }}>

        {/* Search */}
        <div style={{
          background: '#fff', borderRadius: '14px', padding: '0 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
          border: '1.5px solid #E9E9EF', marginBottom: '16px',
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

        {/* Member list */}
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '44px 20px',
            background: '#fff', borderRadius: '18px', border: '1px solid #F0F0F5',
          }}>
            <Users size={40} color="#D1D5DB" style={{ marginBottom: '12px' }} />
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#9CA3AF', marginBottom: '4px' }}>
              {search ? 'No members match your search' : 'No team members yet'}
            </div>
            <div style={{ fontSize: '13px', color: '#C4C4C4' }}>
              {search ? 'Try a different search term' : 'Contact your Super Admin to add staff'}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '18px', border: '1px solid #F0F0F5', overflow: 'hidden' }}>
            {filtered.map((member, idx) => (
              <MemberRow
                key={member.id}
                member={member}
                isLast={idx === filtered.length - 1}
                onToggle={() => toggleActive(member.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MemberRow({ member, isLast, onToggle }) {
  const displayRole = normalizeRole(member.role)
  const rs = ROLE_STYLE[displayRole] || { dot: '#6B7280', color: '#374151' }
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
      {/* Avatar with active indicator ring */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: '46px', height: '46px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          opacity: member.active === false ? 0.45 : 1,
          transition: 'opacity 0.2s',
        }}>
          {member.avatar && !imgError
            ? <img src={member.avatar} alt={member.name}
                onError={() => setImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontWeight: 800, fontSize: '17px', color: '#fff' }}>
                {member.name.slice(0, 1).toUpperCase()}
              </span>}
        </div>
        {/* Active dot */}
        <span style={{
          position: 'absolute', bottom: '1px', right: '1px',
          width: '11px', height: '11px', borderRadius: '50%',
          background: member.active === false ? '#D1D5DB' : '#22C55E',
          border: '2px solid #fff',
          transition: 'background 0.2s',
        }} />
      </div>

      {/* Name + role */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: '14px',
          color: member.active === false ? '#9CA3AF' : '#111',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: '3px', transition: 'color 0.2s',
        }}>
          {member.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: rs.dot, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: rs.color, fontWeight: 600 }}>{displayRole}</span>
        </div>
      </div>

      {/* Active / Inactive toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
        <Toggle active={member.active !== false} onToggle={onToggle} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: member.active === false ? '#9CA3AF' : '#22C55E', letterSpacing: '0.03em' }}>
          {member.active === false ? 'Inactive' : 'Active'}
        </span>
      </div>
    </div>
  )
}

function Toggle({ active, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: '40px', height: '22px', borderRadius: '11px',
        background: active ? '#22C55E' : '#D1D5DB',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.22s',
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: active ? '21px' : '3px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        transition: 'left 0.22s',
      }} />
    </div>
  )
}
