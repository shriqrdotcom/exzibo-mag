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
          background: 'rgba(242,242,247,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          paddingTop: '48px',
          paddingBottom: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}>
          {/* Back arrow — absolute left */}
          <button
            onClick={() => navigate(-1)}
            style={{
              position: 'absolute',
              left: '16px',
              background: 'none',
              border: 'none',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              color: '#6B46C1',
              gap: '2px',
            }}
            aria-label="Go back"
          >
            <svg width="10" height="17" viewBox="0 0 10 17" fill="none">
              <polyline points="9 1 1 8.5 9 16" stroke="#6B46C1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: '17px', fontWeight: 400, color: '#6B46C1', lineHeight: 1 }}>Back</span>
          </button>

          {/* Centered title */}
          <span style={{
            fontWeight: 600,
            fontSize: '17px',
            color: '#000',
            letterSpacing: '-0.01em',
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
