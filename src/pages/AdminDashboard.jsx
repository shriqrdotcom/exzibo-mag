import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Bell, CheckCircle, XCircle,
  ClipboardList, BookOpen, Users, Settings, ArrowLeft,
  Palette, DollarSign, Type, Save, Check,
} from 'lucide-react'

const GLOBAL_CONFIG_KEY = 'exzibo_admin_global_config'

const DEFAULT_GLOBAL_CONFIG = {
  accentColor: '#6366F1',
  accentColorEnd: '#8B5CF6',
  currency: 'INR',
  adminTitle: 'Exzibo Admin',
}

const ACCENT_OPTIONS = [
  { label: 'Indigo',  start: '#6366F1', end: '#8B5CF6' },
  { label: 'Crimson', start: '#E8321A', end: '#c42210' },
  { label: 'Ocean',   start: '#2563EB', end: '#1d4ed8' },
  { label: 'Emerald', start: '#10B981', end: '#059669' },
  { label: 'Amber',   start: '#D97706', end: '#b45309' },
]

const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AED']

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
  preparing: { label: 'Preparing', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  completed: { label: 'Completed', color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0' },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
}

const NAV_ITEMS = [
  { id: 'orders',    icon: ClipboardList, label: 'Orders' },
  { id: 'menu',      icon: BookOpen,      label: 'Menu' },
  { id: 'customers', icon: Users,         label: 'Customers' },
  { id: 'settings',  icon: Settings,      label: 'Settings' },
]

const DEMO_ORDERS = [
  {
    id: 'EX8821', table: '08', status: 'preparing',
    items: [
      { name: 'Paneer Tikka Platter', qty: 1, price: 450 },
      { name: 'Dal Makhani Special',  qty: 1, price: 600 },
      { name: 'Butter Garlic Naan',   qty: 4, price: 400 },
    ],
  },
  {
    id: 'EX8824', table: '14', status: 'pending',
    items: [
      { name: 'Chicken Biryani Bowl', qty: 1, price: 420 },
      { name: 'Mint Lime Soda',       qty: 2, price: 240 },
      { name: 'Gulab Jamun',          qty: 1, price: 160 },
    ],
  },
  {
    id: 'EX8819', table: '03', status: 'completed',
    items: [
      { name: 'Masala Dosa',   qty: 2, price: 340 },
      { name: 'Filter Coffee', qty: 2, price: 180 },
    ],
  },
]

function makeRestaurantOrders(restaurantName) {
  const tag = restaurantName ? restaurantName.slice(0, 2).toUpperCase() : 'EX'
  return DEMO_ORDERS.map(o => ({ ...o, id: tag + o.id.slice(2) }))
}

function loadGlobalConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(GLOBAL_CONFIG_KEY))
    return saved ? { ...DEFAULT_GLOBAL_CONFIG, ...saved } : { ...DEFAULT_GLOBAL_CONFIG }
  } catch { return { ...DEFAULT_GLOBAL_CONFIG } }
}

export default function AdminDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isDefault = !id || id === 'default'

  const [restaurant, setRestaurant] = useState(null)
  const [orders, setOrders] = useState([])
  const [activeNav, setActiveNav] = useState('orders')
  const [notification, setNotification] = useState(null)
  const [globalConfig, setGlobalConfig] = useState(loadGlobalConfig)

  // Draft state for the settings panel
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isDefault) {
      setOrders(DEMO_ORDERS)
      return
    }
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = all.find(r => r.id === id)
    if (!found) { navigate('/restaurants'); return }
    setRestaurant(found)
    setOrders(makeRestaurantOrders(found.name))
  }, [id])

  // Sync global config whenever localStorage changes (other tabs, etc.)
  useEffect(() => {
    const cfg = loadGlobalConfig()
    setGlobalConfig(cfg)
    setDraft(cfg)
  }, [])

  useEffect(() => {
    if (activeNav === 'settings' && draft === null) {
      setDraft({ ...globalConfig })
    }
  }, [activeNav])

  const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length
  const accentStart = globalConfig.accentColor
  const accentEnd   = globalConfig.accentColorEnd

  function confirmOrder(orderId) {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      const next = o.status === 'pending' ? 'preparing' : o.status === 'preparing' ? 'completed' : o.status
      showToast(next === 'preparing' ? '🍳 Order is now Preparing!' : '✅ Order Completed!')
      return { ...o, status: next }
    }))
  }

  function cancelOrder(orderId) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o))
    showToast('❌ Order Cancelled')
  }

  function showToast(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 2500)
  }

  function saveSettings() {
    localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(draft))
    setGlobalConfig({ ...draft })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    showToast('✅ Settings saved — applies to all restaurants!')
  }

  const displayName = isDefault
    ? globalConfig.adminTitle
    : (restaurant?.name || 'Admin')

  const initials = displayName
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #eef0f5 0%, #e8eaf0 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingBottom: '110px',
      fontFamily: "'Inter', 'Poppins', system-ui, sans-serif",
      position: 'relative',
    }}>
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes settingsPanelIn {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .order-card { animation: fadeSlideUp 0.35s ease both; }
        .action-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .action-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.12) !important; }
        .action-btn:active { transform: scale(0.96); }
        .nav-tab { transition: background 0.2s ease, transform 0.15s ease; }
        .nav-tab:hover { transform: scale(1.08); }
      `}</style>

      {/* Toast */}
      {notification && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%',
          transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '12px 24px',
          borderRadius: '50px', fontSize: '13px', fontWeight: 600,
          zIndex: 999, boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          animation: 'slideInToast 0.3s ease',
          whiteSpace: 'nowrap',
        }}>
          {notification}
        </div>
      )}

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
              onClick={() => isDefault ? navigate('/') : navigate('/restaurants')}
              style={{
                width: '38px', height: '38px', borderRadius: '12px',
                background: `${accentStart}18`,
                border: `1px solid ${accentStart}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: accentStart,
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div style={{
              width: '44px', height: '44px', borderRadius: '14px',
              background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${accentStart}50`,
              fontSize: '16px', fontWeight: 900, color: '#fff',
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                {displayName}
                {isDefault && (
                  <span style={{
                    marginLeft: '8px', fontSize: '9px', fontWeight: 700,
                    letterSpacing: '0.1em', color: accentStart,
                    background: `${accentStart}15`, borderRadius: '6px',
                    padding: '2px 7px', verticalAlign: 'middle',
                  }}>
                    TEMPLATE
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: accentStart, letterSpacing: '0.1em' }}>
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

        {/* ── CONTENT ── */}
        {activeNav === 'settings' ? (
          <SettingsPanel
            draft={draft}
            setDraft={setDraft}
            accentStart={accentStart}
            accentEnd={accentEnd}
            onSave={saveSettings}
            saved={saved}
            isDefault={isDefault}
          />
        ) : (
          <>
            {/* Title bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 4px 16px',
            }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Orders
              </h1>
              <div style={{
                padding: '6px 16px',
                background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                borderRadius: '50px', color: '#fff',
                fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
                boxShadow: `0 4px 14px ${accentStart}60`,
              }}>
                {activeCount} ACTIVE
              </div>
            </div>

            {/* Default mode banner */}
            {isDefault && (
              <div style={{
                margin: '0 0 16px',
                padding: '12px 16px',
                background: `${accentStart}12`,
                border: `1px solid ${accentStart}25`,
                borderRadius: '14px',
                fontSize: '12px', color: accentStart, fontWeight: 600, lineHeight: 1.5,
              }}>
                📋 This is the <strong>default template</strong> for all restaurants. Changes made in Settings will apply to every restaurant's admin dashboard.
              </div>
            )}

            {/* Order cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {orders.map((order, i) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={i}
                  accentStart={accentStart}
                  currency={globalConfig.currency}
                  onConfirm={() => confirmOrder(order.id)}
                  onCancel={() => cancelOrder(order.id)}
                />
              ))}
            </div>
          </>
        )}
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
                background: active ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : 'transparent',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                color: active ? '#fff' : '#94A3B8',
                boxShadow: active ? `0 4px 14px ${accentStart}60` : 'none',
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

/* ─── Settings Panel ─── */
function SettingsPanel({ draft, setDraft, accentStart, accentEnd, onSave, saved, isDefault }) {
  if (!draft) return null

  return (
    <div style={{ animation: 'settingsPanelIn 0.3s ease', paddingTop: '24px' }}>
      {/* Header */}
      <div style={{ padding: '0 4px 20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          Settings
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          {isDefault
            ? 'Configure the global admin template — changes apply to all restaurants.'
            : 'Global admin settings — changes apply to all restaurant dashboards.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Admin Title */}
        <SettingCard
          icon={<Type size={18} />}
          accentStart={accentStart}
          title="Admin Title"
          desc="The name shown in the admin header across all dashboards"
        >
          <input
            value={draft.adminTitle}
            onChange={e => setDraft(d => ({ ...d, adminTitle: e.target.value }))}
            placeholder="Exzibo Admin"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 14px',
              background: 'rgba(248,250,252,0.9)',
              border: '1.5px solid #e2e8f0',
              borderRadius: '12px',
              fontSize: '14px', fontWeight: 600, color: '#0f172a',
              outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => e.target.style.borderColor = accentStart}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
        </SettingCard>

        {/* Accent Color */}
        <SettingCard
          icon={<Palette size={18} />}
          accentStart={accentStart}
          title="Accent Color"
          desc="Theme color used across all admin dashboards"
        >
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {ACCENT_OPTIONS.map(opt => {
              const active = draft.accentColor === opt.start
              return (
                <button
                  key={opt.label}
                  onClick={() => setDraft(d => ({ ...d, accentColor: opt.start, accentColorEnd: opt.end }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 14px',
                    background: active ? `${opt.start}18` : 'rgba(248,250,252,0.9)',
                    border: `1.5px solid ${active ? opt.start : '#e2e8f0'}`,
                    borderRadius: '50px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 700, color: active ? opt.start : '#64748b',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: `linear-gradient(135deg, ${opt.start}, ${opt.end})`,
                    flexShrink: 0,
                  }} />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </SettingCard>

        {/* Currency */}
        <SettingCard
          icon={<DollarSign size={18} />}
          accentStart={accentStart}
          title="Currency"
          desc="Currency displayed in all order subtotals"
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CURRENCY_OPTIONS.map(c => {
              const active = draft.currency === c
              return (
                <button
                  key={c}
                  onClick={() => setDraft(d => ({ ...d, currency: c }))}
                  style={{
                    padding: '8px 18px',
                    background: active ? `${accentStart}18` : 'rgba(248,250,252,0.9)',
                    border: `1.5px solid ${active ? accentStart : '#e2e8f0'}`,
                    borderRadius: '50px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 700,
                    color: active ? accentStart : '#64748b',
                    transition: 'all 0.2s',
                  }}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </SettingCard>

        {/* Save Button */}
        <button
          onClick={onSave}
          style={{
            width: '100%', padding: '15px',
            background: saved
              ? 'linear-gradient(135deg, #10B981, #059669)'
              : `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
            border: 'none', borderRadius: '50px',
            color: '#fff', fontSize: '14px', fontWeight: 800,
            letterSpacing: '0.06em', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: `0 6px 20px ${accentStart}50`,
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
          }}
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'SAVED!' : 'SAVE & APPLY TO ALL RESTAURANTS'}
        </button>
      </div>
    </div>
  )
}

function SettingCard({ icon, accentStart, title, desc, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.75)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '20px',
      padding: '18px 20px',
      border: '1px solid rgba(255,255,255,0.7)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '10px',
          background: `${accentStart}15`,
          border: `1px solid ${accentStart}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accentStart, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '1px' }}>{desc}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

/* ─── Order Card ─── */
function OrderCard({ order, index, accentStart, currency, onConfirm, onCancel }) {
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
        borderRadius: '20px', padding: '20px',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: accentStart, letterSpacing: '0.02em', lineHeight: 1.3 }}>
            ORDERS FROM TABLE NO — {order.table}
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px', fontWeight: 500 }}>
            ORDER ID #{order.id}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>SUBTOTAL</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {subtotal.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 700 }}>{currency}</span>
          </div>
          <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: cfg.color, marginTop: '4px' }}>
            {cfg.label.toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ height: '1px', background: `linear-gradient(90deg, ${accentStart}20, transparent)`, marginBottom: '14px' }} />

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
              background: `linear-gradient(135deg, ${accentStart}25, ${accentStart}15)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 800, color: accentStart, flexShrink: 0,
            }}>
              {idx + 1}
            </div>
            <div style={{ flex: 1, fontSize: '13px', color: '#334155', fontWeight: 500 }}>
              {item.name}{item.qty > 1 ? ` (x${item.qty})` : ''}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{item.price}</div>
          </div>
        ))}
      </div>

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
