import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IS_PREVIEW } from '../lib/env'
import { verifyPreviewSession, clearPreviewSession } from '../lib/previewAuth'

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

    // Called for every session Supabase produces.
    // Queries `allowed_users` directly (no RPC dependency).
    // The "users_read_own" RLS policy on that table ensures only the row
    // matching the signed-in user's email is returned — so a non-empty
    // result means access is granted.
    async function validateAndSetUser(session) {
      if (!session?.user) {
        if (mounted) { setUser(null); setLoading(false) }
        return
      }

      try {
        // Direct table query — works as long as the RLS policy
        // "users_read_own" exists:
        //   CREATE POLICY "users_read_own" ON public.allowed_users FOR SELECT
        //   USING (lower(trim(email)) = lower(trim(auth.email())));
        const { data, error } = await supabase
          .from('allowed_users')
          .select('role, is_active')
          .eq('is_active', true)
          .maybeSingle()

        if (!mounted) return

        if (error || !data) {
          // Not in allowlist — sign out
          console.warn('[auth] Access denied:', error?.message ?? 'email not in allowed_users')
          try { await supabase.auth.signOut() } catch {}
          if (mounted) {
            setUser(null)
            setAccessDenied(true)
            setLoading(false)
          }
        } else {
          if (mounted) {
            setUser(session.user)
            setIsSuperAdmin(data.role === 'super_admin')
            setAccessDenied(false)
            setLoading(false)
          }
          // Auto-link this user to any team_members row matching their email.
          supabase.rpc('link_team_member_on_login').catch(e =>
            console.warn('[auth] link_team_member_on_login failed:', e.message)
          )
        }
      } catch (e) {
        console.error('[auth] Auth check error:', e)
        if (!mounted) return
        // Show access denied so the user knows something went wrong
        // (rather than silently bouncing back to the login screen).
        setUser(null)
        setAccessDenied(true)
        setLoading(false)
      }
    }

    // Single source of truth — INITIAL_SESSION fires on mount after Supabase
    // has fully processed any OAuth tokens in the URL, eliminating race
    // conditions. SIGNED_IN fires on new logins. TOKEN_REFRESHED re-validates
    // on every refresh cycle. SIGNED_OUT clears all state.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
