import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Utensils, Wrench, Bell, User, Search, Palette, X, Check } from 'lucide-react'

const THEMES = [
  {
    id: 'crimson-dark',
    name: 'Crimson Dark',
    badge: 'DEFAULT',
    available: true,
    bg: '#0A0A0A',
    accent: '#E8321A',
    card: '#111111',
    desc: 'Obsidian black with crimson red accents. The signature Exzibo look.',
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    badge: 'COMING SOON',
    available: false,
    bg: '#050D1A',
    accent: '#2563EB',
    card: '#0D1A2E',
    desc: 'Deep navy with electric blue highlights. Perfect for seafood & coastal dining.',
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    badge: 'COMING SOON',
    available: false,
    bg: '#050E08',
    accent: '#16A34A',
    card: '#0A1A0D',
    desc: 'Earthy dark tones with lush green. Ideal for farm-to-table & organic menus.',
  },
  {
    id: 'golden-luxury',
    name: 'Golden Luxury',
    badge: 'COMING SOON',
    available: false,
    bg: '#0A0800',
    accent: '#D97706',
    card: '#1A1400',
    desc: 'Midnight black with champagne gold. The ultimate fine-dining statement.',
  },
  {
    id: 'midnight-purple',
    name: 'Midnight Purple',
    badge: 'COMING SOON',
    available: false,
    bg: '#07050F',
    accent: '#7C3AED',
    card: '#110D1E',
    desc: 'Dark moody purples for bars, lounges & cocktail experiences.',
  },
  {
    id: 'slate-modern',
    name: 'Slate Modern',
    badge: 'COMING SOON',
    available: false,
    bg: '#0D0F12',
    accent: '#94A3B8',
    card: '#161A1F',
    desc: 'Cool slate greys for a minimal, editorial dining aesthetic.',
  },
]

export default function Landing() {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const [showThemes, setShowThemes] = useState(false)
  const [activeTheme, setActiveTheme] = useState('crimson-dark')

  useEffect(() => {
    setTimeout(() => setLoaded(true), 100)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,50,26,0.12) 0%, #0A0A0A 60%)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 48px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.05em' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>

        <div />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            padding: '8px 14px',
          }}>
            <Search size={13} color="#555" />
            <span style={{ color: '#555', fontSize: '12px' }}>SEARCH SYSTEM...</span>
          </div>
          <button style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><Bell size={18} /></button>
          <button style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            color: '#888',
            cursor: 'pointer',
            padding: '6px 8px',
          }}><User size={18} /></button>
        </div>
      </nav>

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        textAlign: 'center',
        opacity: loaded ? 1 : 0,
        transform: loaded ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.8s ease',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '50px',
          padding: '6px 16px',
          marginBottom: '48px',
        }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#E8321A',
            boxShadow: '0 0 8px #E8321A',
            display: 'inline-block',
            animation: 'pulse-glow 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', color: '#ccc', textTransform: 'uppercase' }}>
            Live Management Active
          </span>
        </div>

        <h1 style={{
          fontSize: 'clamp(52px, 8vw, 96px)',
          fontWeight: 900,
          lineHeight: 1.0,
          letterSpacing: '-0.01em',
          marginBottom: '28px',
          maxWidth: '900px',
        }}>
          THE ART OF{' '}
          <span style={{
            color: '#E8321A',
            textShadow: '0 0 60px rgba(232,50,26,0.4)',
          }}>
            PRECISION
          </span>
          <br />
          DINING.
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#888',
          maxWidth: '480px',
          lineHeight: 1.7,
          marginBottom: '52px',
          fontWeight: 400,
        }}>
          Elevate your culinary establishment with an administrative suite crafted
          for excellence. Obsidian depth meets crimson performance.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <CTAButton onClick={() => navigate('/dashboard')} icon={<ArrowRight size={15} />} primary>
            OPEN DASHBOARD
          </CTAButton>
          <CTAButton onClick={() => navigate('/restaurants')} icon={<Utensils size={15} />}>
            MY RESTAURANTS
          </CTAButton>
          <CTAButton onClick={() => navigate('/create-website')} icon={<Wrench size={15} />} dashed>
            CREATE YOUR WEBSITE
          </CTAButton>
          <CTAButton onClick={() => setShowThemes(true)} icon={<Palette size={15} />} dashed>
            THEME'S
          </CTAButton>
        </div>
      </main>

      {/* ── THEMES MODAL ── */}
      {showThemes && (
        <div
          onClick={() => setShowThemes(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'fadeInModal 0.2s ease',
          }}
        >
          <style>{`
            @keyframes fadeInModal { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scaleInModal { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              background: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px',
              display: 'flex',
              flexDirection: 'column',
              animation: 'scaleInModal 0.25s cubic-bezier(0.34,1.1,0.64,1)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 24px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: 'rgba(232,50,26,0.12)',
                  border: '1px solid rgba(232,50,26,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Palette size={18} color="#E8321A" />
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.01em' }}>Website Themes</div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '1px' }}>Choose how your restaurant site looks to guests</div>
                </div>
              </div>
              <button
                onClick={() => setShowThemes(false)}
                style={{
                  width: '34px', height: '34px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#666', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#666' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Theme list */}
            <div style={{ overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {THEMES.map(theme => {
                const isActive = activeTheme === theme.id
                return (
                  <div
                    key={theme.id}
                    onClick={() => theme.available && setActiveTheme(theme.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '16px',
                      borderRadius: '16px',
                      background: isActive ? 'rgba(232,50,26,0.07)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isActive ? 'rgba(232,50,26,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      cursor: theme.available ? 'pointer' : 'default',
                      opacity: theme.available ? 1 : 0.5,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { if (theme.available && !isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (theme.available && !isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  >
                    {/* Color swatch */}
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '14px',
                      flexShrink: 0, overflow: 'hidden',
                      background: theme.bg,
                      border: `1px solid ${isActive ? theme.accent + '55' : 'rgba(255,255,255,0.1)'}`,
                      boxShadow: isActive ? `0 0 16px ${theme.accent}35` : 'none',
                      display: 'flex', flexDirection: 'column',
                      transition: 'all 0.25s',
                    }}>
                      <div style={{ flex: 1, background: theme.bg }} />
                      <div style={{ height: '16px', background: theme.accent }} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: isActive ? '#fff' : '#ccc' }}>
                          {theme.name}
                        </span>
                        <span style={{
                          fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em',
                          padding: '2px 8px', borderRadius: '20px',
                          background: isActive
                            ? 'rgba(232,50,26,0.18)'
                            : (theme.available ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)'),
                          color: isActive ? '#E8321A' : (theme.available ? '#888' : '#444'),
                          border: `1px solid ${isActive ? 'rgba(232,50,26,0.25)' : 'rgba(255,255,255,0.07)'}`,
                        }}>
                          {isActive ? 'ACTIVE' : theme.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.5 }}>
                        {theme.desc}
                      </div>
                    </div>

                    {/* Right indicator */}
                    <div style={{ flexShrink: 0 }}>
                      {isActive ? (
                        <div style={{
                          width: '26px', height: '26px', borderRadius: '50%',
                          background: '#E8321A',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 0 14px rgba(232,50,26,0.5)',
                        }}>
                          <Check size={13} color="#fff" strokeWidth={3} />
                        </div>
                      ) : (
                        <div style={{
                          width: '26px', height: '26px', borderRadius: '50%',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px',
                        }}>
                          {theme.available ? '' : '🔒'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Empty slot hint */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '16px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.01)',
                border: '1px dashed rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: '16px', opacity: 0.4 }}>✦</span>
                <span style={{ fontSize: '12px', color: '#2a2a2a', letterSpacing: '0.05em', fontWeight: 600 }}>
                  More themes arriving soon
                </span>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '12px', color: '#444' }}>
                {THEMES.filter(t => t.available).length} of {THEMES.length} themes available
              </span>
              <button
                onClick={() => setShowThemes(false)}
                style={{
                  padding: '10px 24px',
                  background: '#E8321A',
                  border: 'none',
                  borderRadius: '50px',
                  color: '#fff',
                  fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(232,50,26,0.35)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 28px rgba(232,50,26,0.55)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.35)'}
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CTAButton({ children, onClick, icon, primary, dashed }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '16px 32px',
        borderRadius: '50px',
        background: hovered || primary ? '#E8321A' : 'transparent',
        border: dashed
          ? `2px dashed ${hovered ? '#E8321A' : 'rgba(232,50,26,0.5)'}`
          : `2px solid ${hovered || primary ? '#E8321A' : 'rgba(232,50,26,0.5)'}`,
        color: '#fff',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        boxShadow: hovered || primary ? '0 0 30px rgba(232,50,26,0.4)' : 'none',
      }}
    >
      {children}
      {icon}
    </button>
  )
}
