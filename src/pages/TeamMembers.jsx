import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { getTeamMembers } from '../lib/db'

const ACCENT_START = '#6366F1'
const ACCENT_END   = '#8B5CF6'

const DEMO_MEMBERS = [
  {
    id: 'demo1',
    name: 'Donna Hicks',
    role: 'Admin',
    group: 'Admin',
    department: 'Finance & Admin',
    avatar: 'https://i.pravatar.cc/150?img=47',
    active: true,
    status: 'active',
  },
  {
    id: 'demo2',
    name: 'Kathleen Harper',
    role: 'Admin',
    group: 'Admin',
    department: 'Management',
    avatar: 'https://i.pravatar.cc/150?img=44',
    active: true,
    status: 'active',
  },
  {
    id: 'demo3',
    name: 'Mary Long',
    role: 'Employee',
    group: 'Employee',
    department: 'Marketing',
    avatar: 'https://i.pravatar.cc/150?img=32',
    active: true,
    status: 'active',
  },
]

const SUPPORT_TEAM_MEMBERS = [
  {
    id: 'support1',
    name: 'Alex Carter',
    role: 'Support Agent',
    department: 'Customer Support',
    avatar: 'https://i.pravatar.cc/150?img=11',
    status: 'active',
  },
  {
    id: 'support2',
    name: 'Sophia Lee',
    role: 'HR Manager',
    department: 'Human Resources',
    avatar: 'https://i.pravatar.cc/150?img=25',
    status: 'idle',
  },
  {
    id: 'support3',
    name: 'Daniel Smith',
    role: 'Developer',
    department: 'Engineering',
    avatar: 'https://i.pravatar.cc/150?img=59',
    status: 'offline',
  },
]

const STATUS_CONFIG = {
  active:  { color: '#22C55E', glow: 'rgba(34,197,94,0.3)',   label: 'Active'  },
  idle:    { color: '#F97316', glow: 'rgba(249,115,22,0.3)',  label: 'Idle'    },
  offline: { color: '#9CA3AF', glow: 'none',                  label: 'Offline' },
}

function storageKey(id) { return `exzibo_team_${id || 'default'}` }

async function loadMembers(id) {
  try {
    const rows = await getTeamMembers(id)
    if (rows && rows.length > 0) return rows
  } catch { /* noop */ }
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.length > 0) return parsed
    }
  } catch { /* noop */ }
  return DEMO_MEMBERS
}

function groupMembers(members) {
  const order = []
  const map = {}
  members.forEach(m => {
    const key = m.group || m.role || 'Other'
    if (!map[key]) { map[key] = []; order.push(key) }
    map[key].push(m)
  })
  return order.map(k => ({ label: k, members: map[k] }))
}

export default function TeamMembers() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])

  useEffect(() => { loadMembers(id).then(setMembers) }, [id])

  const groups = groupMembers(members)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F2F2F7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>

      {/* Gradient header */}
      <div style={{
        background: `linear-gradient(135deg, ${ACCENT_START} 0%, ${ACCENT_END} 100%)`,
        padding: '0 0 28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-20px', left: '60px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px 0' }}>
          <button
            onClick={() => navigate(-1)}
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
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>
                {members.length} member{members.length !== 1 ? 's' : ''} on your team
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 16px', maxWidth: '520px', margin: '0 auto' }}>

        {/* Grouped list — Admin & Employee */}
        {members.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '44px 20px',
            background: '#fff', borderRadius: '18px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            <Users size={40} color="#D1D5DB" style={{ marginBottom: '12px' }} />
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#9CA3AF', marginBottom: '4px' }}>
              No team members yet
            </div>
            <div style={{ fontSize: '13px', color: '#C4C4C4' }}>
              Contact your Super Admin to add staff
            </div>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} style={{ marginBottom: '8px' }}>
              {/* Section header */}
              <div style={{
                fontSize: '12px', fontWeight: 600,
                color: '#9CA3AF', letterSpacing: '0.02em',
                marginBottom: '8px', paddingLeft: '4px',
              }}>
                {group.label}
              </div>

              {/* Member cards */}
              <div style={{
                background: '#fff',
                borderRadius: '16px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                overflow: 'hidden',
              }}>
                {group.members.map((member, idx) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isLast={idx === group.members.length - 1}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* ── Support Team section ───────────────────────────────────────── */}
        <div style={{ marginTop: '24px' }}>
          {/* Section header */}
          <div style={{
            fontSize: '12px', fontWeight: 600,
            color: '#9CA3AF', letterSpacing: '0.02em',
            marginBottom: '8px', paddingLeft: '4px',
          }}>
            Support Team
          </div>

          {/* Cards container */}
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}>
            {SUPPORT_TEAM_MEMBERS.map((member, idx) => (
              <MemberRow
                key={member.id}
                member={member}
                isLast={idx === SUPPORT_TEAM_MEMBERS.length - 1}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

function MemberRow({ member, isLast }) {
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered]   = useState(false)

  const initials = member.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  const statusKey = member.status || (member.active ? 'active' : 'offline')
  const status    = STATUS_CONFIG[statusKey] || STATUS_CONFIG.offline

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '14px 16px',
        background: hovered ? '#FAFAFA' : '#fff',
        borderBottom: isLast ? 'none' : '1px solid #F5F5F7',
        transition: 'background 0.15s',
      }}
    >
      {/* Avatar with status dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          background: `linear-gradient(135deg, ${ACCENT_START}, ${ACCENT_END})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {member.avatar && !imgError
            ? <img
                src={member.avatar}
                alt={member.name}
                onError={() => setImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            : <span style={{ fontWeight: 800, fontSize: '17px', color: '#fff' }}>{initials}</span>
          }
        </div>
        {/* Status dot */}
        <span style={{
          position: 'absolute', bottom: '1px', right: '1px',
          width: '12px', height: '12px', borderRadius: '50%',
          background: status.color,
          border: '2px solid #fff',
          boxShadow: status.glow !== 'none' ? `0 0 0 1px ${status.glow}` : 'none',
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: '14px', color: '#111',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: '2px',
        }}>
          {member.name}
        </div>
        <div style={{ fontSize: '12px', color: '#555', fontWeight: 500, marginBottom: '2px' }}>
          {member.role}
        </div>
        {member.department && (
          <div style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 500 }}>
            {member.department}
          </div>
        )}
      </div>

      {/* Status label */}
      <div style={{
        fontSize: '11px', fontWeight: 600,
        color: status.color,
        flexShrink: 0,
      }}>
        {status.label}
      </div>
    </div>
  )
}
