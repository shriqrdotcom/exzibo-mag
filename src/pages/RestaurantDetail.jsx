import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Utensils, LayoutGrid, BarChart2, Settings, Users, Edit3 } from 'lucide-react'

export default function RestaurantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = saved.find(r => r.id === id)
    if (!found) navigate('/restaurants')
    else setRestaurant(found)
  }, [id])

  if (!restaurant) return null

  const initials = restaurant.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(232,50,26,0.08) 0%, #0A0A0A 55%)',
      color: '#fff',
    }}>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 48px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <button
          onClick={() => navigate('/restaurants')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'none', border: 'none', color: '#888',
            cursor: 'pointer', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = '#888'}
        >
          <ArrowLeft size={15} />
          MY RESTAURANTS
        </button>

        <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.05em' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>

        <div style={{ width: '120px' }} />
      </nav>

      <div style={{ padding: '60px 48px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '60px',
        }}>
          <div style={{
            width: '72px', height: '72px',
            borderRadius: '20px',
            background: 'rgba(232,50,26,0.15)',
            border: '1px solid rgba(232,50,26,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', fontWeight: 900, color: '#E8321A',
          }}>
            {initials}
          </div>
          <div>
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em',
              color: '#E8321A', textTransform: 'uppercase', marginBottom: '6px',
            }}>
              Restaurant
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, lineHeight: 1.05, marginBottom: '6px' }}>
              {restaurant.name}
            </h1>
            <div style={{ fontSize: '13px', color: '#555' }}>
              {restaurant.owner ? `Owned by ${restaurant.owner}` : 'No owner set'}&nbsp;&nbsp;·&nbsp;&nbsp;
              {restaurant.tables ? `${restaurant.tables} tables` : 'Tables not set'}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '48px',
        }}>
          {[
            { icon: <Utensils size={22} />, label: 'Menu Editor', desc: 'Add, edit & manage menu items', action: () => navigate('/menu-editor') },
            { icon: <BarChart2 size={22} />, label: 'Analytics', desc: 'Revenue, orders & performance', action: () => navigate('/analytics') },
            { icon: <Users size={22} />, label: 'Staff', desc: 'Manage your team & roles', action: null },
            { icon: <Settings size={22} />, label: 'Settings', desc: 'Configure this restaurant', action: () => navigate('/settings') },
          ].map(({ icon, label, desc, action }) => (
            <ModuleCard key={label} icon={icon} label={label} desc={desc} onClick={action} />
          ))}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '20px',
          padding: '32px',
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em',
            color: '#555', textTransform: 'uppercase', marginBottom: '24px',
          }}>
            Restaurant Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '24px' }}>
            <DetailItem label="Name" value={restaurant.name} />
            <DetailItem label="Owner" value={restaurant.owner || '—'} />
            <DetailItem label="Tables" value={restaurant.tables || '—'} />
            <DetailItem label="Created" value={new Date(restaurant.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <DetailItem label="Status" value={restaurant.status === 'active' ? 'Active' : 'Draft'} highlight />
          </div>
        </div>
      </div>
    </div>
  )
}

function ModuleCard({ icon, label, desc, onClick }) {
  const [hovered, setHovered] = useState(false)
  const disabled = !onClick

  return (
    <div
      onClick={onClick || undefined}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(232,50,26,0.06)' : 'rgba(255,255,255,0.03)',
        border: hovered ? '1px solid rgba(232,50,26,0.3)' : '1px solid rgba(255,255,255,0.07)',
        borderRadius: '18px',
        padding: '28px 24px',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.25s',
        opacity: disabled ? 0.45 : 1,
        boxShadow: hovered ? '0 0 25px rgba(232,50,26,0.1)' : 'none',
      }}
    >
      <div style={{
        width: '48px', height: '48px',
        borderRadius: '14px',
        background: 'rgba(232,50,26,0.1)',
        border: '1px solid rgba(232,50,26,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#E8321A',
        marginBottom: '18px',
      }}>
        {icon}
      </div>
      <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.5 }}>{desc}</div>
      {disabled && (
        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#444', marginTop: '12px', textTransform: 'uppercase' }}>
          Coming soon
        </div>
      )}
    </div>
  )
}

function DetailItem({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', color: '#444', textTransform: 'uppercase', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: highlight ? '#4ade80' : '#ccc' }}>
        {value}
      </div>
    </div>
  )
}
