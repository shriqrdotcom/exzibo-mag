import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, FlaskConical, ShieldOff } from 'lucide-react'
import { IS_PREVIEW } from '../lib/env'
import { previewLogin } from '../lib/previewAuth'

export default function Auth() {
  const navigate = useNavigate()
  const { user, signInWithGoogle, setPreviewUser, accessDenied } = useAuth()

  const [email, setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // Redirect already-authenticated users — go to saved path or /dashboard
  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem('auth_redirect')
      localStorage.removeItem('auth_redirect')
      const safe = saved && saved.startsWith('/') && !saved.startsWith('//') && !saved.startsWith('/auth')
      navigate(safe ? saved : '/dashboard', { replace: true })
    }
  }, [user, navigate])

  /* ── Preview login ── */
  async function handlePreviewSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await previewLogin(email, password)
      setPreviewUser({ email, isPreviewUser: true })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  /* ── Shared field styles ── */
  const fieldWrap = {
    display: 'flex', alignItems: 'center', gap: '10px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px', padding: '0 14px', transition: 'border-color 0.15s',
  }
  const inputStyle = {
    flex: 1, padding: '13px 0', background: 'transparent', border: 'none',
    outline: 'none', color: '#fff', fontSize: '14px', fontWeight: 500, fontFamily: 'inherit',
  }

  /* ════════════════════════════════════════
     PREVIEW MODE UI
  ════════════════════════════════════════ */
  if (IS_PREVIEW) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(232,50,26,0.18) 0%, #0A0A0A 60%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', -apple-system, sans-serif", padding: '24px',
      }}>
        <div onClick={() => navigate('/')} style={{ fontWeight: 900, fontSize: '26px', letterSpacing: '0.04em', color: '#fff', marginBottom: '32px', cursor: 'pointer' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          background: 'rgba(232,50,26,0.1)', border: '1px solid rgba(232,50,26,0.25)',
          borderRadius: '20px', padding: '6px 14px', marginBottom: '24px',
        }}>
          <FlaskConical size={13} color="#E8321A" />
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#E8321A', letterSpacing: '0.06em' }}>PREVIEW ENVIRONMENT</span>
        </div>

        <div style={{
          width: '100%', maxWidth: '380px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: '24px', padding: '32px 28px', backdropFilter: 'blur(20px)',
        }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontWeight: 800, fontSize: '20px', color: '#fff', marginBottom: '6px' }}>Preview Access</div>
            <div style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>Enter the preview credentials to continue</div>
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 14px', borderRadius: '12px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: '18px',
            }}>
              <AlertCircle size={14} color="#EF4444" />
              <span style={{ fontSize: '13px', color: '#EF4444', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          <form onSubmit={handlePreviewSubmit}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: '8px' }}>EMAIL</label>
              <div style={fieldWrap}
                onFocusCapture={e => e.currentTarget.style.borderColor = 'rgba(232,50,26,0.5)'}
                onBlurCapture={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              >
                <Mail size={14} color="#555" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="Preview email" autoComplete="email" style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: '8px' }}>PASSWORD</label>
              <div style={fieldWrap}
                onFocusCapture={e => e.currentTarget.style.borderColor = 'rgba(232,50,26,0.5)'}
                onBlurCapture={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              >
                <Lock size={14} color="#555" />
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="Preview password" autoComplete="current-password" style={inputStyle} />
                <button type="button" onClick={() => setShowPwd(p => !p)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', display: 'flex', padding: '2px' }}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: loading ? 'rgba(232,50,26,0.5)' : '#E8321A',
              border: 'none', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: 800,
              letterSpacing: '0.06em', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: loading ? 'none' : '0 0 24px rgba(232,50,26,0.35)', transition: 'all 0.2s',
            }}>
              {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> SIGNING IN…</> : 'ACCESS PREVIEW'}
            </button>
          </form>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  /* ════════════════════════════════════════
     PRODUCTION MODE UI — Google OAuth only
  ════════════════════════════════════════ */
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(232,50,26,0.18) 0%, #0A0A0A 60%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif", padding: '24px',
    }}>
      <div onClick={() => navigate('/')} style={{ fontWeight: 900, fontSize: '26px', letterSpacing: '0.04em', color: '#fff', marginBottom: '40px', cursor: 'pointer' }}>
        EXZI<span style={{ color: '#E8321A' }}>BO</span>
      </div>

      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '24px', padding: '36px 32px', backdropFilter: 'blur(20px)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8321A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div style={{ fontWeight: 800, fontSize: '22px', color: '#fff', letterSpacing: '-0.02em', marginBottom: '6px' }}>
            Private Access
          </div>
          <div style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>
            This system is restricted to authorized accounts only
          </div>
        </div>

        {/* Access denied error */}
        {(accessDenied || error) && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '14px 16px', borderRadius: '12px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            marginBottom: '20px',
          }}>
            <ShieldOff size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <div style={{ fontSize: '13px', color: '#EF4444', fontWeight: 700, marginBottom: '2px' }}>Access Denied</div>
              <div style={{ fontSize: '12px', color: '#EF4444', opacity: 0.8 }}>
                Your account is not authorized. Contact the system administrator.
              </div>
            </div>
          </div>
        )}

        {/* Google sign-in button */}
        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setError('')
            setLoading(true)
            const { error: err } = await signInWithGoogle()
            if (err) { setError(err.message); setLoading(false) }
            // On success: Supabase redirects to /dashboard; loading stays true
          }}
          style={{
            width: '100%', padding: '15px',
            background: loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '14px', color: '#fff', fontSize: '14px', fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
            transition: 'all 0.2s', opacity: loading ? 0.7 : 1,
            letterSpacing: '0.03em',
          }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.24)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
        >
          {loading ? (
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
              <path d="M47.532 24.552c0-1.636-.148-3.2-.422-4.704H24.48v8.898h12.954c-.558 3.006-2.25 5.556-4.794 7.272v6.042h7.764c4.542-4.182 7.128-10.344 7.128-17.508z" fill="#4285F4"/>
              <path d="M24.48 48c6.492 0 11.934-2.148 15.912-5.832l-7.764-6.042c-2.154 1.44-4.908 2.292-8.148 2.292-6.264 0-11.574-4.23-13.476-9.918H2.958v6.234C6.918 42.954 15.108 48 24.48 48z" fill="#34A853"/>
              <path d="M11.004 28.5A14.42 14.42 0 0 1 10.26 24c0-1.566.27-3.084.744-4.5v-6.234H2.958A23.964 23.964 0 0 0 .48 24c0 3.864.924 7.524 2.478 10.734L11.004 28.5z" fill="#FBBC05"/>
              <path d="M24.48 9.582c3.528 0 6.696 1.212 9.192 3.594l6.888-6.888C36.408 2.394 30.972 0 24.48 0 15.108 0 6.918 5.046 2.958 13.266l8.046 6.234C12.906 13.812 18.216 9.582 24.48 9.582z" fill="#EA4335"/>
            </svg>
          )}
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        {/* Footer note */}
        <div style={{
          marginTop: '24px', textAlign: 'center',
          fontSize: '12px', color: '#333', fontWeight: 500, lineHeight: 1.6,
        }}>
          By signing in you confirm you are an authorized user.
          <br />Unauthorized access attempts are logged.
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
