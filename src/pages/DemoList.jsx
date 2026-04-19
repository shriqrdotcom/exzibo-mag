import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, ExternalLink, Trash2, FlaskConical, LayoutDashboard } from 'lucide-react'

export default function DemoList() {
  const navigate = useNavigate()
  const [demos, setDemos] = useState([])

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('exzibo_demo_restaurants') || '[]')
    setDemos(saved)
  }, [])

  const handleDelete = (id) => {
    const updated = demos.filter(d => d.id !== id)
    setDemos(updated)
    localStorage.setItem('exzibo_demo_restaurants', JSON.stringify(updated))
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(232,50,26,0.08) 0%, #0A0A0A 55%)',
      color: '#fff',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .demo-card { animation: fadeUp 0.3s ease both; }
        .demo-card:hover .demo-card-actions { opacity: 1 !important; }
      `}</style>

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 48px', borderBottom: '1px solid rgba(255,255,255,0.05)',
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
          onClick={() => navigate('/demo/create')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 22px',
            background: '#E8321A', border: 'none', borderRadius: '50px',
            color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
            cursor: 'pointer', boxShadow: '0 0 20px rgba(232,50,26,0.4)', transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 35px rgba(232,50,26,0.6)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.4)'}
        >
          <Plus size={14} /> CREATE DEMO APP
        </button>
      </nav>

      <div style={{ padding: '60px 48px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: '#E8321A', textTransform: 'uppercase', marginBottom: '14px' }}>
            Demo Apps
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, lineHeight: 1.05, marginBottom: '14px' }}>
            YOUR DEMO<br />
            <span style={{ color: '#E8321A', textShadow: '0 0 40px rgba(232,50,26,0.35)' }}>RESTAURANT SITES</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#555', maxWidth: '420px', lineHeight: 1.7 }}>
            Demo websites are sandboxed and separate from your main restaurant portfolio. Only visible here.
          </p>
        </div>

        {demos.length === 0 ? (
          <EmptyState onAdd={() => navigate('/demo/create')} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}>
            {demos.map((demo, i) => (
              <DemoCard
                key={demo.id}
                demo={demo}
                index={i}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DemoCard({ demo, index, onDelete }) {
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const coverImage = demo.images?.[0] || null
  const planColors = { PLUS: '#3B82F6', PRO: '#8B5CF6', MAX: '#E8321A' }
  const planColor = planColors[demo.plan] || '#E8321A'

  return (
    <div
      className="demo-card"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '20px',
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        animationDelay: `${index * 0.05}s`,
        position: 'relative',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(232,50,26,0.25)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(232,50,26,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Cover Image */}
      <div style={{ height: '160px', background: '#111', position: 'relative', overflow: 'hidden' }}>
        {coverImage ? (
          <img src={coverImage} alt={demo.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #111 0%, rgba(232,50,26,0.12) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FlaskConical size={40} color="rgba(232,50,26,0.3)" />
          </div>
        )}
        {/* Demo badge */}
        <div style={{
          position: 'absolute', top: '12px', left: '12px',
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(232,50,26,0.3)',
          borderRadius: '8px', padding: '4px 10px',
          fontSize: '10px', fontWeight: 700, color: '#E8321A', letterSpacing: '0.1em',
        }}>DEMO</div>
        {/* Plan badge */}
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          background: `${planColor}22`, border: `1px solid ${planColor}44`,
          borderRadius: '8px', padding: '4px 10px',
          fontSize: '10px', fontWeight: 700, color: planColor, letterSpacing: '0.08em',
        }}>{demo.plan || 'PLUS'}</div>
      </div>

      {/* Info */}
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', marginBottom: '4px', letterSpacing: '0.02em' }}>
          {demo.name}
        </div>
        {demo.location && (
          <div style={{ fontSize: '12px', color: '#555', marginBottom: '12px' }}>{demo.location}</div>
        )}
        <div style={{ fontSize: '11px', color: '#333', fontFamily: 'monospace', marginBottom: '14px' }}>
          /restaurant/{demo.slug}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Primary — Open Dashboard */}
          <button
            onClick={() => navigate(`/demo/dashboard/${demo.id}`)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              padding: '11px', background: '#E8321A', border: 'none', borderRadius: '10px',
              color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              transition: 'box-shadow 0.2s', letterSpacing: '0.06em',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 24px rgba(232,50,26,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <LayoutDashboard size={13} /> OPEN DASHBOARD
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate(`/restaurant/${demo.slug}`)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
              color: '#888', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.2s', letterSpacing: '0.04em',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            <ExternalLink size={12} /> VIEW DEMO
          </button>
          <button
            onClick={() => navigate(`/admin/${demo.id}`)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', color: '#888', fontSize: '11px', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              letterSpacing: '0.04em',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            <ExternalLink size={12} /> DEMO ADMIN
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', color: '#555', cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#EF4444' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#555' }}
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => onDelete(demo.id)}
                style={{
                  padding: '8px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '10px', color: '#EF4444', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                }}
              >DELETE</button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', color: '#666', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                }}
              >NO</button>
            </div>
          )}
          </div>{/* end inner row */}
        </div>{/* end actions column */}
      </div>
    </div>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div style={{ textAlign: 'center', padding: '100px 24px' }}>
      <div style={{
        width: '72px', height: '72px', borderRadius: '22px',
        background: 'rgba(232,50,26,0.08)', border: '1px solid rgba(232,50,26,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px', fontSize: '30px',
      }}>🧪</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>No Demo Apps Yet</div>
      <div style={{ fontSize: '14px', color: '#444', marginBottom: '32px', lineHeight: 1.7, maxWidth: '360px', margin: '0 auto 32px' }}>
        Create a demo restaurant website to test and preview how your site will look before going live.
      </div>
      <button
        onClick={onAdd}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '14px 32px', background: '#E8321A', border: 'none', borderRadius: '50px',
          color: '#fff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em',
          cursor: 'pointer', boxShadow: '0 0 28px rgba(232,50,26,0.4)',
        }}
      >
        <Plus size={15} /> CREATE DEMO APP
      </button>
    </div>
  )
}
