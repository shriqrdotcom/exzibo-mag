import React, { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'

function ToastItem({ toast, onViewCart }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      background: '#1c1c1c',
      border: '1px solid rgba(232,50,26,0.3)',
      borderRadius: '18px',
      padding: '10px 14px 10px 10px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 2px 10px rgba(232,50,26,0.18)',
      width: '300px',
      pointerEvents: 'auto',
      opacity: toast.leaving ? 0 : (show ? 1 : 0),
      transform: toast.leaving
        ? 'translateY(-14px) scale(0.94)'
        : show
          ? 'translateY(0) scale(1)'
          : 'translateY(-22px) scale(0.92)',
      transition: toast.leaving
        ? 'opacity 0.28s ease, transform 0.28s ease'
        : 'opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        overflow: 'hidden',
        flexShrink: 0,
        background: '#2a2a2a',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <img
          src={toast.img}
          alt={toast.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
          <ShoppingBag size={11} color="#E8321A" />
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#E8321A',
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
          }}>
            Added to Cart
          </span>
        </div>
        <div style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#fff',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>
          {toast.name}
        </div>
      </div>

      <button
        onClick={onViewCart}
        style={{
          flexShrink: 0,
          padding: '7px 13px',
          borderRadius: '10px',
          background: '#E8321A',
          border: 'none',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(232,50,26,0.45)',
          transition: 'background 0.15s ease, transform 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#ff4d35'
          e.currentTarget.style.transform = 'scale(1.04)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = '#E8321A'
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        View Cart
      </button>
    </div>
  )
}

export default function CartToast({ toasts, onViewCart }) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
      alignItems: 'center',
    }}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onViewCart={onViewCart} />
      ))}
    </div>
  )
}
