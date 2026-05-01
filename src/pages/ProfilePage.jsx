import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ProfileSlide from '../components/ProfileSlide'

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
    <div style={{
      position: 'fixed', inset: 0,
      background: '#EFEFF4',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
      zIndex: 0,
    }}>
      {/* Full-screen header with back button */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#EFEFF4',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '14px 16px',
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%',
            width: '36px', height: '36px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: '#333', flexShrink: 0,
          }}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <span style={{
          fontWeight: 800, fontSize: '18px', color: '#111',
          letterSpacing: '-0.01em',
        }}>
          Profile
        </span>
      </div>

      {/* Profile content rendered as a page (no modal chrome) */}
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
  )
}
