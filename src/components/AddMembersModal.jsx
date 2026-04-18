import React, { useState, useEffect } from 'react'
import { X, Briefcase, Users } from 'lucide-react'

const PRIMARY = '#E8380D'
const MAX_MANAGERS = 4
const MAX_STAFF = 20

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function CountBadge({ current, max }) {
  const atLimit = current >= max
  return (
    <span style={{
      fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
      padding: '3px 9px', borderRadius: '20px',
      background: atLimit ? '#FEE2E2' : '#F2F2F7',
      color: atLimit ? '#EF4444' : '#8E8E93',
      border: atLimit ? '1px solid #FECACA' : '1px solid #E0E0E0',
    }}>
      {atLimit ? 'Limit Reached' : `${current} / ${max}`}
    </span>
  )
}

function InviteSection({ icon: Icon, label, current, max, storageKey }) {
  const [count, setCount] = useState(current)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)

  const atLimit = count >= max

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleInvite() {
    setError('')
    if (!email.trim()) { setError('Please enter a valid email'); return }
    if (!isValidEmail(email)) { setError('Please enter a valid email'); return }
    if (atLimit) return

    const newCount = count + 1
    setCount(newCount)
    if (storageKey) localStorage.setItem(storageKey, String(newCount))
    showToast(`✅ Invite sent to ${email.trim()}`)
    setEmail('')
  }

  return (
    <div style={{
      background: '#F8F8FB',
      borderRadius: '14px',
      padding: '16px',
      marginBottom: '12px',
      border: '1px solid #EBEBF0',
    }}>
      {toast && (
        <div style={{
          background: '#ECFDF5', border: '1px solid #A7F3D0',
          borderRadius: '10px', padding: '10px 14px',
          fontSize: '12px', fontWeight: 600, color: '#059669',
          marginBottom: '12px',
          animation: 'addMemberFadeIn 0.25s ease',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon size={18} strokeWidth={1.6} color={PRIMARY} />
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.1em', color: '#1C1C1E', textTransform: 'uppercase' }}>
            {label}
          </span>
        </div>
        <CountBadge current={count} max={max} />
      </div>

      <input
        type="email"
        value={email}
        onChange={e => { setEmail(e.target.value); if (error) setError('') }}
        placeholder="Enter Google email..."
        disabled={atLimit}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '12px 16px',
          border: `1px solid ${error ? '#FECACA' : '#E0E0E0'}`,
          borderRadius: '10px',
          fontSize: '13px', color: '#1C1C1E',
          background: atLimit ? '#F2F2F7' : '#fff',
          outline: 'none', fontFamily: 'inherit',
          marginBottom: error ? '6px' : '10px',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { if (!atLimit) e.target.style.borderColor = PRIMARY }}
        onBlur={e => { e.target.style.borderColor = error ? '#FECACA' : '#E0E0E0' }}
      />

      {error && (
        <div style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600, marginBottom: '10px' }}>
          {error}
        </div>
      )}

      <button
        onClick={handleInvite}
        disabled={atLimit}
        style={{
          width: '100%', height: '48px',
          borderRadius: '12px',
          background: atLimit ? '#E5E5EA' : PRIMARY,
          border: 'none',
          color: atLimit ? '#999' : '#fff',
          fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em',
          cursor: atLimit ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: 'opacity 0.15s, transform 0.1s',
          boxShadow: atLimit ? 'none' : `0 4px 14px ${PRIMARY}40`,
        }}
        onMouseEnter={e => { if (!atLimit) e.currentTarget.style.opacity = '0.88' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        onMouseDown={e => { if (!atLimit) e.currentTarget.style.transform = 'scale(0.97)' }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        <GoogleIcon />
        Send Invite via Google
      </button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" opacity="0.9"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" opacity="0.9"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff" opacity="0.9"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" opacity="0.9"/>
    </svg>
  )
}

export default function AddMembersModal({ open, onClose, restaurantId }) {
  const storageBase = restaurantId || 'default'

  const [mounted, setMounted] = useState(false)
  useEffect(() => { if (open) setMounted(true) }, [open])

  const managerStorageKey = `exzibo_invite_managers_${storageBase}`
  const staffStorageKey = `exzibo_invite_staff_${storageBase}`

  const initManagerCount = () => Math.min(parseInt(localStorage.getItem(managerStorageKey) || '0'), MAX_MANAGERS)
  const initStaffCount = () => Math.min(parseInt(localStorage.getItem(staffStorageKey) || '0'), MAX_STAFF)

  if (!open && !mounted) return null

  return (
    <>
      <style>{`
        @keyframes addMemberSlideUp {
          from { opacity: 0; transform: translateY(40px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes addMemberFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
          animation: 'addMemberFadeIn 0.2s ease',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#fff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '340px',
            padding: '24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            animation: 'addMemberSlideUp 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1C1C1E', marginBottom: '4px' }}>
                Add Members
              </div>
              <div style={{ fontSize: '12px', color: '#8E8E93', fontWeight: 500, lineHeight: 1.4 }}>
                Send a Google login invite to your team
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#F2F2F7', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, marginLeft: '12px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#E5E5EA'}
              onMouseLeave={e => e.currentTarget.style.background = '#F2F2F7'}
            >
              <X size={16} color="#555" />
            </button>
          </div>

          <InviteSection
            key={`manager-${storageBase}`}
            icon={Briefcase}
            label="Add Manager"
            current={initManagerCount()}
            max={MAX_MANAGERS}
            storageKey={managerStorageKey}
          />
          <InviteSection
            key={`staff-${storageBase}`}
            icon={Users}
            label="Add Staff"
            current={initStaffCount()}
            max={MAX_STAFF}
            storageKey={staffStorageKey}
          />
        </div>
      </div>
    </>
  )
}
