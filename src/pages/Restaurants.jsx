import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Utensils, MapPin, Star, ExternalLink, Settings, Globe } from 'lucide-react'

export default function Restaurants() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    setRestaurants(saved)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(232,50,26,0.08) 0%, #0A0A0A 55%)',
      color: '#fff',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 48px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'none', border: 'none', color: '#888',
            cursor: 'pointer', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = '#888'}
        >
          <ArrowLeft size={15} /> BACK
        </button>

        <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.05em' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>

        <button
          onClick={() => navigate('/create-website')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 22px',
            background: '#E8321A', border: 'none', borderRadius: '50px',
            color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
            cursor: 'pointer', boxShadow: '0 0 20px rgba(232,50,26,0.4)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 35px rgba(232,50,26,0.6)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.4)'}
        >
          <Plus size={14} /> ADD RESTAURANT
        </button>
      </nav>

      <div style={{ padding: '60px 48px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '52px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em',
            color: '#E8321A', textTransform: 'uppercase', marginBottom: '14px',
          }}>
            My Restaurants
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, lineHeight: 1.05, marginBottom: '14px' }}>
            YOUR CULINARY<br />
            <span style={{ color: '#E8321A', textShadow: '0 0 40px rgba(232,50,26,0.35)' }}>PORTFOLIO</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#555', maxWidth: '420px', lineHeight: 1.7 }}>
            Each restaurant you create gets its own live customer page. Click "Customer Page" to preview it instantly.
          </p>
        </div>

        {restaurants.length === 0 ? (
          <EmptyState onAdd={() => navigate('/create-website')} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}>
            {restaurants.map(r => (
              <RestaurantCard key={r.id} restaurant={r} onAdmin={() => navigate(`/manage/${r.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RestaurantCard({ restaurant, onAdmin }) {
  const slug = restaurant.slug || restaurant.id
  const initials = restaurant.name
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const isActive = restaurant.status === 'active'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '20px',
      overflow: 'hidden',
      transition: 'border-color 0.25s, box-shadow 0.25s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(232,50,26,0.3)'
        e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Card header with restaurant image or gradient */}
      <div style={{
        height: '120px',
        background: restaurant.images?.[0]
          ? `url(${restaurant.images[0]}) center/cover no-repeat`
          : 'linear-gradient(135deg, rgba(232,50,26,0.15) 0%, rgba(10,10,10,0.8) 100%)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.7))',
        }} />
        {/* Status badge */}
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          display: 'flex', alignItems: 'center', gap: '5px',
          background: isActive ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)',
          border: isActive ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,255,255,0.12)',
          borderRadius: '20px', padding: '4px 10px',
        }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: isActive ? '#4ade80' : '#555',
            boxShadow: isActive ? '0 0 6px rgba(74,222,128,0.8)' : 'none',
          }} />
          <span style={{ fontSize: '10px', fontWeight: 700, color: isActive ? '#4ade80' : '#666', letterSpacing: '0.06em' }}>
            {isActive ? 'LIVE' : 'PAUSED'}
          </span>
        </div>
        {/* Initials avatar */}
        <div style={{
          position: 'absolute', bottom: '-24px', left: '20px',
          width: '48px', height: '48px', borderRadius: '14px',
          background: '#E8321A', border: '3px solid #0A0A0A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: 900, color: '#fff',
          boxShadow: '0 4px 16px rgba(232,50,26,0.5)',
        }}>
          {initials}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '32px 20px 20px' }}>
        <div style={{ marginBottom: '6px', fontSize: '17px', fontWeight: 800, letterSpacing: '0.01em' }}>
          {restaurant.name}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          {restaurant.location && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#666' }}>
              <MapPin size={11} /> {restaurant.location}
            </span>
          )}
          {restaurant.rating && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#FFB800' }}>
              <Star size={11} fill="#FFB800" /> {restaurant.rating}
            </span>
          )}
          {restaurant.tables && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#666' }}>
              <Utensils size={11} /> {restaurant.tables} tables
            </span>
          )}
        </div>

        {restaurant.description && (
          <p style={{ fontSize: '12px', color: '#555', lineHeight: 1.6, marginBottom: '18px' }}>
            {restaurant.description.slice(0, 90)}{restaurant.description.length > 90 ? '…' : ''}
          </p>
        )}

        {/* URL preview */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px', padding: '7px 10px', marginBottom: '16px',
        }}>
          <Globe size={11} color="#444" />
          <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>
            /restaurant/{slug}
          </span>
        </div>

        {/* TWO ACTION BUTTONS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <a
            href={`/restaurant/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              background: '#E8321A', border: 'none', borderRadius: '12px',
              padding: '12px 8px', color: '#fff', fontSize: '12px', fontWeight: 700,
              textDecoration: 'none', letterSpacing: '0.04em',
              boxShadow: '0 4px 14px rgba(232,50,26,0.35)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ff4d35'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#E8321A'; e.currentTarget.style.transform = 'none' }}
          >
            <ExternalLink size={13} />
            Customer Page
          </a>

          <button
            onClick={onAdmin}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', padding: '12px 8px', color: '#ccc',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#ccc' }}
          >
            <Settings size={13} />
            Admin Page
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '100px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: '80px', height: '80px', borderRadius: '24px',
        background: 'rgba(232,50,26,0.08)', border: '2px dashed rgba(232,50,26,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '28px', color: 'rgba(232,50,26,0.4)',
      }}>
        <Utensils size={32} />
      </div>
      <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px' }}>No Restaurants Yet</div>
      <p style={{ fontSize: '13px', color: '#555', maxWidth: '320px', lineHeight: 1.7, marginBottom: '36px' }}>
        Create your first restaurant and it will get its own live customer page instantly — just fill the form and you're done.
      </p>
      <button
        onClick={onAdd}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '14px 32px', background: '#E8321A', border: 'none',
          borderRadius: '50px', color: '#fff', fontSize: '13px', fontWeight: 700,
          letterSpacing: '0.08em', cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(232,50,26,0.4)',
        }}
      >
        <Plus size={14} /> CREATE FIRST RESTAURANT
      </button>
    </div>
  )
}
