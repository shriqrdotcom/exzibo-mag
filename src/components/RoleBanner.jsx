import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '../context/RoleContext'
import { Crown, Shield, UtensilsCrossed, X } from 'lucide-react'

const ROLE_CONFIG = {
  owner: {
    icon: Crown,
    label: 'Owner View',
    sub: 'Full Control — All features accessible',
    color: '#D97706',
    bg: 'rgba(217,119,6,0.1)',
    border: 'rgba(217,119,6,0.25)',
    glow: 'rgba(217,119,6,0.15)',
  },
  manager: {
    icon: Shield,
    label: 'Manager View',
    sub: 'Specific Access — Profile & Team hidden',
    color: '#3B82F6',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.25)',
    glow: 'rgba(59,130,246,0.15)',
  },
  staff: {
    icon: UtensilsCrossed,
    label: 'Staff View',
    sub: 'Operational Only — Confirm orders & bookings',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.25)',
    glow: 'rgba(16,185,129,0.15)',
  },
}

export default function RoleBanner() {
  const { activeRole, exitRoleView } = useRole()
  const navigate = useNavigate()
  if (!activeRole) return null

  function handleExit() {
    exitRoleView()
    navigate('/team-members')
  }

  const cfg = ROLE_CONFIG[activeRole]
  const Icon = cfg.icon

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 32px',
      background: cfg.bg,
      borderBottom: `1px solid ${cfg.border}`,
      boxShadow: `0 2px 16px ${cfg.glow}`,
      animation: 'bannerSlide 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: `${cfg.color}22`,
          border: `1px solid ${cfg.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={14} color={cfg.color} />
        </div>
        <div>
          <span style={{ fontSize: '12px', fontWeight: 800, color: cfg.color, letterSpacing: '0.06em' }}>
            PREVIEW MODE —
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ccc', marginLeft: '6px' }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: '11px', color: '#555', marginLeft: '10px', fontWeight: 500 }}>
            {cfg.sub}
          </span>
        </div>
      </div>

      <button
        onClick={handleExit}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '8px',
          color: '#aaa', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.06em', cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = '#aaa'
        }}
      >
        <X size={12} />
        EXIT ROLE VIEW
      </button>

      <style>{`
        @keyframes bannerSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
