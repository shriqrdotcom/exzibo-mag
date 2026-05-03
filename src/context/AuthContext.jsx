import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IS_PREVIEW } from '../lib/env'
import { verifyPreviewSession, clearPreviewSession } from '../lib/previewAuth'

// ── Allowed Gmail accounts ────────────────────────────────────────────────────
// Only these two emails can access the system.
// Email check happens CLIENT-SIDE against the session returned by Google/Supabase.
// No database query needed — this is the simplest, most reliable approach.
const ALLOWED_EMAILS = [
  'exzibonew@gmail.com',
  'trisanu07.nandi@gmail.com',
]

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]                 = useState(null)
  const [loading, setLoading]           = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

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

    async function validateAndSetUser(session) {
      // No session → not logged in
      if (!session?.user) {
        if (mounted) { setUser(null); setLoading(false) }
        return
      }

      const email = (session.user.email ?? '').toLowerCase().trim()
      console.log('[auth] Signed in as:', email)

      // Check against the hardcoded allowlist
      if (!ALLOWED_EMAILS.includes(email)) {
        console.warn('[auth] Access denied for:', email)
        try { await supabase.auth.signOut() } catch {}
        if (mounted) {
          setUser(null)
          setAccessDenied(true)
          setLoading(false)
        }
        return
      }

      // Allowed — grant full access
      if (mounted) {
        setUser(session.user)
        setIsSuperAdmin(true) // Both accounts are super admins with identical access
        setAccessDenied(false)
        setLoading(false)
      }

      // Auto-link to any team_members row matching this email (best-effort)
      supabase.rpc('link_team_member_on_login').catch(e =>
        console.warn('[auth] link_team_member_on_login failed:', e.message)
      )
    }

    // Single source of truth — INITIAL_SESSION fires after Supabase finishes
    // processing any OAuth redirect tokens in the URL (no race condition).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth] Event:', event, '| Email:', session?.user?.email ?? 'none')
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN'       ||
        event === 'TOKEN_REFRESHED'
      ) {
        validateAndSetUser(session)
      } else if (event === 'SIGNED_OUT') {
        if (mounted) {
          setUser(null)
          setAccessDenied(false)
          setIsSuperAdmin(false)
          setLoading(false)
        }
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
      options: { redirectTo: `${window.location.origin}/` },
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
