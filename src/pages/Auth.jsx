import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'

export default function Auth() {
  const navigate          = useNavigate()
  const { signIn, signUp, signInWithGoogle } = useAuth()

  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) {
        setError(error.message)
      } else {
        navigate('/dashboard')
      }
    } else {
      const { error } = await signUp(email, password)
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Account created! Check your email to confirm, then sign in.')
        setMode('login')
      }
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(232,50,26,0.18) 0%, #0A0A0A 60%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: '24px',
    }}>

      {/* Logo */}
      <div
        onClick={() => navigate('/')}
        style={{ fontWeight: 900, fontSize: '26px', letterSpacing: '0.04em', color: '#fff', marginBottom: '40px', cursor: 'pointer' }}
      >
        EXZI<span style={{ color: '#E8321A' }}>BO</span>
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '24px',
        padding: '36px 32px',
        backdropFilter: 'blur(20px)',
      }}>

        {/* Heading */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontWeight: 800, fontSize: '22px', color: '#fff', letterSpacing: '-0.02em', marginBottom: '6px' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </div>
          <div style={{ fontSize: '13px', color: '#666', fontWeight: 500 }}>
            {mode === 'login'
              ? 'Sign in to your Exzibo dashboard'
              : 'Start managing your restaurant today'}
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 14px', borderRadius: '12px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            marginBottom: '20px',
          }}>
            <AlertCircle size={15} color="#EF4444" />
            <span style={{ fontSize: '13px', color: '#EF4444', fontWeight: 500 }}>{error}</span>
          </div>
        )}
        {success && (
          <div style={{
            padding: '12px 14px', borderRadius: '12px',
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
            marginBottom: '20px',
            fontSize: '13px', color: '#22C55E', fontWeight: 500,
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '0.08em', marginBottom: '8px' }}>
              EMAIL ADDRESS
            </label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', padding: '0 14px',
              transition: 'border-color 0.15s',
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'rgba(232,50,26,0.5)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
            >
              <Mail size={15} color="#555" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={{
                  flex: 1, padding: '13px 0', background: 'transparent', border: 'none',
                  outline: 'none', color: '#fff', fontSize: '14px', fontWeight: 500,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '0.08em', marginBottom: '8px' }}>
              PASSWORD
            </label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', padding: '0 14px',
              transition: 'border-color 0.15s',
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = 'rgba(232,50,26,0.5)'}
              onBlurCapture={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
            >
              <Lock size={15} color="#555" />
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'login' ? 'Your password' : 'Min 6 characters'}
                minLength={6}
                style={{
                  flex: 1, padding: '13px 0', background: 'transparent', border: 'none',
                  outline: 'none', color: '#fff', fontSize: '14px', fontWeight: 500,
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', display: 'flex', padding: '2px' }}
              >
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              background: loading ? 'rgba(232,50,26,0.5)' : '#E8321A',
              border: 'none', borderRadius: '12px',
              color: '#fff', fontSize: '14px', fontWeight: 800,
              letterSpacing: '0.06em', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: loading ? 'none' : '0 0 24px rgba(232,50,26,0.35)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 0 36px rgba(232,50,26,0.55)' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = '0 0 24px rgba(232,50,26,0.35)' }}
          >
            {loading
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {mode === 'login' ? 'SIGNING IN…' : 'CREATING…'}</>
              : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'
            }
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: '11px', color: '#444', fontWeight: 600, letterSpacing: '0.06em' }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Google Sign In */}
        <button
          type="button"
          onClick={async () => {
            setError('')
            setLoading(true)
            const { error } = await signInWithGoogle()
            if (error) { setError(error.message); setLoading(false) }
          }}
          disabled={loading}
          style={{
            width: '100%', padding: '13px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            color: '#fff', fontSize: '14px', fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <path d="M47.532 24.552c0-1.636-.148-3.2-.422-4.704H24.48v8.898h12.954c-.558 3.006-2.25 5.556-4.794 7.272v6.042h7.764c4.542-4.182 7.128-10.344 7.128-17.508z" fill="#4285F4"/>
            <path d="M24.48 48c6.492 0 11.934-2.148 15.912-5.832l-7.764-6.042c-2.154 1.44-4.908 2.292-8.148 2.292-6.264 0-11.574-4.23-13.476-9.918H2.958v6.234C6.918 42.954 15.108 48 24.48 48z" fill="#34A853"/>
            <path d="M11.004 28.5A14.42 14.42 0 0 1 10.26 24c0-1.566.27-3.084.744-4.5v-6.234H2.958A23.964 23.964 0 0 0 .48 24c0 3.864.924 7.524 2.478 10.734L11.004 28.5z" fill="#FBBC05"/>
            <path d="M24.48 9.582c3.528 0 6.696 1.212 9.192 3.594l6.888-6.888C36.408 2.394 30.972 0 24.48 0 15.108 0 6.918 5.046 2.958 13.266l8.046 6.234C12.906 13.812 18.216 9.582 24.48 9.582z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Toggle mode */}
        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#555' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
            style={{ background: 'none', border: 'none', color: '#E8321A', fontWeight: 700, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
