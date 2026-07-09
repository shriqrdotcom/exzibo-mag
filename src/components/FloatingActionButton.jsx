import React from 'react'

const FAB_CLASS = 'exzibo-fab'

export default function FloatingActionButton({ text, onClick }) {
  return (
    <>
      <style>{`
        .${FAB_CLASS} {
          right: 28px;
          bottom: 24px;
        }
        @media (max-width: 768px) {
          .${FAB_CLASS} {
            right: 20px;
            bottom: calc(95px + env(safe-area-inset-bottom));
          }
        }
      `}</style>
      <button
        className={FAB_CLASS}
        onClick={onClick}
        aria-label={text}
        style={{
          position: 'fixed',
          zIndex: 200,
          padding: '14px 24px',
          borderRadius: '16px',
          border: 'none',
          cursor: 'pointer',
          fontSize: 'clamp(14px, 1.2vw, 16px)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: '#fff',
          background: 'linear-gradient(135deg, #1976D2, #0D47A1)',
          boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
          e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.30)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)'
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.25)'
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
        }}
        onTouchEnd={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)'
        }}
      >
        <span style={{ fontSize: '1.2em', lineHeight: 1 }}>+</span>
        <span>{text}</span>
      </button>
    </>
  )
}
