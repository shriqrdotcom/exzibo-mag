import React, { createContext, useContext, useEffect, useState } from 'react'
import { IS_PREVIEW } from '../lib/env'
import { verifyPreviewSession, clearPreviewSession } from '../lib/previewAuth'
import { authClient } from '../lib/auth-client'
import { ACTIVE_SUBDOMAIN } from '../lib/subdomain'
import { setCurrentAuthUser } from '../lib/current-user'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null)
  const [loading, setLoading]           = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [deniedEmail, setDeniedEmail]   = useState(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
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
        const result = await authClient.getSession()
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
        // ⚠️ FAIL CLOSED — if the check fails or returns an unexpected response,
        // superadmin access is DENIED. A network/server error must never grant access.
        if (ACTIVE_SUBDOMAIN === 'superadmin') {
          try {
            const r = await fetch('/api/auth-check?type=superadmin', { credentials: 'include' })
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
            // Fail closed: network error, timeout, malformed response, HTTP 500 —
            // none of these may grant superadmin access.
            console.warn('[auth] Superadmin check failed — access denied:', e.message)
            if (mounted) {
              setCurrentAuthUser(null)
              setUser(null)
              setIsSuperAdmin(false)
              setAccessDenied(true)
              setDeniedEmail(email)
              setLoading(false)
            }
            return
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
    if (IS_PREVIEW) return { data: null, error: { message: 'Google sign-in is not available in preview mode.' } }

    setAccessDenied(false)
    setDeniedEmail(null)
    try {
      // better-auth client returns { data, error } — it does NOT throw on failure.
      // Always destructure the result; never assume success from absence of an exception.
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: `${window.location.origin}/`,
      })
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
      isDisableAuth: false,

      // DEPRECATED — keep for callers that still read it; always false now.
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
