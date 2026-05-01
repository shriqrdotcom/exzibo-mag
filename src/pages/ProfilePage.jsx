import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  const restaurantId = id || 'default'

  const [restaurantName, setRestaurantName] = useState(() => loadRestaurantName(restaurantId))
  const [logoUrl, setLogoUrl] = useState(() => loadLogoUrl(restaurantId))

  useEffect(() => {
    setRestaurantName(loadRestaurantName(restaurantId))
    setLogoUrl(loadLogoUrl(restaurantId))
  }, [restaurantId])

  function handleTeamClick() {
    if (id && id !== 'default') {
      navigate(`/admin/${id}/team`)
    }
  }

  return (
    /* Desktop backdrop — neutral gray so the phone frame pops */
    <div style={{
      minHeight: '100dvh',
      background: '#E5E5EA',
      display: 'flex',
      justifyContent: 'center',
      fontFamily: MOBILE_FONT,
    }}>
      {/* Phone-sized container */}
      <div style={{
        width: '100%',
        maxWidth: '390px',
        minHeight: '100dvh',
        background: '#F2F2F7',
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
          background: '#F2F2F7',
          padding: '16px 20px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          flexShrink: 0,
          borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}>
          {/* Back arrow in gray circle */}
          <button
            onClick={() => navigate(-1)}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: '#E5E5EA',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            aria-label="Go back"
          >
            <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
              <polyline points="9 1 1 9 9 17" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Title — left-aligned next to the arrow */}
          <span style={{
            fontWeight: 800,
            fontSize: '22px',
            color: '#111',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>
            Profile
          </span>
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
            onTeamClick={id && id !== 'default' ? handleTeamClick : undefined}
          />
        </div>
      </div>
    </div>
  )
}
