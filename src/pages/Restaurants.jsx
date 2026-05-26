import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Store, ExternalLink, Settings, Globe, Utensils } from 'lucide-react'
import PlanBadge from '../components/PlanBadge'
import { getRestaurants } from '../lib/db'
import { supabase } from '../lib/supabase'
import { openRoleDashboard } from '../lib/navigation'

export default function Restaurants() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [activeFilter, setActiveFilter] = useState('live')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function fetchAll() {
      return getRestaurants()
        .then(rows => {
          try { localStorage.setItem('exzibo_restaurants', JSON.stringify(rows)) } catch { }
          setRestaurants(rows)
          setLoadError('')
        })
        .catch(err => setLoadError(err.message || 'Failed to load restaurants'))
    }

    setLoading(true)
    fetchAll().finally(() => setLoading(false))

    const channel = supabase
      .channel('rt-restaurants')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'restaurants' },
        () => { fetchAll() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const liveList = restaurants.filter(r => r.status === 'active')
  const pausedList = restaurants.filter(r => r.status !== 'active')
  const filtered = activeFilter === 'live' ? liveList : pausedList

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      color: '#fff',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <style>{`
        @media (max-width: 640px) {
          .rest-nav { padding: 16px 20px !important; }
          .rest-page-body { padding: 28px 16px 60px !important; }
          .rest-filter-wrap { gap: 10px !important; }
          .rest-filter-btn { padding: 11px 16px !important; font-size: 11px !important; }
          .rest-table-header { display: none !important; }
          .rest-row {
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            padding: 16px !important;
          }
          .rest-row-meta { display: flex !important; }
          .rest-tables-desktop { display: none !important; }
          .rest-col-status { display: none !important; }
          .rest-col-plan  { display: none !important; }
          .rest-col-url   { display: none !important; }
          .rest-row-actions {
            display: flex !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .rest-row-actions button {
            flex: 1 !important;
            justify-content: center !important;
            padding: 11px 8px !important;
            font-size: 13px !important;
          }
        }
      `}</style>

      {/* Nav */}
      <nav className="rest-nav" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 48px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(10,10,10,0.95)',
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(12px)',
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

      <div className="rest-page-body" style={{ padding: '48px 48px 80px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Page title */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em',
            color: '#E8321A', textTransform: 'uppercase', marginBottom: '10px',
          }}>
            My Restaurants
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 900, lineHeight: 1.05, margin: 0 }}>
            YOUR CULINARY{' '}
            <span style={{ color: '#E8321A', textShadow: '0 0 40px rgba(232,50,26,0.35)' }}>PORTFOLIO</span>
          </h1>
        </div>

        {/* ── Two top filter buttons ── */}
        <div className="rest-filter-wrap" style={{ display: 'flex', gap: '14px', marginBottom: '32px' }}>
          {/* LIVE WEBSITES */}
          <button
            className="rest-filter-btn"
            onClick={() => setActiveFilter('live')}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 28px',
              background: activeFilter === 'live'
                ? 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 100%)'
                : 'rgba(255,255,255,0.03)',
              border: activeFilter === 'live'
                ? '1.5px solid rgba(34,197,94,0.5)'
                : '1.5px solid rgba(255,255,255,0.08)',
              borderRadius: '14px',
              color: activeFilter === 'live' ? '#4ade80' : '#555',
              fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em',
              cursor: 'pointer',
              transition: 'all 0.25s',
              boxShadow: activeFilter === 'live' ? '0 0 24px rgba(34,197,94,0.12)' : 'none',
            }}
            onMouseEnter={e => { if (activeFilter !== 'live') { e.currentTarget.style.borderColor = 'rgba(34,197,94,0.25)'; e.currentTarget.style.color = '#4ade80' } }}
            onMouseLeave={e => { if (activeFilter !== 'live') { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#555' } }}
          >
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: activeFilter === 'live' ? '#4ade80' : '#333',
              boxShadow: activeFilter === 'live' ? '0 0 8px rgba(74,222,128,0.9)' : 'none',
              flexShrink: 0,
              transition: 'all 0.25s',
            }} />
            LIVE WEBSITES
            <span style={{
              background: activeFilter === 'live' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
              color: activeFilter === 'live' ? '#4ade80' : '#444',
              fontSize: '11px', fontWeight: 700,
              padding: '2px 8px', borderRadius: '20px',
              transition: 'all 0.25s',
            }}>
              {liveList.length}
            </span>
          </button>

          {/* PAUSED WEBSITES */}
          <button
            className="rest-filter-btn"
            onClick={() => setActiveFilter('paused')}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 28px',
              background: activeFilter === 'paused'
                ? 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.04) 100%)'
                : 'rgba(255,255,255,0.03)',
              border: activeFilter === 'paused'
                ? '1.5px solid rgba(251,191,36,0.45)'
                : '1.5px solid rgba(255,255,255,0.08)',
              borderRadius: '14px',
              color: activeFilter === 'paused' ? '#fbbf24' : '#555',
              fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em',
              cursor: 'pointer',
              transition: 'all 0.25s',
              boxShadow: activeFilter === 'paused' ? '0 0 24px rgba(251,191,36,0.1)' : 'none',
            }}
            onMouseEnter={e => { if (activeFilter !== 'paused') { e.currentTarget.style.borderColor = 'rgba(251,191,36,0.25)'; e.currentTarget.style.color = '#fbbf24' } }}
            onMouseLeave={e => { if (activeFilter !== 'paused') { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#555' } }}
          >
            <span style={{ fontSize: '13px', opacity: activeFilter === 'paused' ? 1 : 0.35, transition: 'opacity 0.25s' }}>⏸</span>
            PAUSED WEBSITES
            <span style={{
              background: activeFilter === 'paused' ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.06)',
              color: activeFilter === 'paused' ? '#fbbf24' : '#444',
              fontSize: '11px', fontWeight: 700,
              padding: '2px 8px', borderRadius: '20px',
              transition: 'all 0.25s',
            }}>
              {pausedList.length}
            </span>
          </button>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#444', fontSize: '14px' }}>
            Loading your restaurants…
          </div>
        ) : loadError ? (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '16px 20px', borderRadius: '14px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#EF4444', marginBottom: '4px' }}>
                Could not load restaurants
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>{loadError}</div>
            </div>
          </div>
        ) : restaurants.length === 0 ? (
          <EmptyState onAdd={() => navigate('/create-website')} />
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '20px',
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div className="rest-table-header" style={{
              display: 'grid',
              gridTemplateColumns: '2fr 120px 1fr 140px 220px',
              padding: '14px 28px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              {['RESTAURANT', 'STATUS', 'PLAN', 'URL', 'ACTIONS'].map(col => (
                <div key={col} style={{
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em',
                  color: '#333', textTransform: 'uppercase',
                }}>
                  {col}
                </div>
              ))}
            </div>

            {/* Rows */}
            {filtered.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '64px 24px', textAlign: 'center',
              }}>
                <Store size={32} style={{ color: '#2a2a2a', marginBottom: '14px' }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#333', marginBottom: '6px' }}>
                  No {activeFilter === 'live' ? 'live' : 'paused'} restaurants
                </div>
                <div style={{ fontSize: '12px', color: '#2a2a2a' }}>
                  {activeFilter === 'live'
                    ? 'Activate a restaurant to see it here'
                    : 'Pause a restaurant to see it here'}
                </div>
              </div>
            ) : (
              filtered.map((r, i) => (
                <RestaurantRow
                  key={r.id}
                  restaurant={r}
                  isLast={i === filtered.length - 1}
                  onCustomer={() => window.open(`https://menu.exzibo.online/${r.slug || r.id}/home`, '_blank', 'noopener,noreferrer')}
                  onAdmin={() => openRoleDashboard(navigate, r, 'owner')}
                />
              ))
            )}

            {/* Footer count */}
            <div style={{
              padding: '14px 28px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: '12px', color: '#333' }}>
                {filtered.length} {filtered.length === 1 ? 'website' : 'websites'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RestaurantRow({ restaurant, isLast, onCustomer, onAdmin }) {
  const slug = restaurant.slug || restaurant.id
  const isActive = restaurant.status === 'active'
  const initials = restaurant.name
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const thumbSrc = restaurant.logo || restaurant.images?.[0] || null

  return (
    <div className="rest-row" style={{
      display: 'grid',
      gridTemplateColumns: '2fr 120px 1fr 140px 220px',
      alignItems: 'center',
      padding: '18px 28px',
      borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
      transition: 'background 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Restaurant name + logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
          background: thumbSrc ? `url(${thumbSrc}) center/cover no-repeat` : '#E8321A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 900, color: '#fff',
          boxShadow: '0 4px 12px rgba(232,50,26,0.35)',
        }}>
          {!thumbSrc && initials}
        </div>
        <div className="rest-row-info" style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {restaurant.name}
          </div>
          {/* On mobile this row shows status + tables inline under the name */}
          <div className="rest-row-meta" style={{ display: 'none' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
              border: isActive ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px', padding: '3px 9px',
            }}>
              <div style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: isActive ? '#4ade80' : '#444',
                boxShadow: isActive ? '0 0 5px rgba(74,222,128,0.8)' : 'none',
              }} />
              <span style={{ fontSize: '10px', fontWeight: 700, color: isActive ? '#4ade80' : '#555' }}>
                {isActive ? 'LIVE' : 'PAUSED'}
              </span>
            </div>
            {restaurant.tables && (
              <span style={{ fontSize: '11px', color: '#444', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Utensils size={10} /> {restaurant.tables} tables
              </span>
            )}
          </div>
          {restaurant.tables && (
            <div className="rest-tables-desktop" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#444' }}>
              <Utensils size={10} /> {restaurant.tables} tables
            </div>
          )}
        </div>
      </div>

      {/* Status — hidden on mobile (shown inline above) */}
      <div className="rest-col-status">
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
          border: isActive ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px', padding: '5px 12px',
        }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: isActive ? '#4ade80' : '#444',
            boxShadow: isActive ? '0 0 6px rgba(74,222,128,0.8)' : 'none',
          }} />
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: isActive ? '#4ade80' : '#555' }}>
            {isActive ? 'LIVE' : 'PAUSED'}
          </span>
        </div>
      </div>

      {/* Plan */}
      <div className="rest-col-plan">
        {restaurant.plan
          ? <PlanBadge plan={restaurant.plan} />
          : <span style={{ fontSize: '11px', color: '#333' }}>—</span>
        }
      </div>

      {/* URL */}
      <div className="rest-col-url" style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
        <Globe size={10} color="#333" style={{ flexShrink: 0 }} />
        <span style={{
          fontSize: '11px', color: '#444', fontFamily: 'monospace',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          /restaurant/{slug}
        </span>
      </div>

      {/* Actions */}
      <div className="rest-row-actions" style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onCustomer}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px',
            background: '#E8321A', border: 'none', borderRadius: '10px',
            color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(232,50,26,0.35)',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#ff4d35'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#E8321A'; e.currentTarget.style.transform = 'none' }}
        >
          <ExternalLink size={11} /> Customer
        </button>
        <button
          onClick={onAdmin}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            color: '#aaa', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#aaa' }}
        >
          <Settings size={11} /> Admin
        </button>
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
        <Store size={32} />
      </div>
      <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '10px' }}>No Restaurants Yet</div>
      <p style={{ fontSize: '13px', color: '#555', maxWidth: '320px', lineHeight: 1.7, marginBottom: '36px' }}>
        Create your first restaurant and it will get its own live customer page instantly.
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
