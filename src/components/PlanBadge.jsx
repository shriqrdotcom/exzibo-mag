import React from 'react'

const PLANS = {
  PLUS: {
    bg: '#3B82F6',
    color: '#fff',
    border: 'rgba(59,130,246,0.6)',
    glow: 'rgba(59,130,246,0.5)',
  },
  PRO: {
    bg: '#F3F4F6',
    color: '#111',
    border: 'rgba(243,244,246,0.8)',
    glow: 'rgba(243,244,246,0.4)',
  },
  MAX: {
    bg: '#F59E0B',
    color: '#111',
    border: 'rgba(245,158,11,0.7)',
    glow: 'rgba(245,158,11,0.5)',
  },
}

export default function PlanBadge({ plan, active = false, size = 'sm' }) {
  if (!plan) return null
  const key = plan.toUpperCase()
  const s = PLANS[key]
  if (!s) return null

  const isSmall = size === 'sm'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: isSmall ? '3px 9px' : '5px 13px',
      borderRadius: '20px',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      fontSize: isSmall ? '10px' : '12px',
      fontWeight: 800,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      boxShadow: active ? `0 0 12px ${s.glow}` : 'none',
      transition: 'box-shadow 0.2s',
      userSelect: 'none',
    }}>
      {active && <span style={{ fontSize: isSmall ? '8px' : '10px', lineHeight: 1 }}>✓</span>}
      {key}
    </span>
  )
}
