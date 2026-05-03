import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { LogIn, ShieldCheck, X, ArrowRight, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const LAST_UID_KEY = 'exzibo_master_last_uid'
const SUPER_ADMIN_KEY = 'exzibo_is_super_admin'
const DEFAULT_SUPER_ADMIN_UID = '0000000001'

function isSuperAdmin() {
  const stored = localStorage.getItem(SUPER_ADMIN_KEY)
  if (stored === null) {
    localStorage.setItem(SUPER_ADMIN_KEY, 'true')
    return true
  }
  return stored === 'true'
}

async function resolveAdminTargetByUID(uid) {
  const trimmed = String(uid || '').trim()
  if (!trimmed) return null
  if (trimmed === DEFAULT_SUPER_ADMIN_UID) {
    return { id: 'default' }
  }
  // Fast path: check localStorage first
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = all.find(r => String(r.uid) === trimmed)
    if (found) return { id: String(found.id) }
  } catch { /* noop */ }
  // Fallback: query Supabase directly (handles restaurants not yet in localStorage)
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, uid')
      .eq('uid', trimmed)
      .maybeSingle()
    if (!error && data) {
      console.log('[MasterControl] UID resolved via Supabase:', data.id)
      return { id: String(data.id) }
    }
  } catch { /* noop */ }
  return null
}

export default function MasterControl() {
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [uid, setUid] = useState('')
  const [error, setError] = useState('')
  const [inlineUid, setInlineUid] = useState('')
  const [inlineError, setInlineError] = useState('')

  useEffect(() => {
    const ok = isSuperAdmin()
    setAllowed(ok)
    if (!ok) {
      setTimeout(() => navigate('/dashboard'), 1500)
      return
    }
    const last = localStorage.getItem(LAST_UID_KEY) || ''
    setUid(last)
    setInlineUid(last)
  }, [navigate])

  async function accessPanel(value, setErr) {
    const trimmed = String(value || '').trim()
    if (!trimmed) {
      setErr('Please enter a Restaurant UID')
      return
    }
    setErr('')
    const target = await resolveAdminTargetByUID(trimmed)
    if (!target) {
      setErr('UID not found — check the UID and try again')
      return
    }
    localStorage.setItem(LAST_UID_KEY, trimmed)
    navigate(`/admin/${target.id}?from=master`)
  }

  if (!allowed) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '14px' }}>
          Access denied. Redirecting…
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="Master Control" showSearch={false} />

        <main style={{ flex: 1, overflowY: 'auto', padding: '32px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '24px', right: '32px' }}>
            <button
              onClick={() => { setError(''); setShowModal(true) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                background: '#E8321A',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 0 20px rgba(232,50,26,0.25)',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.5)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.25)'}
            >
              <LogIn size={15} />
              Login
            </button>
          </div>

          <div style={{ maxWidth: '640px', margin: '60px auto 0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '16px',
            }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'rgba(232,50,26,0.12)',
                border: '1px solid rgba(232,50,26,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ShieldCheck size={26} color="#E8321A" />
              </div>
              <div>
                <h1 style={{
                  margin: 0,
                  fontSize: '32px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#fff',
                }}>
                  Master Control
                </h1>
                <p style={{ margin: '4px 0 0', color: '#777', fontSize: '13px' }}>
                  Universal restaurant admin loader
                </p>
              </div>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '32px',
              marginTop: '32px',
            }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: '#888',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}>
                Enter Restaurant UID
              </label>
              <div style={{
                display: 'flex',
                gap: '10px',
              }}>
                <input
                  value={inlineUid}
                  onChange={e => { setInlineUid(e.target.value); setInlineError('') }}
                  onKeyDown={e => e.key === 'Enter' && accessPanel(inlineUid, setInlineError)}
                  placeholder="e.g. 0000000001 or 8472019465"
                  style={{
                    flex: 1,
                    background: '#0A0A0A',
                    border: `1px solid ${inlineError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    color: '#fff',
                    fontSize: '15px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />
                <button
                  onClick={() => accessPanel(inlineUid, setInlineError)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#E8321A',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#fff',
                    padding: '14px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 25px rgba(232,50,26,0.45)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  Access Panel
                  <ArrowRight size={14} />
                </button>
              </div>
              {inlineError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '12px',
                  color: '#EF4444',
                  fontSize: '13px',
                }}>
                  <AlertCircle size={14} />
                  {inlineError}
                </div>
              )}
              <p style={{ margin: '20px 0 0', color: '#555', fontSize: '12px', lineHeight: 1.6 }}>
                Paste a restaurant's UID to instantly load its admin panel. Only Super Admins can use this entry point.
              </p>
            </div>
          </div>

        </main>
      </div>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '440px',
              maxWidth: '90vw',
              background: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LogIn size={18} color="#E8321A" />
                <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 700, letterSpacing: '0.02em' }}>
                  Master Login
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              Restaurant UID
            </label>
            <input
              autoFocus
              value={uid}
              onChange={e => { setUid(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && accessPanel(uid, setError)}
              placeholder="Paste Restaurant UID..."
              style={{
                width: '100%',
                background: '#0A0A0A',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '10px',
                color: '#EF4444',
                fontSize: '12px',
              }}>
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            <button
              onClick={() => accessPanel(uid, setError)}
              style={{
                width: '100%',
                marginTop: '20px',
                background: '#E8321A',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                padding: '13px',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              Access Panel
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
