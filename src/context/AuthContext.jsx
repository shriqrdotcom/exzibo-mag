import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IS_PREVIEW } from '../lib/env'
import { verifyPreviewSession, clearPreviewSession } from '../lib/previewAuth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]                   = useState(null)
  const [loading, setLoading]             = useState(true)
  const [accessDenied, setAccessDenied]   = useState(false)
  const [isSuperAdmin, setIsSuperAdmin]   = useState(false)

  useEffect(() => {
    // ── Preview mode — bypass Supabase entirely ───────────────────────────
    if (IS_PREVIEW) {
      verifyPreviewSession().then(previewUser => {
        setUser(previewUser)
        setLoading(false)
      })
      return
    }

    // ── Production mode ───────────────────────────────────────────────────
    let mounted = true

    // Called for every session that Supabase produces.
    // Validates the user against the server-side allowlist RPC before
    // granting access. If the user is not in the list they are signed out
    // immediately and never reach any protected route.
    async function validateAndSetUser(session) {
      if (!session?.user) {
        if (mounted) { setUser(null); setLoading(false) }
        return
      }

      try {
        const { data, error } = await supabase.rpc('is_user_allowed')
        if (!mounted) return

        if (error || !data) {
          // Not in allowlist — destroy the session on the server immediately
          try { await supabase.auth.signOut() } catch {}
          if (mounted) {
            setUser(null)
            setAccessDenied(true)
            setLoading(false)
          }
        } else {
          if (mounted) {
            setUser(session.user)
            setAccessDenied(false)
            setLoading(false)
          }
          // Check super-admin status — used by MasterControl and any component
          // that needs to distinguish the two master accounts from regular admins.
          supabase.rpc('is_super_admin').then(({ data }) => {
            if (mounted) setIsSuperAdmin(!!data)
          }).catch(() => {})
          // Auto-link this user's auth.uid() to any team_members row that
          // matches their email address. This fires once per login and is what
          // lets a newly-invited Gmail account immediately see the restaurant
          // they were added to — no manual UID copying required.
          supabase.rpc('link_team_member_on_login').catch(e =>
            console.warn('[auth] link_team_member_on_login failed:', e.message)
          )
        }
      } catch (e) {
        console.warn('[auth] Allowlist check failed:', e.message)
        if (!mounted) return
        // On network error, deny access (fail closed)
        try { await supabase.auth.signOut() } catch {}
        setUser(null)
        setLoading(false)
      }
    }

    // Check any pre-existing session on mount (handles page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      validateAndSetUser(session)
    })

    // Listen for auth state changes:
    //   SIGNED_IN       — new OAuth login or session restore
    //   TOKEN_REFRESHED — re-validate on every token refresh (catches removed users)
    //   SIGNED_OUT      — clear state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        validateAndSetUser(session)
      } else if (event === 'SIGNED_OUT') {
        if (mounted) { setUser(null); setAccessDenied(false); setLoading(false) }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithGoogle() {
    if (IS_PREVIEW) return { data: null, error: { message: 'Google sign-in is not available in preview mode.' } }
    setAccessDenied(false)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    return { data, error }
  }

  async function signOut() {
    if (IS_PREVIEW) {
      clearPreviewSession()
      setUser(null)
      return
    }
    setAccessDenied(false)
    await supabase.auth.signOut()
  }

  function setPreviewUser(previewUser) {
    setUser(previewUser)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, accessDenied, isSuperAdmin,
      signOut, signInWithGoogle, setPreviewUser,
      isPreview: IS_PREVIEW,
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
