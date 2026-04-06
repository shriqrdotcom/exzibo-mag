import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, CheckCircle, XCircle, UtensilsCrossed,
  ClipboardList, BookOpen, Users, Settings, ArrowLeft,
} from 'lucide-react'

const INITIAL_ORDERS = [
  {
    id: 'EX8821',
    table: '08',
    status: 'preparing',
    items: [
      { name: 'Paneer Tikka Platter', qty: 1, price: 450 },
      { name: 'Dal Makhani Special', qty: 1, price: 600 },
      { name: 'Butter Garlic Naan', qty: 4, price: 400 },
    ],
  },
  {
    id: 'EX8824',
    table: '14',
    status: 'pending',
    items: [
      { name: 'Chicken Biryani Bowl', qty: 1, price: 420 },
      { name: 'Mint Lime Soda', qty: 2, price: 240 },
      { name: 'Gulab Jamun', qty: 1, price: 160 },
    ],
  },
  {
    id: 'EX8819',
    table: '03',
    status: 'completed',
    items: [
      { name: 'Masala Dosa', qty: 2, price: 340 },
      { name: 'Filter Coffee', qty: 2, price: 180 },
    ],
  },
  {
    id: 'EX8830',
    table: '11',
    status: 'pending',
    items: [
      { name: 'Veg Manchurian', qty: 1, price: 280 },
      { name: 'Fried Rice', qty: 2, price: 420 },
      { name: 'Mango Lassi', qty: 2, price: 260 },
    ],
  },
]

const STATUS_CONFIG = {
  pending:    { label: 'Pending',    color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
  preparing:  { label: 'Preparing', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  completed:  { label: 'Completed', color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0' },
  cancelled:  { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
}

const NAV_ITEMS = [
  { id: 'orders',    icon: ClipboardList, label: 'Orders' },
  { id: 'menu',      icon: BookOpen,      label: 'Menu' },
  { id: 'customers', icon: Users,         label: 'Customers' },
  { id: 'settings',  icon: Settings,      label: 'Settings' },
]

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState(INITIAL_ORDERS)
  const [activeNav, setActiveNav] = useState('orders')
  const [notification, setNotification] = useState(null)

  const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length

  function confirmOrder(id) {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o
      const next = o.status === 'pending' ? 'preparing' : o.status === 'preparing' ? 'completed' : o.status
      showNotification(next === 'preparing' ? '🍳 Order is now Preparing!' : '✅ Order Completed!')
      return { ...o, status: next }
    }))
  }

  function cancelOrder(id) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' } : o))
    showNotification('❌ Order Cancelled')
  }

  function showNotification(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 2500)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #eef0f5 0%, #e8eaf0 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingBottom: '100px',
      fontFamily: "'Inter', 'Poppins', system-ui, sans-serif",
      position: 'relative',
    }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .order-card {
          animation: fadeSlideUp 0.35s ease both;
        }
        .action-btn {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .action-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.12) !important;
        }
        .action-btn:active {
          transform: scale(0.96);
        }
        .nav-tab {
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .nav-tab:hover { transform: scale(1.08); }
      `}</style>

      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '12px 24px',
          borderRadius: '50px', fontSize: '13px', fontWeight: 600,
          zIndex: 999, boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          animation: 'slideIn 0.3s ease',
          whiteSpace: 'nowrap',
        }}>
          {notification}
        </div>
      )}

      {/* Max-width wrapper */}
      <div style={{ width: '100%', maxWidth: '480px', padding: '0 16px', boxSizing: 'border-box' }}>

        {/* ── HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 16px',
          margin: '16px 0 0',
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '38px', height: '38px', borderRadius: '12px',
                background: 'rgba(99,102,241,0.1)',
                border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#6366F1',
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div style={{
              width: '44px', height: '44px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
            }}>
              <UtensilsCrossed size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                Exzibo Admin
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366F1', letterSpacing: '0.1em' }}>
                ADMIN
              </div>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '13px',
              background: 'rgba(255,255,255,0.8)',
              boxShadow: '4px 4px 10px rgba(0,0,0,0.08), -2px -2px 8px rgba(255,255,255,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: '1px solid rgba(255,255,255,0.6)',
            }}>
              <Bell size={18} color="#64748b" />
            </div>
            {activeCount > 0 && (
              <div style={{
                position: 'absolute', top: '-4px', right: '-4px',
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#EF4444', color: '#fff',
                fontSize: '10px', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #eef0f5',
              }}>
                {activeCount}
              </div>
            )}
          </div>
        </div>

        {/* ── PAGE TITLE BAR ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '24px 4px 16px',
        }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            Orders
          </h1>
          <div style={{
            padding: '6px 16px',
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            borderRadius: '50px',
            color: '#fff',
            fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
            boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
          }}>
            {activeCount} ACTIVE
          </div>
        </div>

        {/* ── ORDER CARDS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {orders.map((order, i) => (
            <OrderCard
              key={order.id}
              order={order}
              index={i}
              onConfirm={() => confirmOrder(order.id)}
              onCancel={() => cancelOrder(order.id)}
            />
          ))}
        </div>
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{
        position: 'fixed', bottom: '20px',
        left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '28px',
        padding: '10px 16px',
        display: 'flex', gap: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
        border: '1px solid rgba(255,255,255,0.6)',
        zIndex: 100,
      }}>
        {NAV_ITEMS.map(item => {
          const active = activeNav === item.id
          return (
            <button
              key={item.id}
              className="nav-tab"
              onClick={() => setActiveNav(item.id)}
              title={item.label}
              style={{
                width: '48px', height: '48px', borderRadius: '18px',
                background: active
                  ? 'linear-gradient(135deg, #6366F1, #8B5CF6)'
                  : 'transparent',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                color: active ? '#fff' : '#94A3B8',
                boxShadow: active ? '0 4px 14px rgba(99,102,241,0.45)' : 'none',
              }}
            >
              <item.icon size={20} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OrderCard({ order, index, onConfirm, onCancel }) {
  const subtotal = order.items.reduce((s, it) => s + it.price, 0)
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const isDone = order.status === 'completed' || order.status === 'cancelled'

  return (
    <div
      className="order-card"
      style={{
        animationDelay: `${index * 0.07}s`,
        background: 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '20px',
        padding: '20px',
        border: '1px solid rgba(255,255,255,0.7)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)',
        transition: 'box-shadow 0.25s ease, transform 0.25s ease',
        opacity: isDone ? 0.7 : 1,
      }}
      onMouseEnter={e => {
        if (!isDone) {
          e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.11), inset 0 1px 0 rgba(255,255,255,0.8)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Order header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#6366F1', letterSpacing: '0.02em', lineHeight: 1.3 }}>
            ORDERS FROM TABLE NO — {order.table}
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px', fontWeight: 500 }}>
            ORDER ID #{order.id}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>SUBTOTAL</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {subtotal.toLocaleString('en-IN')} <span style={{ fontSize: '13px', fontWeight: 700 }}>INR</span>
          </div>
          <div style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em',
            color: cfg.color, marginTop: '4px',
          }}>
            {cfg.label.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(99,102,241,0.12), transparent)', marginBottom: '14px' }} />

      {/* Item list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
        {order.items.map((item, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px',
            background: 'rgba(248,250,252,0.8)',
            borderRadius: '12px',
            border: '1px solid rgba(226,232,240,0.6)',
          }}>
            <div style={{
              width: '22px', height: '22px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 800, color: '#6366F1', flexShrink: 0,
            }}>
              {idx + 1}
            </div>
            <div style={{ flex: 1, fontSize: '13px', color: '#334155', fontWeight: 500 }}>
              {item.name}{item.qty > 1 ? ` (x${item.qty})` : ''}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
              {item.price}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {!isDone ? (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="action-btn"
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              border: 'none', borderRadius: '50px',
              color: '#fff', fontSize: '13px', fontWeight: 800,
              letterSpacing: '0.06em', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
            }}
          >
            <CheckCircle size={15} />
            CONFIRM
          </button>
          <button
            className="action-btn"
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px',
              background: 'rgba(254,242,242,0.9)',
              border: '1.5px solid #FECACA',
              borderRadius: '50px',
              color: '#EF4444', fontSize: '13px', fontWeight: 800,
              letterSpacing: '0.06em', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              boxShadow: '0 4px 12px rgba(239,68,68,0.12)',
            }}
          >
            <XCircle size={15} />
            CANCEL
          </button>
        </div>
      ) : (
        <div style={{
          textAlign: 'center', padding: '10px',
          background: cfg.bg, borderRadius: '50px',
          border: `1px solid ${cfg.border}`,
          fontSize: '12px', fontWeight: 700,
          color: cfg.color, letterSpacing: '0.08em',
        }}>
          {cfg.label.toUpperCase()}
        </div>
      )}
    </div>
  )
}
