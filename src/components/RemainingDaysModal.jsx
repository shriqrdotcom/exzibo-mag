import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Calendar, Hourglass, ArrowRight } from 'lucide-react'

const GREEN = '#2E7D32'
const GREEN_LIGHT = '#EAF5EA'
const GREEN_TINT = '#F4FAF4'

export default function RemainingDaysModal({
  open,
  onClose,
  planName = 'Growth',
  startDate = '22-04-2026',
  endDate = '03-05-2026',
  daysLeft = 24,
  isActive = true,
  onRenew,
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!open || !mounted || typeof document === 'undefined') return null

  const handleRenew = () => {
    if (onRenew) onRenew()
    else console.log('Renew clicked')
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '24px',
          width: '100%', maxWidth: '480px',
          padding: '32px',
          boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
          position: 'relative',
          color: '#111',
          fontFamily: 'inherit',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: '20px', right: '20px',
            width: '36px', height: '36px', borderRadius: '50%',
            background: '#F2F2F2', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#444',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#E5E5E5'}
          onMouseLeave={e => e.currentTarget.style.background = '#F2F2F2'}
        >
          <X size={18} />
        </button>

        {/* Title */}
        <h2 style={{
          margin: '0 0 10px',
          fontSize: '28px', fontWeight: 800,
          color: '#0E1B2A', letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}>
          Remaining Days
        </h2>

        {/* Subtitle */}
        <p style={{
          margin: '0 0 24px',
          fontSize: '14px', lineHeight: 1.5,
          color: '#5b6675',
          maxWidth: '380px',
        }}>
          <span style={{ fontWeight: 700, color: '#3a4150' }}>Stay</span>{' '}
          active and uninterrupted. Renew your plan to keep your restaurant running smoothly.
        </p>

        {/* Subscription plan card */}
        <div style={{
          background: GREEN_TINT,
          border: `1px solid ${GREEN_LIGHT}`,
          borderRadius: '16px',
          padding: '18px 20px',
          marginBottom: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '11px', fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#7a8493', marginBottom: '6px',
            }}>
              Subscription Plan
            </div>
            <div style={{
              fontSize: '22px', fontWeight: 800,
              color: '#0E1B2A', lineHeight: 1.1,
            }}>
              {planName}
            </div>
          </div>
          {isActive && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: GREEN_LIGHT, color: GREEN,
              padding: '8px 14px', borderRadius: '999px',
              fontSize: '13px', fontWeight: 700,
              flexShrink: 0,
            }}>
              <Star size={14} fill={GREEN} stroke={GREEN} />
              Active
            </div>
          )}
        </div>

        {/* Dates card */}
        <div style={{
          background: '#fff',
          border: '1px solid #ECECEC',
          borderRadius: '16px',
          padding: '16px 18px',
          marginBottom: '14px',
          display: 'flex', alignItems: 'stretch',
          gap: '12px',
        }}>
          <DateBlock label="Starting Date" value={startDate} align="left" />
          <div style={{ width: '1px', background: '#ECECEC' }} />
          <DateBlock label="Ending Date" value={endDate} align="left" />
        </div>

        {/* Days left card */}
        <div style={{
          background: GREEN_TINT,
          border: `1px solid ${GREEN_LIGHT}`,
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '16px',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: '#fff',
            border: `1.5px solid ${GREEN_LIGHT}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: GREEN, flexShrink: 0,
          }}>
            <Hourglass size={28} strokeWidth={1.6} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '11px', fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: GREEN, marginBottom: '4px',
            }}>
              How Many Days Left
            </div>
            <div style={{
              fontSize: '32px', fontWeight: 800,
              color: GREEN, lineHeight: 1.05, marginBottom: '6px',
              letterSpacing: '-0.01em',
            }}>
              {daysLeft} Days
            </div>
            <div style={{
              fontSize: '13px', lineHeight: 1.45,
              color: '#5b6675',
            }}>
              Renew before your plan expires to avoid any service interruption.
            </div>
          </div>
        </div>

        {/* Renew button */}
        <button
          onClick={handleRenew}
          onMouseEnter={e => e.currentTarget.style.background = '#256527'}
          onMouseLeave={e => e.currentTarget.style.background = GREEN}
          style={{
            width: '100%', padding: '16px',
            background: GREEN, color: '#fff',
            border: 'none', borderRadius: '14px',
            fontSize: '16px', fontWeight: 700,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '10px',
            transition: 'background 0.15s',
            boxShadow: '0 8px 20px rgba(46,125,50,0.25)',
          }}
        >
          Renew Now
          <ArrowRight size={18} />
        </button>
      </div>
    </div>,
    document.body
  )
}

function DateBlock({ label, value }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '50%',
        background: GREEN_LIGHT, color: GREEN,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Calendar size={18} strokeWidth={1.8} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#7a8493', marginBottom: '3px',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: '15px', fontWeight: 800,
          color: '#0E1B2A',
        }}>
          {value}
        </div>
      </div>
    </div>
  )
}
