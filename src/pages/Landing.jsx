import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Utensils, Wrench, Bell, User, Search } from 'lucide-react'

export default function Landing() {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)

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
        </div>
      </main>
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
