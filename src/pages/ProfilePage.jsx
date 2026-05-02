import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ProfileSlide from '../components/ProfileSlide'

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

function loadLogoUrl(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    return localStorage.getItem('exzibo_logo_default') || ''
  }
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    return all.find(r => r.id === restaurantId)?.logo || ''
  } catch { return '' }
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const restaurantId = id || 'default'
  const isMasterView = searchParams.get('from') === 'master'

  const [restaurantName, setRestaurantName] = useState(() => loadRestaurantName(restaurantId))
  const [logoUrl, setLogoUrl] = useState(() => loadLogoUrl(restaurantId))

  useEffect(() => {
    setRestaurantName(loadRestaurantName(restaurantId))
    setLogoUrl(loadLogoUrl(restaurantId))
  }, [restaurantId])

  function handleTeamClick() {
    navigate(`/admin/${id || 'default'}/team`)
  }

  return (
    /* Desktop backdrop — neutral gray so the phone frame pops */
    <div style={{
      minHeight: '100dvh',
      background: '#EAF1FD',
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
            {/* Back arrow */}
            <button
              onClick={() => navigate(-1)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.06)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              aria-label="Go back"
            >
              <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
                <polyline points="8 1 1 8 8 15" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

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
          <button style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', gap: '4px',
            padding: '4px', alignItems: 'center', justifyContent: 'center',
          }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#444' }} />
            ))}
          </button>
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
    </div>
  )
}
