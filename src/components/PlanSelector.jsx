import React from 'react'

const PLANS = [
  {
    key: 'PLUS',
    label: 'PLUS',
    icon: '🟦',
    tagline: 'Get started',
    bg: '#3B82F6',
    color: '#fff',
    borderActive: 'rgba(59,130,246,0.9)',
    glowActive: 'rgba(59,130,246,0.35)',
    bgCard: 'rgba(59,130,246,0.06)',
    features: [
      'Up to 2 Menus',
      'Basic Analytics',
      'Standard Support',
      'Customer Page',
    ],
  },
  {
    key: 'PRO',
    label: 'PRO',
    icon: '⬜',
    tagline: 'Most popular',
    bg: '#F3F4F6',
    color: '#111',
    borderActive: 'rgba(243,244,246,0.9)',
    glowActive: 'rgba(255,255,255,0.2)',
    bgCard: 'rgba(243,244,246,0.05)',
    features: [
      'Up to 10 Menus',
      'Advanced Analytics',
      'Priority Support',
      'Custom Domain',
    ],
  },
  {
    key: 'MAX',
    label: 'MAX',
    icon: '🟨',
    tagline: 'Full power',
    bg: '#F59E0B',
    color: '#111',
    borderActive: 'rgba(245,158,11,0.9)',
    glowActive: 'rgba(245,158,11,0.3)',
    bgCard: 'rgba(245,158,11,0.06)',
    features: [
      'Unlimited Menus',
      'Full Analytics Suite',
      'Dedicated Support',
      'Custom Branding',
    ],
  },
]

export default function PlanSelector({ selected, onChange }) {
  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '14px',
      }}>
        {PLANS.map(plan => {
          const isSelected = selected === plan.key
          return (
            <div
              key={plan.key}
              onClick={() => onChange(plan.key)}
              style={{
                position: 'relative',
                background: isSelected ? plan.bgCard : 'rgba(255,255,255,0.02)',
                border: isSelected
                  ? `1.5px solid ${plan.borderActive}`
                  : '1.5px solid rgba(255,255,255,0.07)',
                borderRadius: '16px',
                padding: '22px 20px',
                cursor: 'pointer',
                transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: isSelected ? `0 0 24px ${plan.glowActive}` : 'none',
                opacity: isSelected ? 1 : 0.65,
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.opacity = '0.65' }}
            >
              {/* Checkmark */}
              {isSelected && (
                <div style={{
                  position: 'absolute', top: '12px', right: '12px',
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: plan.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', color: plan.color, fontWeight: 900,
                  boxShadow: `0 0 10px ${plan.glowActive}`,
                }}>
                  ✓
                </div>
              )}

              {/* Badge pill */}
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '20px',
                background: plan.bg,
                color: plan.color,
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.1em',
                marginBottom: '8px',
              }}>
                {plan.label}
              </span>

              {/* Tagline */}
              <div style={{ fontSize: '10px', color: '#555', fontWeight: 500, marginBottom: '14px', letterSpacing: '0.05em' }}>
                {plan.tagline}
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {plan.features.map(f => (
                  <li key={f} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    fontSize: '12px', color: '#666', lineHeight: 1.4,
                  }}>
                    <span style={{ color: plan.bg, fontSize: '12px', lineHeight: 1.4, flexShrink: 0 }}>✦</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .plan-selector-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
