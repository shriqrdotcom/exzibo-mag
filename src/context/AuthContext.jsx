import React, { createContext, useContext, useEffect, useState } from 'react'
import { IS_PREVIEW, DISABLE_AUTH } from '../lib/env'
import { verifyPreviewSession, clearPreviewSession } from '../lib/previewAuth'
import { authClient } from '../lib/auth-client'
import { ACTIVE_SUBDOMAIN } from '../lib/subdomain'
import { setCurrentAuthUser } from '../lib/current-user'

// ── Mock user injected when DISABLE_AUTH=true ─────────────────────────────────
// Used only in dev. Never reaches production.
const MOCK_USER = {
  id:            '00000000-0000-4000-8000-000000000001',
  email:         'exzibonew@gmail.com',
  isPreviewUser: true,
  isDisableAuth: true,
}

const AuthContext = createContext(null)
const AUTH_REQUEST_TIMEOUT_MS = 8000

function withAuthTimeout(promise, message = 'Authentication is taking too long. Please try again.') {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), AUTH_REQUEST_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null)
  const [loading, setLoading]           = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [deniedEmail, setDeniedEmail]   = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    // ── DISABLE_AUTH mode ─────────────────────────────────────────────────
    if (DISABLE_AUTH) {
      console.warn(
        '[auth] DISABLE_AUTH is active — authentication is bypassed. ' +
        'This should NEVER appear in production.'
      )
      setCurrentAuthUser(MOCK_USER)
      setUser(MOCK_USER)
      setIsSuperAdmin(true)
      setLoading(false)
      return
    }

    // ── Preview mode — bypass Better Auth, use local session token ────────
    if (IS_PREVIEW) {
      verifyPreviewSession().then(previewUser => {
        setCurrentAuthUser(previewUser)
        setUser(previewUser)
        setLoading(false)
      })
      return
    }

    // ── Production mode — Better Auth ─────────────────────────────────────
    let mounted = true

    async function initSession() {
      try {
        const result = await withAuthTimeout(authClient.getSession())
        if (!mounted) return

        const sessionUser = result?.data?.user ?? null

        if (!sessionUser) {
          setCurrentAuthUser(null)
          setUser(null)
          setIsSuperAdmin(false)
          setLoading(false)
          return
        }

        const email = (sessionUser.email || '').toLowerCase().trim()
        console.log('[auth] Signed in as:', email)

        // On superadmin subdomain: verify against SUPERADMIN_ALLOWED_EMAILS
        if (ACTIVE_SUBDOMAIN === 'superadmin') {
          try {
            const r = await withAuthTimeout(
              fetch('/api/auth-check?type=superadmin', { credentials: 'include' }),
              'The authorization check timed out. Please try again.',
            )
            const data = await r.json()
            if (!data.allowed) {
              console.warn('[auth] Superadmin access denied for:', email)
              await authClient.signOut()
              if (mounted) {
                setCurrentAuthUser(null)
                setUser(null)
                setAccessDenied(true)
                setDeniedEmail(email)
                setLoading(false)
              }
              return
            }
          } catch (e) {
            console.warn('[auth] Superadmin check failed:', e.message)
          }

          if (mounted) {
            setCurrentAuthUser(sessionUser)
            setUser(sessionUser)
            setIsSuperAdmin(true)
            setAccessDenied(false)
            setDeniedEmail(null)
            setLoading(false)
          }
          return
        }

        // On dashboard subdomain: session is valid; per-restaurant access
        // check happens in RestaurantDashboard when the restaurant is known.
        if (mounted) {
          setCurrentAuthUser(sessionUser)
          setUser(sessionUser)
          setIsSuperAdmin(false)
          setAccessDenied(false)
          setLoading(false)
        }
      } catch (e) {
        console.error('[auth] Session init error:', e)
        if (mounted) {
          setCurrentAuthUser(null)
          setUser(null)
          setLoading(false)
        }
      }
    }

    initSession()

    // Refresh session on tab focus (keeps session alive across tabs)
    const onFocus = () => initSession()
    window.addEventListener('focus', onFocus)

    return () => {
      mounted = false
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  async function signInWithGoogle() {
    if (DISABLE_AUTH) return { data: null, error: { message: 'Auth is disabled in this environment.' } }
    if (IS_PREVIEW)   return { data: null, error: { message: 'Google sign-in is not available in preview mode.' } }

    setAccessDenied(false)
    setDeniedEmail(null)
    try {
      // better-auth client returns { data, error } — it does NOT throw on failure.
      // Always destructure the result; never assume success from absence of an exception.
      const result = await withAuthTimeout(
        authClient.signIn.social({
          provider: 'google',
          callbackURL: `${window.location.origin}/`,
        }),
        'Google sign-in is taking too long. Please try again.',
      )
      if (result?.error) {
        const msg = result.error.message || result.error.statusText || 'Sign-in failed. Please try again.'
        return { data: null, error: { message: msg } }
      }
      // Success: browser is being redirected to Google. Caller keeps loading=true.
      return { data: {}, error: null }
    } catch (e) {
      return { data: null, error: { message: e.message || 'Sign-in failed. Please try again.' } }
    }
  }

  async function signOut() {
    if (DISABLE_AUTH) {
      setCurrentAuthUser(MOCK_USER)
      setUser(MOCK_USER)
      return
    }
    if (IS_PREVIEW) {
      clearPreviewSession()
      setCurrentAuthUser(null)
      setUser(null)
      return
    }
    setAccessDenied(false)
    setDeniedEmail(null)
    try { await authClient.signOut() } catch {}
    setCurrentAuthUser(null)
    setUser(null)
    setIsSuperAdmin(false)
  }

  function setPreviewUser(previewUser) {
    setCurrentAuthUser(previewUser)
    setUser(previewUser)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, accessDenied, deniedEmail, isSuperAdmin,
      signOut, signInWithGoogle, setPreviewUser,
      isPreview: IS_PREVIEW,
      isDisableAuth: DISABLE_AUTH,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
