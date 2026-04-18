import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight, Store, Wrench, Bell, User, Search, Palette, X, ExternalLink, LayoutDashboard } from 'lucide-react'
import ProfileSlide from '../components/ProfileSlide'

const THEMES = [
  {
    id: 'crimson-dark',
    name: 'Crimson Dark',
    badge: 'DEFAULT',
    available: true,
    preview: '/theme-preview-crimson-dark.png',
    accent: '#E8321A',
    desc: 'Obsidian black with crimson red accents.',
    link: '/restaurant/demo',
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    badge: 'COMING SOON',
    available: false,
    preview: null,
    accent: '#2563EB',
    desc: 'Deep navy with electric blue highlights.',
    link: null,
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    badge: 'COMING SOON',
    available: false,
    preview: null,
    accent: '#16A34A',
    desc: 'Earthy dark tones with lush green.',
    link: null,
  },
  {
    id: 'golden-luxury',
    name: 'Golden Luxury',
    badge: 'COMING SOON',
    available: false,
    preview: null,
    accent: '#D97706',
    desc: 'Midnight black with champagne gold.',
    link: null,
  },
  {
    id: 'midnight-purple',
    name: 'Midnight Purple',
    badge: 'COMING SOON',
    available: false,
    preview: null,
    accent: '#7C3AED',
    desc: 'Dark moody purples for bars & lounges.',
    link: null,
  },
  {
    id: 'slate-modern',
    name: 'Slate Modern',
    badge: 'COMING SOON',
    available: false,
    preview: null,
    accent: '#94A3B8',
    desc: 'Cool slate greys for a minimal aesthetic.',
    link: null,
  },
]

export default function Landing() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loaded, setLoaded] = useState(false)
  const [showThemes, setShowThemes] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showDemoDropdown, setShowDemoDropdown] = useState(false)
  const demoRef = useRef(null)

  const isHomePage = location.pathname === '/'

  useEffect(() => {
    setTimeout(() => setLoaded(true), 100)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (demoRef.current && !demoRef.current.contains(e.target)) {
        setShowDemoDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
          <button
            onClick={() => setShowProfile(true)}
            style={{
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
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '50px', padding: '6px 16px', marginBottom: '48px',
        }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#E8321A', boxShadow: '0 0 8px #E8321A', display: 'inline-block',
            animation: 'pulse-glow 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', color: '#ccc', textTransform: 'uppercase' }}>
            Live Management Active
          </span>
        </div>

        <h1 style={{
          fontSize: 'clamp(52px, 8vw, 96px)', fontWeight: 900, lineHeight: 1.0,
          letterSpacing: '-0.01em', marginBottom: '28px', maxWidth: '900px',
        }}>
          THE ART OF{' '}
          <span style={{ color: '#E8321A', textShadow: '0 0 60px rgba(232,50,26,0.4)' }}>PRECISION</span>
          <br />DINING.
        </h1>

        <p style={{
          fontSize: '16px', color: '#888', maxWidth: '480px',
          lineHeight: 1.7, marginBottom: '52px', fontWeight: 400,
        }}>
          Elevate your culinary establishment with an administrative suite crafted
          for excellence. Obsidian depth meets crimson performance.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <CTAButton onClick={() => navigate('/dashboard')} icon={<ArrowRight size={15} />} primary>
            OPEN DASHBOARD
          </CTAButton>
          <CTAButton onClick={() => navigate('/restaurants')} icon={<Store size={15} />}>
            MY RESTAURANTS
          </CTAButton>
          <CTAButton onClick={() => navigate('/create-website')} icon={<Wrench size={15} />} dashed>
            CREATE YOUR WEBSITE
          </CTAButton>
          <CTAButton onClick={() => setShowThemes(true)} icon={<Palette size={15} />} dashed>
            THEME'S
          </CTAButton>
          {isHomePage && (
            <div ref={demoRef} style={{ position: 'relative' }}>
              <CTAButton
                onClick={() => setShowDemoDropdown(prev => !prev)}
                icon={<ArrowRight size={15} />}
                dashed
              >
                DEMO
              </CTAButton>
              {showDemoDropdown && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 12px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  zIndex: 200,
                  minWidth: '220px',
                  alignItems: 'stretch',
                }}>
                  <CTAButton onClick={() => { setShowDemoDropdown(false) }} icon={<Wrench size={15} />} dashed>
                    CREATE DEMO APP
                  </CTAButton>
                  <CTAButton onClick={() => { setShowDemoDropdown(false) }} icon={<ArrowRight size={15} />} dashed>
                    LIST OF DEMO
                  </CTAButton>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <ProfileSlide
        open={showProfile}
        onClose={() => setShowProfile(false)}
        restaurantId="default"
        restaurantName="Exzibo Admin"
      />

      {/* ── THEMES MODAL ── */}
      {showThemes && (
        <div
          onClick={() => { setShowThemes(false); setSelectedTheme(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            animation: 'fadeInModal 0.2s ease',
          }}
        >
          <style>{`
            @keyframes fadeInModal { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scaleInModal { from { opacity: 0; transform: scale(0.96) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
            .theme-card-hover:hover .theme-card-overlay { opacity: 1 !important; }
            .theme-card-hover:hover img { transform: scale(1.04); }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '720px', maxHeight: '88vh',
              background: '#0e0e0e',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px',
              display: 'flex', flexDirection: 'column',
              animation: 'scaleInModal 0.28s cubic-bezier(0.34,1.1,0.64,1)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '22px 24px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Palette size={18} color="#E8321A" />
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.01em' }}>Website Themes</div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '1px' }}>
                    Pick a look for your restaurant website
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setShowThemes(false); setSelectedTheme(null); }}
                style={{
                  width: '34px', height: '34px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
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

            {/* Grid */}
            <div style={{
              overflowY: 'auto', padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '14px',
            }}>
              {THEMES.map(theme => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  selected={selectedTheme === theme.id}
                  onClick={() => {
                    if (theme.available) {
                      setSelectedTheme(prev => prev === theme.id ? null : theme.id)
                    }
                  }}
                  onOpenTheme={() => {
                    if (theme.link) {
                      setShowThemes(false)
                      setSelectedTheme(null)
                      navigate(theme.link)
                    }
                  }}
                  onOpenAdmin={() => { setShowThemes(false); setSelectedTheme(null); navigate('/admin/default'); }}
                />
              ))}

              {/* Add more slot */}
              <div style={{
                borderRadius: '16px',
                border: '2px dashed rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.01)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '8px', padding: '32px 16px',
                minHeight: '160px',
              }}>
                <span style={{ fontSize: '24px', opacity: 0.2 }}>✦</span>
                <span style={{ fontSize: '11px', color: '#2e2e2e', fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center' }}>
                  MORE THEMES<br />ARRIVING SOON
                </span>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '12px', color: '#3a3a3a' }}>
                {THEMES.filter(t => t.available).length} of {THEMES.length + 1} themes available
              </span>
              <button
                onClick={() => { setShowThemes(false); setSelectedTheme(null); }}
                style={{
                  padding: '10px 28px', background: '#E8321A', border: 'none',
                  borderRadius: '50px', color: '#fff', fontSize: '12px',
                  fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(232,50,26,0.35)', transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 28px rgba(232,50,26,0.55)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.35)'}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeCard({ theme, onClick, selected, onOpenTheme, onOpenAdmin }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="theme-card-hover"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: '16px',
        border: `1px solid ${(hovered || selected) && theme.available ? theme.accent + '55' : 'rgba(255,255,255,0.07)'}`,
        background: '#111',
        overflow: 'hidden',
        cursor: theme.available ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
        boxShadow: (hovered || selected) && theme.available ? `0 8px 28px ${theme.accent}25` : 'none',
        opacity: theme.available ? 1 : 0.45,
        position: 'relative',
      }}
    >
      {/* Preview image area */}
      <div style={{
        height: '180px', overflow: 'hidden', position: 'relative',
        background: '#080808',
      }}>
        {theme.preview ? (
          <>
            <img
              src={theme.preview}
              alt={theme.name}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                objectPosition: 'top',
                transition: 'transform 0.4s ease',
                transform: hovered || selected ? 'scale(1.04)' : 'scale(1)',
                display: 'block',
              }}
            />
            {/* Click overlay with two action buttons */}
            <div className="theme-card-overlay" style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '10px',
              opacity: selected ? 1 : hovered ? 0.55 : 0,
              transition: 'opacity 0.25s ease',
            }}>
              {selected ? (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); onOpenTheme(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '7px',
                      background: theme.accent, border: 'none', borderRadius: '50px',
                      padding: '9px 20px', fontSize: '12px', fontWeight: 800,
                      color: '#fff', letterSpacing: '0.06em', cursor: 'pointer',
                      boxShadow: `0 4px 18px ${theme.accent}60`,
                      width: '150px', justifyContent: 'center',
                      transition: 'transform 0.15s ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <ExternalLink size={13} />
                    OPEN THEME
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onOpenAdmin(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '7px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '50px',
                      padding: '9px 20px', fontSize: '12px', fontWeight: 800,
                      color: '#fff', letterSpacing: '0.06em', cursor: 'pointer',
                      width: '150px', justifyContent: 'center',
                      transition: 'transform 0.15s ease, background 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                  >
                    <LayoutDashboard size={13} />
                    OPEN ADMIN
                  </button>
                </>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  background: theme.accent, borderRadius: '50px',
                  padding: '9px 20px',
                  fontSize: '12px', fontWeight: 800, color: '#fff',
                  letterSpacing: '0.06em',
                  boxShadow: `0 4px 18px ${theme.accent}60`,
                }}>
                  <ExternalLink size={13} />
                  OPEN THEME
                </div>
              )}
            </div>
          </>
        ) : (
          /* Placeholder for upcoming themes */
          <div style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, #0a0a0a 0%, ${theme.accent}18 100%)`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: `${theme.accent}20`, border: `1px solid ${theme.accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px',
            }}>🔒</div>
            <div style={{
              width: '60px', height: '4px', borderRadius: '2px',
              background: theme.accent, opacity: 0.3,
            }} />
            <div style={{
              width: '40px', height: '4px', borderRadius: '2px',
              background: 'rgba(255,255,255,0.08)',
            }} />
          </div>
        )}
      </div>

      {/* Info bar */}
      <div style={{
        padding: '12px 14px',
        background: (hovered || selected) && theme.available ? `${theme.accent}0e` : 'transparent',
        transition: 'background 0.25s',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: theme.available ? '#e0e0e0' : '#555' }}>
            {theme.name}
          </span>
          <span style={{
            fontSize: '9px', fontWeight: 800, letterSpacing: '0.07em',
            padding: '2px 8px', borderRadius: '20px',
            background: theme.available ? `${theme.accent}20` : 'rgba(255,255,255,0.04)',
            color: theme.available ? theme.accent : '#444',
            border: `1px solid ${theme.available ? theme.accent + '35' : 'rgba(255,255,255,0.06)'}`,
            whiteSpace: 'nowrap',
          }}>
            {theme.badge}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: '#444', marginTop: '3px', lineHeight: 1.4 }}>
          {theme.desc}
        </div>
      </div>
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
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '16px 32px', borderRadius: '50px',
        background: hovered || primary ? '#E8321A' : 'transparent',
        border: dashed
          ? `2px dashed ${hovered ? '#E8321A' : 'rgba(232,50,26,0.5)'}`
          : `2px solid ${hovered || primary ? '#E8321A' : 'rgba(232,50,26,0.5)'}`,
        color: '#fff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em',
        cursor: 'pointer', transition: 'all 0.25s ease',
        boxShadow: hovered || primary ? '0 0 30px rgba(232,50,26,0.4)' : 'none',
      }}
    >
      {children}
      {icon}
    </button>
  )
}
