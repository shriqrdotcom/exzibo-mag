import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ProfileSlide from '../components/ProfileSlide'
import HelpBottomSheet from '../components/HelpBottomSheet'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../context/RoleContext'
import { getRestaurantById } from '../lib/db'

const MOBILE_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"

function loadRestaurantName(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    try {
      const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
      return config.adminTitle || localStorage.getItem('exzibo_name_default') || 'Exzibo Admin'
    } catch { return 'Exzibo Admin' }
  }
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    return all.find(r => r.id === restaurantId)?.name || 'Restaurant'
  } catch { return 'Restaurant' }
}

function loadRestaurantUid(restaurantId) {
  if (!restaurantId || restaurantId === 'default') return null
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    return all.find(r => r.id === restaurantId)?.uid || null
  } catch { return null }
}

function loadLogoUrl(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    return localStorage.getItem('exzibo_logo_default') || ''
  }
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    return all.find(r => r.id === restaurantId)?.logo || ''
  } catch { return '' }
}

export default function ProfilePage({ restaurantId: propRestaurantId } = {}) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const restaurantId = propRestaurantId || id || 'default'
  const isMasterView = searchParams.get('from') === 'master'

  const { isSuperAdmin } = useAuth()
  const { activeRole } = useRole()
  const urlRole = searchParams.get('role')
  const [restaurantName, setRestaurantName] = useState(() => loadRestaurantName(restaurantId))
  const [restaurantUid, setRestaurantUid]   = useState(() => loadRestaurantUid(restaurantId))
  const [logoUrl, setLogoUrl] = useState(() => loadLogoUrl(restaurantId))
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  function resolveUserRole() {
    const role = urlRole || activeRole
    if (isSuperAdmin && !role) return 'Super Admin'
    if (role === 'admin') return 'Admin'
    if (role === 'staff')   return 'Employee'
    if (role === 'owner')   return 'Admin'
    if (isMasterView)       return 'Admin'
    return 'Admin'
  }
  const userRole = resolveUserRole()

  useEffect(() => {
    setRestaurantName(loadRestaurantName(restaurantId))
    setRestaurantUid(loadRestaurantUid(restaurantId))
    setLogoUrl(loadLogoUrl(restaurantId))

    // Fetch fresh data from Supabase for real restaurants so first-visit
    // always shows the correct name and logo (not just what's in localStorage).
    if (!restaurantId || restaurantId === 'default') return
    let cancelled = false
    getRestaurantById(restaurantId)
      .then(r => {
        if (cancelled || !r) return
        if (r.name) setRestaurantName(r.name)
        if (r.uid)  setRestaurantUid(r.uid)
        if (r.logo) setLogoUrl(r.logo)
        // Sync back into localStorage so subsequent loads are instant
        try {
          const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
          const updated = all.some(x => x.id === r.id)
            ? all.map(x => x.id === r.id ? { ...x, name: r.name, logo: r.logo, uid: r.uid } : x)
            : [...all, r]
          localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
        } catch { /* noop */ }
      })
      .catch(() => { /* silently fall back to localStorage data */ })
    return () => { cancelled = true }
  }, [restaurantId])

  function handleTeamClick() {
    navigate(`/admin/${id || 'default'}/team`)
  }

  function handlePrivacyPolicy() {
    setMenuOpen(false)
  }

  function handleHelp() {
    setMenuOpen(false)
    setHelpOpen(true)
  }

  return (
    /* Desktop backdrop — neutral gray so the phone frame pops */
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(to bottom, #EAF1FD 134px, #ffffff 134px)',
      display: 'flex',
      justifyContent: 'center',
      fontFamily: MOBILE_FONT,
    }}>
      {/* Phone-sized container */}
      <div style={{
        width: '100%',
        maxWidth: '390px',
        minHeight: '100dvh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflowX: 'hidden',
      }}>

        {/* ── Sticky mobile header ── */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#EAF1FD',
          padding: '16px 20px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Title */}
            <span style={{
              fontWeight: 800,
              fontSize: '20px',
              color: '#111',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}>
              PROFILE
            </span>
          </div>

          {/* 3-dot menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(prev => !prev)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '4px',
                padding: '4px', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {[0,1,2].map(i => (
                <div key={i} style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#444' }} />
              ))}
            </button>

            {/* Dropdown card */}
            {menuOpen && (
              <>
                {/* Backdrop to close on outside tap */}
                <div
                  onClick={() => setMenuOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                />
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  zIndex: 100,
                  background: '#fff',
                  borderRadius: '16px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                  minWidth: '190px',
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={handlePrivacyPolicy}
                    style={{
                      width: '100%', padding: '16px 20px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontWeight: 800, fontSize: '13px',
                      color: '#111', letterSpacing: '0.05em',
                      fontFamily: MOBILE_FONT,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    PRIVACY POLICY
                  </button>
                  <div style={{ height: '1px', background: '#F0F0F5', margin: '0 16px' }} />
                  <button
                    onClick={handleHelp}
                    style={{
                      width: '100%', padding: '16px 20px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontWeight: 800, fontSize: '13px',
                      color: '#111', letterSpacing: '0.05em',
                      fontFamily: MOBILE_FONT,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    HELP
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <ProfileSlide
            asPage
            restaurantId={restaurantId}
            logoUrl={logoUrl}
            onLogoUpdate={url => setLogoUrl(url)}
            restaurantName={restaurantName}
            onNameUpdate={name => setRestaurantName(name)}
            onTeamClick={handleTeamClick}
            isMasterView={isMasterView}
          />
        </div>
      </div>

      {/* ── Help bottom sheet ── */}
      <HelpBottomSheet
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        restaurantName={restaurantName}
        restaurantUid={restaurantUid}
        userRole={userRole}
      />
    </div>
  )
}
