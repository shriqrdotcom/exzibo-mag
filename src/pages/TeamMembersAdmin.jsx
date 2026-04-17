import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Crown, Shield, UtensilsCrossed, Plus, X, Trash2,
  ChevronDown, CheckCircle2, XCircle, Loader2, Check, Eye, LayoutDashboard
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { useRole } from '../context/RoleContext'

const TEAM_KEY = id => `exzibo_team_admin_${id}`

function loadTeam(restaurantId) {
  try {
    const raw = localStorage.getItem(TEAM_KEY(restaurantId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveTeam(restaurantId, members) {
  localStorage.setItem(TEAM_KEY(restaurantId), JSON.stringify(members))
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

const ROLE_COLUMNS = [
  { key: 'owner',   label: 'OWNER',   icon: Crown,          accent: '#D97706', accentBg: 'rgba(217,119,6,0.12)' },
  { key: 'manager', label: 'MANAGER', icon: Shield,         accent: '#3B82F6', accentBg: 'rgba(59,130,246,0.12)' },
  { key: 'staff',   label: 'STAFF',   icon: UtensilsCrossed, accent: '#10B981', accentBg: 'rgba(16,185,129,0.12)' },
]

const DEFAULT_ROLES = [
  {
    key: 'owner',
    label: 'OWNER',
    badge: 'Full Control',
    badgeColor: '#D97706',
    badgeBg: 'rgba(217,119,6,0.18)',
    icon: Crown,
    accent: '#D97706',
    accentBg: 'rgba(217,119,6,0.08)',
    borderColor: 'rgba(217,119,6,0.2)',
    description: 'Has access to ALL features:',
    permissions: [
      { label: 'Orders', granted: true },
      { label: 'Bookings', granted: true },
      { label: 'Menu Edit', granted: true },
      { label: 'Settings', granted: true },
      { label: 'Profile', granted: true },
      { label: 'Team Management', granted: true },
    ],
  },
  {
    key: 'manager',
    label: 'MANAGER',
    badge: 'Specific Control',
    badgeColor: '#3B82F6',
    badgeBg: 'rgba(59,130,246,0.18)',
    icon: Shield,
    accent: '#3B82F6',
    accentBg: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.2)',
    description: 'Controlled access:',
    permissions: [
      { label: 'Orders Page Access', granted: true },
      { label: 'Booking Page Access', granted: true },
      { label: 'Settings Page Access', granted: true },
      { label: 'Profile Section', granted: false },
      { label: 'Menu Edit (Owner enables)', granted: 'conditional' },
    ],
  },
  {
    key: 'staff',
    label: 'STAFF',
    badge: 'Limited Access',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16,185,129,0.18)',
    icon: UtensilsCrossed,
    accent: '#10B981',
    accentBg: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.2)',
    description: 'Operational access only:',
    permissions: [
      { label: 'Confirm Orders', granted: true },
      { label: 'Confirm Bookings', granted: true },
      { label: 'Menu Access', granted: false },
      { label: 'Settings', granted: false },
      { label: 'Team Management', granted: false },
    ],
  },
]

export default function TeamMembersAdmin() {
  const navigate = useNavigate()
  const { activateRole } = useRole()
  const [restaurants, setRestaurants] = useState([])
  const [teams, setTeams] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  function previewRole(role) {
    activateRole(role)
    navigate('/dashboard')
  }

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    setRestaurants(saved)
    const t = {}
    saved.forEach(r => { t[r.id] = loadTeam(r.id) })
    setTeams(t)
  }, [])

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  function addMember(restaurantId, email, role) {
    const current = teams[restaurantId] || []
    if (current.some(m => m.email.toLowerCase() === email.toLowerCase())) {
      showToast('This email is already in the team.', 'error')
      return false
    }
    const updated = [...current, { id: uid(), email: email.trim(), role, status: 'invited' }]
    const newTeams = { ...teams, [restaurantId]: updated }
    setTeams(newTeams)
    saveTeam(restaurantId, updated)
    showToast(`${email} added as ${role}.`)
    return true
  }

  function removeMember(restaurantId, memberId, email) {
    const updated = (teams[restaurantId] || []).filter(m => m.id !== memberId)
    const newTeams = { ...teams, [restaurantId]: updated }
    setTeams(newTeams)
    saveTeam(restaurantId, updated)
    showToast(`${email} removed.`)
  }

  function changeRole(restaurantId, memberId, newRole) {
    const updated = (teams[restaurantId] || []).map(m => m.id === memberId ? { ...m, role: newRole } : m)
    const newTeams = { ...teams, [restaurantId]: updated }
    setTeams(newTeams)
    saveTeam(restaurantId, updated)
    showToast('Role updated.')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: '4px' }}>
              TEAM MEMBERS
            </div>
            <div style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>
              Manage staff roles and permissions across all restaurants
            </div>
          </div>

          <DefaultRolesSection />

          <div style={{ marginTop: '32px' }}>
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
              color: '#555', marginBottom: '16px', textTransform: 'uppercase',
            }}>
              Per-Restaurant Teams
            </div>

            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th style={thStyle}>RESTAURANT UID</th>
                    {ROLE_COLUMNS.map(col => (
                      <th key={col.key} style={thStyle}>{col.label}</th>
                    ))}
                    <th style={thStyle}>STATUS</th>
                    <th style={thStyle}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '60px 28px', textAlign: 'center' }}>
                        <Users size={38} color="#333" style={{ marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
                        <div style={{ fontSize: '14px', color: '#444', fontWeight: 600 }}>No restaurants found</div>
                        <div style={{ fontSize: '12px', color: '#333', marginTop: '4px' }}>
                          Add restaurants from the Dashboard first
                        </div>
                      </td>
                    </tr>
                  ) : (
                    restaurants.map((r, idx) => {
                      const team = teams[r.id] || []
                      const isLast = idx === restaurants.length - 1
                      const isExpanded = expandedId === r.id
                      const isLive = r.status === 'active' || r.status === 'RUNNING'
                      return (
                        <React.Fragment key={r.id}>
                          <tr
                            style={{
                              borderBottom: (!isLast || isExpanded) ? '1px solid rgba(255,255,255,0.04)' : 'none',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '18px 24px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                  width: '36px', height: '36px', borderRadius: '10px',
                                  background: 'linear-gradient(135deg, #333, #222)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '10px', fontWeight: 800, color: '#888', flexShrink: 0,
                                }}>
                                  {r.name?.slice(0, 2).toUpperCase() || '??'}
                                </div>
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#ccc' }}>
                                    {r.uid || r.id}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                                    {r.name?.toUpperCase()}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {ROLE_COLUMNS.map(col => {
                              const roleMembers = team.filter(m => m.role === col.key)
                              const Icon = col.icon
                              return (
                                <td key={col.key} style={{ padding: '18px 24px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{
                                      width: '32px', height: '32px', borderRadius: '8px',
                                      background: col.accentBg,
                                      border: `1px solid ${col.accent}30`,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      flexShrink: 0,
                                    }}>
                                      <Icon size={14} color={col.accent} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      {roleMembers.length === 0 ? (
                                        <div style={{ fontSize: '11px', color: '#444', fontWeight: 600 }}>No {col.label}</div>
                                      ) : (
                                        <div style={{ fontSize: '12px', color: '#ccc', fontWeight: 700 }}>
                                          {roleMembers.length} {col.label}{roleMembers.length > 1 ? 'S' : ''}
                                        </div>
                                      )}
                                      <button
                                        onClick={() => setModal({ type: 'add', restaurantId: r.id, role: col.key, restaurantName: r.name })}
                                        style={{
                                          background: 'none', border: 'none', padding: 0,
                                          fontSize: '10px', color: col.accent, fontWeight: 700,
                                          cursor: 'pointer', letterSpacing: '0.04em',
                                          textDecoration: 'none',
                                        }}
                                      >
                                        + ADD GMAIL
                                      </button>
                                    </div>
                                    <button
                                      title={`Preview as ${col.label}`}
                                      onClick={() => previewRole(col.key)}
                                      style={{
                                        width: '26px', height: '26px', borderRadius: '7px',
                                        background: `${col.accent}15`,
                                        border: `1px solid ${col.accent}30`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', flexShrink: 0,
                                        transition: 'all 0.2s',
                                      }}
                                      onMouseEnter={e => {
                                        e.currentTarget.style.background = `${col.accent}30`
                                        e.currentTarget.style.borderColor = `${col.accent}60`
                                      }}
                                      onMouseLeave={e => {
                                        e.currentTarget.style.background = `${col.accent}15`
                                        e.currentTarget.style.borderColor = `${col.accent}30`
                                      }}
                                    >
                                      <Eye size={12} color={col.accent} />
                                    </button>
                                  </div>
                                </td>
                              )
                            })}

                            <td style={{ padding: '18px 24px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                  width: '7px', height: '7px', borderRadius: '50%',
                                  background: isLive ? '#22C55E' : '#555',
                                  boxShadow: isLive ? '0 0 8px #22C55E' : 'none',
                                  display: 'inline-block', flexShrink: 0,
                                }} />
                                <span style={{ fontSize: '12px', fontWeight: 700, color: isLive ? '#22C55E' : '#555' }}>
                                  {isLive ? 'LIVE' : 'OFFLINE'}
                                </span>
                              </div>
                            </td>

                            <td style={{ padding: '18px 24px' }}>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                                style={{
                                  padding: '8px 14px',
                                  background: isExpanded ? 'rgba(232,50,26,0.1)' : 'transparent',
                                  border: `1px solid ${isExpanded ? 'rgba(232,50,26,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                  borderRadius: '9px',
                                  color: isExpanded ? '#E8321A' : '#888',
                                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                                  cursor: 'pointer', transition: 'all 0.2s',
                                  display: 'flex', alignItems: 'center', gap: '5px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Users size={12} />
                                MANAGE TEAM
                              </button>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={6} style={{ padding: 0, background: '#0D0D0D' }}>
                                <RestaurantTeamPanel
                                  restaurant={r}
                                  team={teams[r.id] || []}
                                  onAdd={(email, role) => addMember(r.id, email, role)}
                                  onRemove={(memberId, email) => removeMember(r.id, memberId, email)}
                                  onChangeRole={(memberId, newRole) => changeRole(r.id, memberId, newRole)}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {modal && (
        <AddMemberModal
          restaurantName={modal.restaurantName}
          defaultRole={modal.role}
          onAdd={(email, role) => {
            const ok = addMember(modal.restaurantId, email, role)
            if (ok) {
              setModal(null)
              previewRole(role)
            }
          }}
          onClose={() => setModal(null)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#1a0a0a' : '#0a1a0a',
          border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          borderRadius: '50px', padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: '8px',
          zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'fadeInUp 0.2s ease',
        }}>
          {toast.type === 'error'
            ? <XCircle size={15} color="#EF4444" />
            : <CheckCircle2 size={15} color="#22C55E" />}
          <span style={{ fontSize: '13px', fontWeight: 600, color: toast.type === 'error' ? '#EF4444' : '#22C55E' }}>
            {toast.message}
          </span>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>
    </div>
  )
}

function DefaultRolesSection() {
  const navigate = useNavigate()

  function openDefaultAdmin() {
    navigate('/admin/0000000001')
  }

  return (
    <div>
      <div style={{
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
        color: '#555', marginBottom: '16px', textTransform: 'uppercase',
      }}>
        Default Role Templates
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {DEFAULT_ROLES.map(role => {
          const Icon = role.icon
          const isOwner = role.key === 'owner'
          return (
            <div key={role.key} style={{
              background: '#111',
              border: `1px solid ${role.borderColor}`,
              borderRadius: '18px',
              padding: '22px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: '-30px', right: '-30px',
                width: '100px', height: '100px', borderRadius: '50%',
                background: role.accentBg,
              }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    onClick={isOwner ? openDefaultAdmin : undefined}
                    title={isOwner ? 'Open Admin Panel' : undefined}
                    style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: role.accentBg,
                      border: `1px solid ${role.borderColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: isOwner ? 'pointer' : 'default',
                    }}>
                    <Icon size={17} color={role.accent} />
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
                    {role.label}
                  </span>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                  color: role.badgeColor, background: role.badgeBg,
                  padding: '3px 9px', borderRadius: '20px',
                  border: `1px solid ${role.badgeColor}30`,
                }}>
                  {role.badge}
                </span>
              </div>

              <div style={{ fontSize: '11px', color: '#555', fontWeight: 600, marginBottom: '10px' }}>
                {role.description}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {role.permissions.map((p, i) => {
                  const isConditional = p.granted === 'conditional'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {isConditional ? (
                        <span style={{ fontSize: '13px' }}>⚙️</span>
                      ) : p.granted ? (
                        <CheckCircle2 size={13} color="#22C55E" />
                      ) : (
                        <XCircle size={13} color="#EF4444" />
                      )}
                      <span style={{
                        fontSize: '12px', fontWeight: 500,
                        color: isConditional ? '#888' : p.granted ? '#aaa' : '#555',
                      }}>
                        {p.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {isOwner && (
                <button
                  onClick={openDefaultAdmin}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '50px',
                    padding: '9px 20px', fontSize: '12px', fontWeight: 800,
                    color: '#fff', letterSpacing: '0.06em', cursor: 'pointer',
                    width: '100%', justifyContent: 'center', marginTop: '14px',
                    transition: 'transform 0.15s ease, background 0.2s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                >
                  <LayoutDashboard size={13} />
                  OPEN ADMIN
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RestaurantTeamPanel({ restaurant, team, onAdd, onRemove, onChangeRole }) {
  const [confirmRemove, setConfirmRemove] = useState(null)

  return (
    <div style={{ padding: '20px 24px', animation: 'slideDown 0.2s ease' }}>
      <div style={{
        background: '#111',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <Users size={15} color="#E8321A" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ccc' }}>
            {restaurant.name?.toUpperCase()} — Team ({team.length} members)
          </span>
        </div>

        {team.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#444', fontSize: '13px', fontWeight: 500 }}>
            No members yet. Use "+ ADD GMAIL" buttons above to add team members.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['EMAIL / GMAIL', 'ROLE', 'STATUS', 'ACTIONS'].map(h => (
                  <th key={h} style={{ ...thStyle, fontSize: '10px', padding: '10px 20px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((member, idx) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isLast={idx === team.length - 1}
                  onRemove={() => setConfirmRemove(member)}
                  onChangeRole={role => onChangeRole(member.id, role)}
                />
              ))}
            </tbody>
          </table>
        )}

        <div style={{
          padding: '16px 20px',
          borderTop: team.length > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
        }}>
          <AddMemberInlineForm
            onAdd={onAdd}
            existingEmails={team.map(m => m.email.toLowerCase())}
          />
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          message={`Remove ${confirmRemove.email} from this restaurant's team?`}
          onConfirm={() => {
            onRemove(confirmRemove.id, confirmRemove.email)
            setConfirmRemove(null)
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  )
}

function MemberRow({ member, isLast, onRemove, onChangeRole }) {
  const roleConfig = ROLE_COLUMNS.find(r => r.key === member.role) || ROLE_COLUMNS[2]
  const isActive = member.status === 'active'

  return (
    <tr style={{
      borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.03)',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: `${roleConfig.accent}22`,
            border: `1px solid ${roleConfig.accent}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 800, color: roleConfig.accent, flexShrink: 0,
          }}>
            {member.email.slice(0, 1).toUpperCase()}
          </div>
          <span style={{ fontSize: '13px', color: '#ccc', fontWeight: 500 }}>{member.email}</span>
        </div>
      </td>
      <td style={{ padding: '12px 20px' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={member.role}
            onChange={e => onChangeRole(e.target.value)}
            style={{
              appearance: 'none', background: `${roleConfig.accent}15`,
              border: `1px solid ${roleConfig.accent}30`,
              borderRadius: '8px', padding: '5px 26px 5px 10px',
              color: roleConfig.accent, fontSize: '11px', fontWeight: 700,
              letterSpacing: '0.06em', cursor: 'pointer', outline: 'none',
            }}
          >
            {ROLE_COLUMNS.map(r => (
              <option key={r.key} value={r.key} style={{ background: '#111', color: '#ccc' }}>
                {r.label}
              </option>
            ))}
          </select>
          <ChevronDown size={11} color={roleConfig.accent} style={{
            position: 'absolute', right: '8px', top: '50%',
            transform: 'translateY(-50%)', pointerEvents: 'none',
          }} />
        </div>
      </td>
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: isActive ? '#22C55E' : '#F59E0B', display: 'inline-block',
          }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: isActive ? '#22C55E' : '#F59E0B', letterSpacing: '0.06em' }}>
            {isActive ? 'ACTIVE' : 'INVITED'}
          </span>
        </div>
      </td>
      <td style={{ padding: '12px 20px' }}>
        <button onClick={onRemove} style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#EF4444',
        }}>
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  )
}

function AddMemberInlineForm({ onAdd, existingEmails }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email.trim()) { setError('Email is required'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address'); return }
    if (existingEmails.includes(email.trim().toLowerCase())) {
      setError('This email is already in the team'); return
    }
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 400))
    const ok = onAdd(email.trim(), role)
    setLoading(false)
    if (ok !== false) { setEmail(''); setRole('staff') }
  }

  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: '10px' }}>
        ADD MEMBER
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            placeholder="gmail@example.com"
            style={{
              width: '100%', padding: '10px 14px',
              background: '#0A0A0A', border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '10px', color: '#fff', fontSize: '13px', outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(232,50,26,0.5)'}
            onBlur={e => e.target.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          {error && <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px' }}>{error}</div>}
        </div>

        <div style={{ position: 'relative' }}>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{
              appearance: 'none', background: '#0A0A0A',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '10px 32px 10px 14px',
              color: '#ccc', fontSize: '13px', cursor: 'pointer', outline: 'none',
            }}
          >
            {ROLE_COLUMNS.map(r => (
              <option key={r.key} value={r.key} style={{ background: '#111' }}>{r.label}</option>
            ))}
          </select>
          <ChevronDown size={13} color="#666" style={{
            position: 'absolute', right: '10px', top: '50%',
            transform: 'translateY(-50%)', pointerEvents: 'none',
          }} />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: '10px 18px',
            background: loading ? 'rgba(232,50,26,0.5)' : '#E8321A',
            border: 'none', borderRadius: '10px',
            color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            boxShadow: loading ? 'none' : '0 0 16px rgba(232,50,26,0.3)',
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
        >
          {loading
            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Plus size={13} />}
          {loading ? 'ADDING…' : 'ADD MEMBER'}
        </button>
      </div>
    </div>
  )
}

function AddMemberModal({ restaurantName, defaultRole, onAdd, onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(defaultRole || 'staff')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!email.trim()) { setError('Email is required'); return }
    if (!isValidEmail(email)) { setError('Enter a valid email address'); return }
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 400))
    onAdd(email.trim(), role)
    setLoading(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#111', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px', padding: '28px', width: '380px', zIndex: 1001,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>Add Team Member</div>
            <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{restaurantName?.toUpperCase()}</div>
          </div>
          <button onClick={onClose} style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#888',
          }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#555', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
            GMAIL / EMAIL
          </label>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            placeholder="member@gmail.com"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{
              width: '100%', padding: '11px 14px', boxSizing: 'border-box',
              background: '#0A0A0A', border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '10px', color: '#fff', fontSize: '13px', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(232,50,26,0.5)'}
            onBlur={e => e.target.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}
          />
          {error && <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '5px' }}>{error}</div>}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#555', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
            ROLE
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{
                width: '100%', appearance: 'none',
                background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '11px 36px 11px 14px',
                color: '#ccc', fontSize: '13px', cursor: 'pointer', outline: 'none',
              }}
            >
              {ROLE_COLUMNS.map(r => (
                <option key={r.key} value={r.key} style={{ background: '#111' }}>{r.label}</option>
              ))}
            </select>
            <ChevronDown size={14} color="#666" style={{
              position: 'absolute', right: '12px', top: '50%',
              transform: 'translateY(-50%)', pointerEvents: 'none',
            }} />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', padding: '12px',
            background: loading ? 'rgba(232,50,26,0.5)' : '#E8321A',
            border: 'none', borderRadius: '12px',
            color: '#fff', fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: loading ? 'none' : '0 0 20px rgba(232,50,26,0.3)',
          }}
        >
          {loading
            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> ADDING…</>
            : <><Check size={14} /> ADD MEMBER</>}
        </button>
      </div>
    </>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#111', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: '18px', padding: '28px', width: '320px', zIndex: 2001,
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Trash2 size={18} color="#EF4444" />
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: '8px' }}>
          Confirm Removal
        </div>
        <div style={{ fontSize: '13px', color: '#666', textAlign: 'center', lineHeight: 1.5, marginBottom: '24px' }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '11px',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '11px', color: '#888', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer',
          }}>
            CANCEL
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '11px',
            background: '#EF4444', border: 'none',
            borderRadius: '11px', color: '#fff', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 0 16px rgba(239,68,68,0.3)',
          }}>
            REMOVE
          </button>
        </div>
      </div>
    </>
  )
}

const thStyle = {
  padding: '14px 24px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#555',
}
