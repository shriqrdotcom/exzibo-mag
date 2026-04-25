import React, { useState, useEffect } from 'react'
import { Settings2, X, Check } from 'lucide-react'

const PLANS = [
  { key: 'STARTER',    label: 'STARTER',    dot: '#3B82F6' },
  { key: 'GROWTH',     label: 'GROWTH',     dot: '#22c55e' },
  { key: 'SCALE',      label: 'SCALE',      dot: '#A855F7' },
  { key: 'CUSTOMISED', label: 'CUSTOMISED', dot: '#F59E0B' },
]

const DEFAULT_LIMITS = {
  totalTables: 0,
  ownerPanelUsers: 0,
  managerPanelUsers: 0,
  employeeSectionUsers: 0,
}

const FIELDS = [
  { key: 'totalTables',          label: 'Total Tables' },
  { key: 'ownerPanelUsers',      label: 'Owner Panel Users' },
  { key: 'managerPanelUsers',    label: 'Manager Panel Users' },
  { key: 'employeeSectionUsers', label: 'Employee Section Users' },
]

export default function PlanSelector({
  selected = 'STARTER',
  onChange,
  limits,
  onLimitsChange,
}) {
  const getLimitsFor = (key) => ({ ...DEFAULT_LIMITS, ...((limits && limits[key]) || {}) })
  const selectedLimits = getLimitsFor(selected)

  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState(selectedLimits)

  useEffect(() => {
    if (editOpen) setDraft(selectedLimits)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, selected])

  const updateField = (key, value) => {
    const num = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0)
    setDraft(d => ({ ...d, [key]: num }))
  }

  const updateLiveCustom = (key, value) => {
    if (!onLimitsChange) return
    const num = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0)
    onLimitsChange({
      ...(limits || {}),
      CUSTOMISED: { ...getLimitsFor('CUSTOMISED'), [key]: num },
    })
  }

  const saveModal = () => {
    const cleaned = Object.fromEntries(
      Object.entries(draft).map(([k, v]) => [k, v === '' ? 0 : v])
    )
    onLimitsChange && onLimitsChange({
      ...(limits || {}),
      [selected]: cleaned,
    })
    setEditOpen(false)
  }

  return (
    <div>
      {/* Top header row with EDIT button */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        marginBottom: '14px',
      }}>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px',
            color: '#ddd',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            cursor: 'pointer',
            transition: 'all 0.18s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(232,50,26,0.10)'
            e.currentTarget.style.borderColor = 'rgba(232,50,26,0.45)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
            e.currentTarget.style.color = '#ddd'
          }}
        >
          <Settings2 size={13} />
          EDIT
        </button>
      </div>

      {/* Plan cards grid */}
      <div className="plan-selector-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '14px',
      }}>
        {PLANS.map(plan => {
          const isSelected = selected === plan.key
          const cardLimits = getLimitsFor(plan.key)
          return (
            <div
              key={plan.key}
              onClick={() => onChange && onChange(plan.key)}
              style={{
                position: 'relative',
                background: isSelected ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                border: isSelected
                  ? `1.5px solid ${plan.dot}`
                  : '1.5px solid rgba(255,255,255,0.07)',
                borderRadius: '16px',
                padding: '22px 18px',
                cursor: 'pointer',
                transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: isSelected ? `0 0 24px ${plan.dot}33` : 'none',
                opacity: isSelected ? 1 : 0.7,
                minHeight: '120px',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.opacity = '0.92' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.opacity = '0.7' }}
            >
              {/* Checkmark */}
              {isSelected && (
                <div style={{
                  position: 'absolute', top: '12px', right: '12px',
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: plan.dot,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                  boxShadow: `0 0 10px ${plan.dot}66`,
                }}>
                  <Check size={13} strokeWidth={3} />
                </div>
              )}

              {/* Badge pill: dot + label */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '5px 11px',
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                marginBottom: '12px',
              }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: plan.dot, boxShadow: `0 0 6px ${plan.dot}88`,
                }} />
                <span style={{
                  fontSize: '11px', fontWeight: 800,
                  letterSpacing: '0.1em', color: '#fff',
                }}>
                  {plan.label}
                </span>
              </div>

              {/* CUSTOMISED inline editable fields (only when selected) */}
              {plan.key === 'CUSTOMISED' && isSelected && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}
                >
                  {FIELDS.map(f => (
                    <div key={f.key}>
                      <div style={{
                        fontSize: '9px', fontWeight: 700,
                        letterSpacing: '0.12em', color: '#666',
                        textTransform: 'uppercase', marginBottom: '4px',
                      }}>
                        {f.label}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={cardLimits[f.key] ?? 0}
                        onChange={e => updateLiveCustom(f.key, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = plan.dot }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Read-only limits summary for non-CUSTOMISED plans */}
              {plan.key !== 'CUSTOMISED' && (
                <ul style={{
                  listStyle: 'none', padding: 0, margin: '4px 0 0 0',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                  {FIELDS.map(f => (
                    <li key={f.key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '8px',
                    }}>
                      <span style={{
                        fontSize: '11px', color: '#777', fontWeight: 500,
                      }}>
                        {f.label}
                      </span>
                      <span style={{
                        fontSize: '12px', color: isSelected ? '#fff' : '#aaa',
                        fontWeight: 800, fontFamily: 'monospace',
                      }}>
                        {cardLimits[f.key] ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {/* EDIT MODAL */}
      {editOpen && (
        <div
          onClick={() => setEditOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '440px',
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '18px',
              padding: '26px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setEditOpen(false)}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '30px', height: '30px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#888', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>

            <div style={{
              fontSize: '15px', fontWeight: 800,
              letterSpacing: '0.06em', marginBottom: '4px', paddingRight: '40px',
              color: '#fff', textTransform: 'uppercase',
            }}>
              EDIT PLAN LIMITS
            </div>
            <div style={{
              fontSize: '11px', color: '#666', marginBottom: '20px',
            }}>
              Configure limits for the <span style={{ color: '#fff', fontWeight: 700 }}>{selected}</span> plan
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {FIELDS.map(f => (
                <div key={f.key}>
                  <div style={{
                    fontSize: '10px', fontWeight: 700,
                    letterSpacing: '0.14em', color: '#777',
                    textTransform: 'uppercase', marginBottom: '6px',
                  }}>
                    {f.label}
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={draft[f.key] ?? 0}
                    onChange={e => updateField(f.key, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '11px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(232,50,26,0.5)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
                  />
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', gap: '10px', marginTop: '24px',
            }}>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  color: '#bbb',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={saveModal}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  background: '#E8321A',
                  border: '1px solid #E8321A',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(232,50,26,0.35)',
                }}
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .plan-selector-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .plan-selector-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
