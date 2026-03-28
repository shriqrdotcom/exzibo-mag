import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Utensils, Users, LayoutGrid, ChevronRight } from 'lucide-react'

export default function Restaurants() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    setRestaurants(saved)
  }, [])

  const toggleStatus = (id) => {
    const updated = restaurants.map(r =>
      r.id === id ? { ...r, status: r.status === 'active' ? 'paused' : 'active' } : r
    )
    setRestaurants(updated)
    localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
  }

  const active = restaurants.filter(r => r.status === 'active')
  const paused = restaurants.filter(r => r.status === 'paused')
  const drafts = restaurants.filter(r => r.status === 'draft')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(232,50,26,0.08) 0%, #0A0A0A 55%)',
      color: '#fff',
      fontFamily: 'inherit',
    }}>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 48px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'none', border: 'none', color: '#888',
            cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = '#888'}
        >
          <ArrowLeft size={15} />
          BACK
        </button>

        <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.05em' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>

        <button
          onClick={() => navigate('/create-website')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px',
            background: '#E8321A',
            border: '2px solid #E8321A',
            borderRadius: '50px',
            color: '#fff',
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
            cursor: 'pointer',
            boxShadow: '0 0 20px rgba(232,50,26,0.35)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 35px rgba(232,50,26,0.55)' }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.35)' }}
        >
          <Plus size={14} />
          ADD RESTAURANT
        </button>
      </nav>

      <div style={{ padding: '60px 48px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ marginBottom: '52px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em',
            color: '#E8321A', textTransform: 'uppercase', marginBottom: '14px',
          }}>
            My Restaurants
          </div>
          <h1 style={{
            fontSize: 'clamp(32px, 4vw, 52px)',
            fontWeight: 900, lineHeight: 1.05,
            marginBottom: '14px',
          }}>
            YOUR CULINARY<br />
            <span style={{ color: '#E8321A', textShadow: '0 0 40px rgba(232,50,26,0.35)' }}>PORTFOLIO</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#555', maxWidth: '400px', lineHeight: 1.7 }}>
            Manage all your restaurant properties from one place. Click on any establishment to open its full management panel.
          </p>
        </div>

        {restaurants.length === 0 ? (
          <EmptyState onAdd={() => navigate('/create-website')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
            {active.length > 0 && (
              <Section title="ACTIVE" count={active.length}>
                {active.map(r => (
                  <RestaurantCard key={r.id} restaurant={r} onClick={() => navigate(`/restaurant/${r.id}`)} onToggle={() => toggleStatus(r.id)} />
                ))}
              </Section>
            )}
            {paused.length > 0 && (
              <Section title="PAUSED" count={paused.length}>
                {paused.map(r => (
                  <RestaurantCard key={r.id} restaurant={r} onClick={() => navigate(`/restaurant/${r.id}`)} onToggle={() => toggleStatus(r.id)} />
                ))}
              </Section>
            )}
            {drafts.length > 0 && (
              <Section title="DRAFTS" count={drafts.length}>
                {drafts.map(r => (
                  <RestaurantCard key={r.id} restaurant={r} onClick={() => navigate(`/restaurant/${r.id}`)} onToggle={() => toggleStatus(r.id)} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        marginBottom: '20px',
        paddingBottom: '14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{
          fontSize: '10px', fontWeight: 800, letterSpacing: '0.2em',
          color: '#555', textTransform: 'uppercase',
        }}>{title}</span>
        <span style={{
          fontSize: '10px', fontWeight: 700,
          background: 'rgba(232,50,26,0.15)',
          border: '1px solid rgba(232,50,26,0.25)',
          color: '#E8321A',
          borderRadius: '20px',
          padding: '2px 9px',
        }}>{count}</span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '18px',
      }}>
        {children}
      </div>
    </div>
  )
}

function RestaurantCard({ restaurant, onClick, onToggle }) {
  const [hovered, setHovered] = useState(false)
  const isActive = restaurant.status === 'active'

  const initials = restaurant.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? 'rgba(232,50,26,0.06)'
          : 'rgba(255,255,255,0.03)',
        border: hovered
          ? '1px solid rgba(232,50,26,0.3)'
          : '1px solid rgba(255,255,255,0.07)',
        borderRadius: '18px',
        padding: '24px',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        boxShadow: hovered ? '0 0 30px rgba(232,50,26,0.1)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{
          width: '52px', height: '52px',
          borderRadius: '14px',
          background: 'rgba(232,50,26,0.15)',
          border: '1px solid rgba(232,50,26,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', fontWeight: 900, color: '#E8321A',
          letterSpacing: '-0.02em',
        }}>
          {initials}
        </div>
        <ChevronRight
          size={16}
          color={hovered ? '#E8321A' : '#333'}
          style={{ transition: 'color 0.25s, transform 0.25s', transform: hovered ? 'translateX(3px)' : 'none' }}
        />
      </div>

      <div style={{ marginBottom: '6px', fontSize: '16px', fontWeight: 800, letterSpacing: '0.02em' }}>
        {restaurant.name}
      </div>
      <div style={{ fontSize: '12px', color: '#555', marginBottom: '20px' }}>
        {restaurant.owner || 'No owner set'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          <Stat icon={<LayoutGrid size={12} />} label={`${restaurant.tables || '—'} tables`} />
          <Stat icon={<Utensils size={12} />} label="Menu active" />
        </div>

        <div
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: isActive ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
            border: isActive ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: '50px',
            padding: '5px 10px 5px 6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <div style={{
            width: '28px', height: '16px',
            borderRadius: '8px',
            background: isActive ? '#4ade80' : 'rgba(255,255,255,0.12)',
            position: 'relative',
            transition: 'background 0.2s',
            flexShrink: 0,
            boxShadow: isActive ? '0 0 8px rgba(74,222,128,0.4)' : 'none',
          }}>
            <div style={{
              position: 'absolute',
              top: '2px',
              left: isActive ? '14px' : '2px',
              width: '12px', height: '12px',
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>
          <span style={{
            fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.05em',
            color: isActive ? '#4ade80' : '#555',
            transition: 'color 0.2s',
          }}>
            {isActive ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555', fontSize: '11px', fontWeight: 600 }}>
      {icon}
      {label}
    </div>
  )
}

function EmptyState({ onAdd }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '100px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '80px', height: '80px',
        borderRadius: '24px',
        background: 'rgba(232,50,26,0.08)',
        border: '2px dashed rgba(232,50,26,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '28px',
        color: 'rgba(232,50,26,0.4)',
      }}>
        <Utensils size={32} />
      </div>

      <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '10px', letterSpacing: '0.02em' }}>
        No Restaurants Yet
      </div>
      <p style={{ fontSize: '13px', color: '#555', maxWidth: '300px', lineHeight: 1.7, marginBottom: '36px' }}>
        You haven't created any restaurants. Add your first establishment to get started.
      </p>

      <button
        onClick={onAdd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '14px 28px',
          background: hovered ? '#E8321A' : 'transparent',
          border: '2px dashed rgba(232,50,26,0.5)',
          borderRadius: '50px',
          color: '#fff',
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
          cursor: 'pointer',
          transition: 'all 0.25s',
          boxShadow: hovered ? '0 0 25px rgba(232,50,26,0.35)' : 'none',
        }}
      >
        <Plus size={14} />
        CREATE FIRST RESTAURANT
      </button>
    </div>
  )
}
