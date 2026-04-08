import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Bell, CheckCircle, XCircle,
  ClipboardList, BookOpen, Users, Settings, ArrowLeft,
  Palette, DollarSign, Type, Save, Check, CalendarDays, UtensilsCrossed,
  SlidersHorizontal, Plus, Pencil, Trash2, X,
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
    customerName: 'Rahul Sharma', phone: '+91 98765 43210', location: '12-A, Connaught Place, New Delhi',
    items: [
      { name: 'Paneer Tikka Platter', qty: 1, price: 450 },
      { name: 'Dal Makhani Special',  qty: 1, price: 600 },
      { name: 'Butter Garlic Naan',   qty: 4, price: 400 },
    ],
  },
  {
    id: 'EX8824', table: '14', status: 'pending',
    customerName: 'Meera Joshi', phone: '+91 91234 56789', location: '5, MG Road, Bengaluru',
    items: [
      { name: 'Chicken Biryani Bowl', qty: 1, price: 420 },
      { name: 'Mint Lime Soda',       qty: 2, price: 240 },
      { name: 'Gulab Jamun',          qty: 1, price: 160 },
    ],
  },
  {
    id: 'EX8819', table: '03', status: 'completed',
    customerName: 'Aryan Verma', phone: '+91 87654 32109', location: '88, Bandra West, Mumbai',
    items: [
      { name: 'Masala Dosa',   qty: 2, price: 340 },
      { name: 'Filter Coffee', qty: 2, price: 180 },
    ],
  },
]

const DEMO_BOOKINGS = [
  {
    id: 'BK1041', name: 'Arjun Mehta', phone: '+91 98765 43210', email: 'arjun@example.com',
    guests: 4, date: 'Today', time: '19:30', occasion: 'Casual Dining', seating: 'Indoor',
    notes: 'Window seat preferred', status: 'confirmed',
  },
  {
    id: 'BK1042', name: 'Priya Sharma', phone: '+91 91234 56789', email: 'priya@example.com',
    guests: 2, date: 'Today', time: '20:00', occasion: 'Anniversary', seating: 'Private',
    notes: 'Anniversary dinner', status: 'pending',
  },
  {
    id: 'BK1043', name: 'Rohan Das', phone: '+91 87654 32109', email: 'rohan@example.com',
    guests: 6, date: 'Tomorrow', time: '13:00', occasion: 'Birthday', seating: 'Outdoor',
    notes: 'Birthday party — cake allowed', status: 'confirmed',
  },
  {
    id: 'BK1044', name: 'Sneha Kapoor', phone: '+91 77654 98765', email: 'sneha@example.com',
    guests: 3, date: 'Tomorrow', time: '19:00', occasion: 'Casual Dining', seating: 'Indoor',
    notes: '', status: 'cancelled',
  },
]

const BOOKING_STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
  confirmed: { label: 'Confirmed', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
}

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
  const [bookings, setBookings] = useState([])
  const [activeNav, setActiveNav] = useState('orders')
  const [orderView, setOrderView] = useState('orders')
  const [showOrderSettings, setShowOrderSettings] = useState(false)
  const [orderSettings, setOrderSettings] = useState({ showName: false, showPhone: false, showLocation: false })
  const [showBookingSettings, setShowBookingSettings] = useState(false)
  const [bookingSettings, setBookingSettings] = useState({ showSeating: false })
  const [bookingFilter, setBookingFilter] = useState('today')
  const [notification, setNotification] = useState(null)

  const orderSettingsBtnRef = useRef(null)
  const orderSettingsPanelRef = useRef(null)
  const bookingSettingsBtnRef = useRef(null)
  const bookingSettingsPanelRef = useRef(null)
  const [globalConfig, setGlobalConfig] = useState(loadGlobalConfig)

  // Draft state for the settings panel
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(false)

  function loadBookings(restaurantId) {
    const key = `exzibo_bookings_${restaurantId}`
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    return saved.length > 0 ? saved : DEMO_BOOKINGS
  }

  useEffect(() => {
    if (isDefault) {
      setOrders(DEMO_ORDERS)
      setBookings(loadBookings('demo'))
      return
    }
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = all.find(r => r.id === id)
    if (!found) { navigate('/restaurants'); return }
    setRestaurant(found)
    setOrders(makeRestaurantOrders(found.name))
    setBookings(loadBookings(found.id))
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

  useEffect(() => {
    function handleClickOutside(e) {
      const inOrderBtn   = orderSettingsBtnRef.current?.contains(e.target)
      const inOrderPanel = orderSettingsPanelRef.current?.contains(e.target)
      if (showOrderSettings && !inOrderBtn && !inOrderPanel) {
        setShowOrderSettings(false)
      }
      const inBookingBtn   = bookingSettingsBtnRef.current?.contains(e.target)
      const inBookingPanel = bookingSettingsPanelRef.current?.contains(e.target)
      if (showBookingSettings && !inBookingBtn && !inBookingPanel) {
        setShowBookingSettings(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showOrderSettings, showBookingSettings])

  const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length

  const todayStr = new Date().toISOString().slice(0, 10)
  const filteredBookings = bookings.filter(b => {
    if (bookingFilter === 'today')    return b.date === todayStr
    if (bookingFilter === 'upcoming') return b.date > todayStr && b.status !== 'cancelled'
    return true
  })
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
        ) : activeNav === 'menu' ? (
          <MenuPanel
            restaurantId={isDefault ? 'demo' : id}
            accentStart={accentStart}
            accentEnd={accentEnd}
            currency={globalConfig.currency}
            showToast={showToast}
          />
        ) : (
          <>
            {/* Title bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 4px 16px',
            }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                {orderView === 'orders' ? 'Orders' : 'Bookings'}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {orderView === 'orders' && (
                  <button
                    ref={orderSettingsBtnRef}
                    onClick={() => setShowOrderSettings(p => !p)}
                    style={{
                      width: '36px', height: '36px', borderRadius: '11px',
                      background: showOrderSettings ? `${accentStart}18` : 'rgba(255,255,255,0.8)',
                      border: `1.5px solid ${showOrderSettings ? accentStart : 'rgba(226,232,240,0.8)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: showOrderSettings ? accentStart : '#64748b',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                )}
                {orderView === 'bookings' && (
                  <button
                    ref={bookingSettingsBtnRef}
                    onClick={() => setShowBookingSettings(p => !p)}
                    style={{
                      width: '36px', height: '36px', borderRadius: '11px',
                      background: showBookingSettings ? `${accentStart}18` : 'rgba(255,255,255,0.8)',
                      border: `1.5px solid ${showBookingSettings ? accentStart : 'rgba(226,232,240,0.8)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: showBookingSettings ? accentStart : '#64748b',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                )}
                <div style={{
                  padding: '6px 16px',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  borderRadius: '50px', color: '#fff',
                  fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
                  boxShadow: `0 4px 14px ${accentStart}60`,
                }}>
                  {orderView === 'orders'
                    ? `${activeCount} ACTIVE`
                    : `${bookings.filter(b => b.status !== 'cancelled').length} UPCOMING`}
                </div>
              </div>
            </div>

            {/* Order Settings Panel */}
            {orderView === 'orders' && showOrderSettings && (
              <div ref={orderSettingsPanelRef} style={{
                marginBottom: '16px',
                background: 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '18px',
                padding: '16px 18px',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
                animation: 'fadeSlideUp 0.2s ease',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.1em', marginBottom: '12px' }}>
                  SHOW ON ORDERS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { key: 'showName',     label: 'Name',       icon: '👤' },
                    { key: 'showPhone',    label: 'Phone No.',  icon: '📞' },
                    { key: 'showLocation', label: 'Location',   icon: '📍' },
                  ].map(({ key, label, icon }) => {
                    const on = orderSettings[key]
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                          <span>{icon}</span> {label}
                        </div>
                        <button
                          onClick={() => setOrderSettings(prev => ({ ...prev, [key]: !prev[key] }))}
                          style={{
                            width: '44px', height: '24px', borderRadius: '50px',
                            background: on ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : '#e2e8f0',
                            border: 'none', cursor: 'pointer', position: 'relative',
                            transition: 'background 0.25s ease',
                            flexShrink: 0,
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: '3px',
                            left: on ? '23px' : '3px',
                            width: '18px', height: '18px', borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                            transition: 'left 0.25s ease',
                            display: 'block',
                          }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Booking Settings Panel */}
            {orderView === 'bookings' && showBookingSettings && (
              <div ref={bookingSettingsPanelRef} style={{
                marginBottom: '16px',
                background: 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '18px',
                padding: '16px 18px',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
                animation: 'fadeSlideUp 0.2s ease',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.1em', marginBottom: '12px' }}>
                  SHOW ON BOOKINGS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { key: 'showSeating', label: 'Seating Preference', icon: '🪑' },
                  ].map(({ key, label, icon }) => {
                    const on = bookingSettings[key]
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                          <span>{icon}</span> {label}
                        </div>
                        <button
                          onClick={() => setBookingSettings(prev => ({ ...prev, [key]: !prev[key] }))}
                          style={{
                            width: '44px', height: '24px', borderRadius: '50px',
                            background: on ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : '#e2e8f0',
                            border: 'none', cursor: 'pointer', position: 'relative',
                            transition: 'background 0.25s ease',
                            flexShrink: 0,
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: '3px',
                            left: on ? '23px' : '3px',
                            width: '18px', height: '18px', borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                            transition: 'left 0.25s ease',
                            display: 'block',
                          }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Orders / Bookings Toggle */}
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.65)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: '16px',
              padding: '5px',
              marginBottom: '20px',
              border: '1px solid rgba(255,255,255,0.7)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              gap: '4px',
            }}>
              {[
                { id: 'orders',   icon: UtensilsCrossed, label: 'Orders' },
                { id: 'bookings', icon: CalendarDays,    label: 'Bookings' },
              ].map(tab => {
                const active = orderView === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setOrderView(tab.id)}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                      padding: '10px 14px',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '13px', fontWeight: 700,
                      background: active
                        ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})`
                        : 'transparent',
                      color: active ? '#fff' : '#94A3B8',
                      boxShadow: active ? `0 4px 14px ${accentStart}50` : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <tab.icon size={15} />
                    {tab.label}
                  </button>
                )
              })}
            </div>


            {/* Booking Date Filter */}
            {orderView === 'bookings' && (
              <div style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '50px',
                padding: '4px',
                marginBottom: '16px',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                gap: '2px',
              }}>
                {[
                  { id: 'today',    label: 'Today' },
                  { id: 'upcoming', label: 'Upcoming' },
                  { id: 'all',      label: 'All' },
                ].map(f => {
                  const active = bookingFilter === f.id
                  return (
                    <button
                      key={f.id}
                      onClick={() => setBookingFilter(f.id)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: '50px',
                        cursor: 'pointer',
                        fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em',
                        background: active ? '#fff' : 'transparent',
                        color: active ? accentStart : '#94A3B8',
                        boxShadow: active ? '0 2px 8px rgba(0,0,0,0.10)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {f.label.toUpperCase()}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Order / Booking cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {orderView === 'orders'
                ? orders.map((order, i) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      index={i}
                      accentStart={accentStart}
                      currency={globalConfig.currency}
                      onConfirm={() => confirmOrder(order.id)}
                      onCancel={() => cancelOrder(order.id)}
                      orderSettings={orderSettings}
                    />
                  ))
                : filteredBookings.length === 0
                  ? (
                    <div style={{
                      textAlign: 'center', padding: '48px 24px',
                      color: '#94A3B8', fontSize: '14px', fontWeight: 600,
                    }}>
                      No {bookingFilter === 'today' ? "today's" : bookingFilter} bookings found.
                    </div>
                  )
                  : filteredBookings.map((booking, i) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      index={i}
                      accentStart={accentStart}
                      accentEnd={accentEnd}
                      bookingSettings={bookingSettings}
                    />
                  ))
              }
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

/* ─── Booking Card ─── */
function BookingCard({ booking, index, accentStart, accentEnd, bookingSettings = {} }) {
  const cfg = BOOKING_STATUS_CONFIG[booking.status] || BOOKING_STATUS_CONFIG.pending

  function formatTime(t) {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 || 12
    return `${h12}:${m} ${ampm}`
  }

  function formatDate(d) {
    if (!d) return ''
    if (d === 'Today' || d === 'Tomorrow') return d
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return d }
  }

  const seatingIcon = { Indoor: '🏠', Outdoor: '🌿', Private: '🔒' }

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
        opacity: booking.status === 'cancelled' ? 0.65 : 1,
      }}
    >
      {/* Top row — name + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
            {booking.name}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', fontWeight: 600, letterSpacing: '0.04em' }}>
            BOOKING #{booking.id}
          </div>
        </div>
        <div style={{
          padding: '5px 12px',
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          borderRadius: '50px',
          fontSize: '10px', fontWeight: 800, color: cfg.color, letterSpacing: '0.1em',
          flexShrink: 0,
        }}>
          {cfg.label.toUpperCase()}
        </div>
      </div>

      <div style={{ height: '1px', background: `linear-gradient(90deg, ${accentStart}20, transparent)`, marginBottom: '14px' }} />

      {/* Contact row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
        {booking.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', fontWeight: 500 }}>
            <span style={{ fontSize: '13px' }}>📞</span> {booking.phone}
          </div>
        )}
        {booking.email && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', fontWeight: 500 }}>
            <span style={{ fontSize: '13px' }}>✉️</span> {booking.email}
          </div>
        )}
      </div>

      {/* Detail pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {[
          { icon: '📅', label: `${formatDate(booking.date)}  ${formatTime(booking.time)}` },
          { icon: '👥', label: `${booking.guests} Guest${booking.guests > 1 ? 's' : ''}` },
          bookingSettings.showSeating && booking.seating ? { icon: seatingIcon[booking.seating] || '🪑', label: booking.seating } : null,
          booking.occasion ? { icon: '🎉', label: booking.occasion } : null,
        ].filter(Boolean).map((pill, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 12px',
            background: `${accentStart}0D`,
            border: `1px solid ${accentStart}20`,
            borderRadius: '50px',
            fontSize: '12px', fontWeight: 600, color: '#334155',
          }}>
            <span style={{ fontSize: '13px' }}>{pill.icon}</span>
            {pill.label}
          </div>
        ))}
      </div>

      {/* Special requests / notes */}
      {booking.notes ? (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: 'rgba(248,250,252,0.9)',
          border: '1px solid rgba(226,232,240,0.6)',
          borderRadius: '12px',
          fontSize: '12px', color: '#64748b', fontWeight: 500,
          fontStyle: 'italic',
        }}>
          💬 {booking.notes}
        </div>
      ) : null}
    </div>
  )
}

/* ─── Menu Panel ─── */
const INITIAL_MENU = {
  starters: [
    { id: 1, name: 'Truffle Beef Carpaccio', desc: 'Thinly sliced wagyu, truffle oil, parmesan shavings, wild arugula.', price: 2100, tags: ['Popular', 'Gluten Free'] },
    { id: 2, name: 'Atlantic Oysters', desc: 'Half dozen fresh oysters, mignonette sauce, lemon wedges.', price: 2850, tags: ['Seasonal'] },
    { id: 3, name: 'Heirloom Burrata', desc: 'Creamy burrata, heirloom tomatoes, basil pesto, pine nuts.', price: 1650, tags: ['Vegetarian'] },
  ],
  mains: [
    { id: 4, name: 'A5 Wagyu Ribeye', desc: 'Japanese A5 wagyu, roasted bone marrow, truffle jus, seasonal vegetables.', price: 15500, tags: ['Popular'] },
    { id: 5, name: 'Lobster Thermidor', desc: 'Atlantic lobster, cognac cream, gruyère gratin, chive oil.', price: 7950, tags: ['Seasonal'] },
    { id: 6, name: 'Forest Mushroom Risotto', desc: 'Arborio rice, porcini, chanterelle, truffle oil, aged parmesan.', price: 3500, tags: ['Vegetarian', 'Gluten Free'] },
  ],
  drinks: [
    { id: 7, name: 'Noir Negroni', desc: 'Aged gin, Campari, premium vermouth, black walnut bitters.', price: 1850, tags: ['Popular'] },
    { id: 8, name: 'Champagne Selection', desc: 'Curated vintage champagnes by the glass or bottle.', price: 3750, tags: ['Seasonal'] },
    { id: 9, name: 'Pressed Botanicals', desc: 'House-pressed botanical blend, elderflower, cucumber, tonic.', price: 1350, tags: ['Vegetarian'] },
  ],
}

const TAG_COLORS = {
  Popular:     { bg: '#FEF9C3', color: '#CA8A04', border: '#FDE68A' },
  'Gluten Free': { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
  Vegetarian:  { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  Seasonal:    { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
}

const CATEGORY_TABS = [
  { key: 'starters', label: 'Starters', emoji: '🥗' },
  { key: 'mains',    label: 'Mains',    emoji: '🍖' },
  { key: 'drinks',   label: 'Drinks',   emoji: '🍹' },
]

const BLANK_ITEM = { name: '', desc: '', price: '', tags: [], img: null }

const DEFAULT_CAT_FILTERS = {
  starters: [
    { id: 'all', emoji: '🍽️', label: 'All' },
    { id: 'veg', emoji: '🥗', label: 'Veg' },
    { id: 'nonveg', emoji: '🥩', label: 'Non-Veg' },
    { id: 'popular', emoji: '⭐', label: 'Popular' },
    { id: 'seasonal', emoji: '🌿', label: 'Seasonal' },
  ],
  mains: [
    { id: 'all', emoji: '🍽️', label: 'All' },
    { id: 'grill', emoji: '🔥', label: 'Grill' },
    { id: 'seafood', emoji: '🦞', label: 'Seafood' },
    { id: 'vegetarian', emoji: '🥦', label: 'Vegetarian' },
    { id: 'pasta', emoji: '🍝', label: 'Pasta' },
  ],
  drinks: [
    { id: 'all', emoji: '🥤', label: 'All' },
    { id: 'cocktails', emoji: '🍹', label: 'Cocktails' },
    { id: 'wine', emoji: '🍷', label: 'Wine' },
    { id: 'beer', emoji: '🍺', label: 'Beer' },
    { id: 'soft', emoji: '🧃', label: 'Soft' },
  ],
}

function ImageUploadField({ value, onChange, accentStart }) {
  const inputRef = React.useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onChange(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={value}
            alt="Food"
            style={{
              width: '72px', height: '72px', borderRadius: '14px',
              objectFit: 'cover',
              border: '2px solid rgba(255,255,255,0.7)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{
                padding: '8px 14px',
                background: `${accentStart}12`,
                border: `1.5px solid ${accentStart}30`,
                borderRadius: '50px', cursor: 'pointer',
                fontSize: '11px', fontWeight: 800, color: accentStart,
                letterSpacing: '0.06em',
              }}
            >
              CHANGE PHOTO
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1.5px solid #FECACA',
                borderRadius: '50px', cursor: 'pointer',
                fontSize: '11px', fontWeight: 700, color: '#EF4444',
              }}
            >
              REMOVE
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%', padding: '18px',
            background: 'rgba(248,250,252,0.9)',
            border: '1.5px dashed #CBD5E1',
            borderRadius: '14px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = accentStart
            e.currentTarget.style.background = `${accentStart}08`
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#CBD5E1'
            e.currentTarget.style.background = 'rgba(248,250,252,0.9)'
          }}
        >
          <span style={{ fontSize: '24px' }}>📷</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>
            TAP TO UPLOAD PHOTO
          </span>
          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>
            JPG, PNG, WEBP supported
          </span>
        </button>
      )}
    </div>
  )
}

function MenuPanel({ restaurantId, accentStart, accentEnd, currency, showToast }) {
  const storageKey = `exzibo_menu_${restaurantId}`

  function loadMenu() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      return saved || INITIAL_MENU
    } catch { return INITIAL_MENU }
  }

  const [menu, setMenu] = useState(loadMenu)
  const [activeCategory, setActiveCategory] = useState('starters')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addDraft, setAddDraft] = useState(BLANK_ITEM)
  const [editFoodCard, setEditFoodCard] = useState(false)
  const [newAddon, setNewAddon] = useState({ label: '', price: '' })
  const [catFilters, setCatFilters] = useState(DEFAULT_CAT_FILTERS)
  const [activeCatFilter, setActiveCatFilter] = useState({ starters: 'all', mains: 'all', drinks: 'all' })
  const [hoveredCatId, setHoveredCatId] = useState(null)
  const [showAddCatModal, setShowAddCatModal] = useState(false)
  const [newCat, setNewCat] = useState({ emoji: '', label: '' })

  function saveMenu(updated) {
    localStorage.setItem(storageKey, JSON.stringify(updated))
    setMenu(updated)
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(updated) }))
    showToast('✅ Menu saved!')
  }

  function deleteItem(id) {
    const updated = { ...menu, [activeCategory]: menu[activeCategory].filter(i => i.id !== id) }
    saveMenu(updated)
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditDraft({ ...item, price: String(item.price), addOns: item.addOns || [] })
    setShowAdd(false)
    setEditFoodCard(false)
    setNewAddon({ label: '', price: '' })
  }

  function addNewAddon() {
    if (!newAddon.label.trim()) return
    const addon = { id: 'addon_' + Date.now(), label: newAddon.label.trim(), price: parseFloat(newAddon.price) || 0 }
    setEditDraft(d => ({ ...d, addOns: [...(d.addOns || []), addon] }))
    setNewAddon({ label: '', price: '' })
  }

  function removeAddon(idx) {
    setEditDraft(d => ({ ...d, addOns: (d.addOns || []).filter((_, i) => i !== idx) }))
  }

  function saveEdit() {
    const updated = {
      ...menu,
      [activeCategory]: menu[activeCategory].map(i =>
        i.id === editingId ? { ...editDraft, price: parseFloat(editDraft.price) || 0 } : i
      ),
    }
    saveMenu(updated)
    setEditingId(null)
    setEditDraft(null)
  }

  function addItem() {
    if (!addDraft.name.trim()) return
    const item = { id: Date.now(), name: addDraft.name.trim(), desc: addDraft.desc.trim(), price: parseFloat(addDraft.price) || 0, tags: addDraft.tags }
    const updated = { ...menu, [activeCategory]: [...menu[activeCategory], item] }
    saveMenu(updated)
    setAddDraft(BLANK_ITEM)
    setShowAdd(false)
  }

  function toggleTag(draft, setDraft, tag) {
    const has = draft.tags.includes(tag)
    setDraft(d => ({ ...d, tags: has ? d.tags.filter(t => t !== tag) : [...d.tags, tag] }))
  }

  function addCatFilter() {
    if (!newCat.label.trim()) return
    const cat = { id: Date.now().toString(), emoji: newCat.emoji || '🏷️', label: newCat.label.trim() }
    setCatFilters(prev => ({ ...prev, [activeCategory]: [...prev[activeCategory], cat] }))
    setNewCat({ emoji: '', label: '' })
    setShowAddCatModal(false)
  }

  function removeCatFilter(catId) {
    if (catId === 'all') return
    setCatFilters(prev => ({ ...prev, [activeCategory]: prev[activeCategory].filter(c => c.id !== catId) }))
    if (activeCatFilter[activeCategory] === catId) {
      setActiveCatFilter(prev => ({ ...prev, [activeCategory]: 'all' }))
    }
  }

  const items = menu[activeCategory] || []

  const inputSt = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 13px',
    background: 'rgba(248,250,252,0.9)',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '13px', fontWeight: 500, color: '#0f172a',
    outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div style={{ animation: 'fadeSlideUp 0.3s ease', paddingTop: '24px' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 20px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-0.02em' }}>
            Menu
          </h1>
          <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0, fontWeight: 600 }}>
            {items.length} item{items.length !== 1 ? 's' : ''} in {CATEGORY_TABS.find(c => c.key === activeCategory)?.label}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); setAddDraft(BLANK_ITEM) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 18px',
            background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
            border: 'none', borderRadius: '50px',
            color: '#fff', fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em',
            cursor: 'pointer',
            boxShadow: `0 4px 14px ${accentStart}50`,
          }}
        >
          <Plus size={14} /> ADD ITEM
        </button>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '16px',
        padding: '5px',
        marginBottom: '16px',
        border: '1px solid rgba(255,255,255,0.7)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        gap: '4px',
      }}>
        {CATEGORY_TABS.map(tab => {
          const active = activeCategory === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveCategory(tab.key); setEditingId(null); setShowAdd(false) }}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '10px 10px',
                border: 'none', borderRadius: '12px', cursor: 'pointer',
                fontSize: '12px', fontWeight: 700,
                background: active ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : 'transparent',
                color: active ? '#fff' : '#94A3B8',
                boxShadow: active ? `0 4px 14px ${accentStart}50` : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{tab.emoji}</span> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Food Category Filter Strip */}
      <div style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '16px',
        padding: '14px 16px 12px',
        marginBottom: '16px',
        border: '1px solid rgba(255,255,255,0.7)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', color: '#94A3B8', textTransform: 'uppercase' }}>
            Category Filters · {CATEGORY_TABS.find(c => c.key === activeCategory)?.label}
          </span>
          <button
            onClick={() => setShowAddCatModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 10px',
              background: `${accentStart}15`,
              border: `1px solid ${accentStart}35`,
              borderRadius: '6px',
              color: accentStart, fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = accentStart; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = `${accentStart}15`; e.currentTarget.style.color = accentStart }}
          >
            <Plus size={10} /> ADD FILTER
          </button>
        </div>
        <div style={{
          display: 'flex', gap: '10px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'none',
        }}>
          {(catFilters[activeCategory] || []).map(cat => {
            const isActive = activeCatFilter[activeCategory] === cat.id
            const isHov = hoveredCatId === cat.id
            return (
              <div
                key={cat.id}
                style={{ position: 'relative', flexShrink: 0 }}
                onMouseEnter={() => setHoveredCatId(cat.id)}
                onMouseLeave={() => setHoveredCatId(null)}
              >
                <button
                  onClick={() => setActiveCatFilter(prev => ({ ...prev, [activeCategory]: cat.id }))}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '10px 8px 8px',
                    width: '72px',
                    background: isActive ? '#fff' : isHov ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.03)',
                    border: isActive ? `1.5px solid ${accentStart}40` : '1.5px solid rgba(0,0,0,0.06)',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? `0 4px 16px ${accentStart}25` : 'none',
                  }}
                >
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: isActive ? `${accentStart}12` : 'rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px',
                  }}>
                    {cat.emoji}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: isActive ? 800 : 500,
                    color: isActive ? accentStart : '#94A3B8',
                    whiteSpace: 'nowrap',
                  }}>
                    {cat.label}
                  </span>
                </button>
                {cat.id !== 'all' && isHov && (
                  <button
                    onClick={() => removeCatFilter(cat.id)}
                    style={{
                      position: 'absolute', top: '-5px', right: '-5px',
                      width: '18px', height: '18px',
                      background: '#EF4444', border: 'none',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
                    }}
                    title="Remove filter"
                  >
                    <X size={9} color="#fff" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add Category Filter Modal */}
      {showAddCatModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200,
        }} onClick={() => setShowAddCatModal(false)}>
          <div style={{
            background: '#fff',
            borderRadius: '24px',
            padding: '28px',
            width: '340px',
            maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Add Category Filter</h3>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '20px', fontWeight: 500 }}>
              Adding to <span style={{ color: accentStart, fontWeight: 700 }}>{CATEGORY_TABS.find(c => c.key === activeCategory)?.label}</span> section
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Emoji Icon</label>
                <input
                  value={newCat.emoji}
                  onChange={e => setNewCat(p => ({ ...p, emoji: e.target.value }))}
                  placeholder="e.g. 🥗"
                  maxLength={4}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 13px',
                    background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0',
                    borderRadius: '12px', fontSize: '22px', textAlign: 'center',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Category Name</label>
                <input
                  value={newCat.label}
                  onChange={e => setNewCat(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. Organic, Vegan, Spicy..."
                  onKeyDown={e => e.key === 'Enter' && addCatFilter()}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 13px',
                    background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0',
                    borderRadius: '12px', fontSize: '13px', fontWeight: 500, color: '#0f172a',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
              {newCat.label.trim() && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '10px 8px 8px', width: '72px',
                    background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.06)',
                    borderRadius: '14px',
                  }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '12px',
                      background: 'rgba(0,0,0,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
                    }}>
                      {newCat.emoji || '🏷️'}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                      {newCat.label}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => { setShowAddCatModal(false); setNewCat({ emoji: '', label: '' }) }}
                style={{
                  flex: 1, padding: '12px',
                  background: '#F8FAFC', border: '1.5px solid #E2E8F0',
                  borderRadius: '12px', color: '#64748B', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={addCatFilter}
                style={{
                  flex: 2, padding: '12px',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  border: 'none', borderRadius: '12px',
                  color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                  boxShadow: `0 4px 14px ${accentStart}40`,
                  opacity: newCat.label.trim() ? 1 : 0.45,
                }}
              >Add Filter</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Form */}
      {showAdd && (
        <div className="order-card" style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          borderRadius: '20px', padding: '20px', marginBottom: '14px',
          border: `1.5px solid ${accentStart}30`,
          boxShadow: `0 4px 24px ${accentStart}15`,
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: accentStart, letterSpacing: '0.1em', marginBottom: '14px' }}>
            NEW ITEM — {CATEGORY_TABS.find(c => c.key === activeCategory)?.label.toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <ImageUploadField
              value={addDraft.img}
              onChange={v => setAddDraft(d => ({ ...d, img: v }))}
              accentStart={accentStart}
            />
            <input
              value={addDraft.name} onChange={e => setAddDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Item name *" style={inputSt}
              onFocus={e => e.target.style.borderColor = accentStart}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
            <textarea
              value={addDraft.desc} onChange={e => setAddDraft(d => ({ ...d, desc: e.target.value }))}
              placeholder="Description" rows={2}
              style={{ ...inputSt, resize: 'vertical' }}
              onFocus={e => e.target.style.borderColor = accentStart}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
            <input
              type="number" value={addDraft.price} onChange={e => setAddDraft(d => ({ ...d, price: e.target.value }))}
              placeholder={`Price (${currency})`} style={inputSt}
              onFocus={e => e.target.style.borderColor = accentStart}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.keys(TAG_COLORS).map(tag => {
                const active = addDraft.tags.includes(tag)
                const tc = TAG_COLORS[tag]
                return (
                  <button key={tag} onClick={() => toggleTag(addDraft, setAddDraft, tag)} style={{
                    padding: '5px 12px', borderRadius: '50px', cursor: 'pointer',
                    background: active ? tc.bg : 'transparent',
                    border: `1.5px solid ${active ? tc.border : '#e2e8f0'}`,
                    color: active ? tc.color : '#94A3B8',
                    fontSize: '11px', fontWeight: 700, transition: 'all 0.15s',
                  }}>{tag}</button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button onClick={() => setShowAdd(false)} style={{
              flex: 1, padding: '11px',
              background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0',
              borderRadius: '50px', color: '#94A3B8',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={addItem} style={{
              flex: 2, padding: '11px',
              background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
              border: 'none', borderRadius: '50px', color: '#fff',
              fontSize: '12px', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer',
              boxShadow: `0 4px 14px ${accentStart}40`,
            }}>ADD TO MENU</button>
          </div>
        </div>
      )}

      {/* Item cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '48px 24px',
            color: '#94A3B8', fontSize: '13px', fontWeight: 600,
          }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🍽️</div>
            No items yet. Tap ADD ITEM to get started.
          </div>
        )}
        {items.map((item, i) => (
          <div key={item.id} className="order-card" style={{
            animationDelay: `${i * 0.06}s`,
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '20px', padding: '18px 20px',
            border: editingId === item.id ? `1.5px solid ${accentStart}40` : '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)',
          }}>
            {editingId === item.id && editDraft ? (
              /* ── Edit Mode ── */
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: accentStart, letterSpacing: '0.1em', marginBottom: '12px' }}>
                  EDITING ITEM
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <ImageUploadField
                    value={editDraft.img}
                    onChange={v => setEditDraft(d => ({ ...d, img: v }))}
                    accentStart={accentStart}
                  />
                  <input
                    value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                    style={inputSt}
                    onFocus={e => e.target.style.borderColor = accentStart}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                  <textarea
                    value={editDraft.desc} onChange={e => setEditDraft(d => ({ ...d, desc: e.target.value }))}
                    rows={2} style={{ ...inputSt, resize: 'vertical' }}
                    onFocus={e => e.target.style.borderColor = accentStart}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                  <input
                    type="number" value={editDraft.price} onChange={e => setEditDraft(d => ({ ...d, price: e.target.value }))}
                    style={inputSt}
                    onFocus={e => e.target.style.borderColor = accentStart}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.keys(TAG_COLORS).map(tag => {
                      const active = editDraft.tags.includes(tag)
                      const tc = TAG_COLORS[tag]
                      return (
                        <button key={tag} onClick={() => toggleTag(editDraft, setEditDraft, tag)} style={{
                          padding: '5px 12px', borderRadius: '50px', cursor: 'pointer',
                          background: active ? tc.bg : 'transparent',
                          border: `1.5px solid ${active ? tc.border : '#e2e8f0'}`,
                          color: active ? tc.color : '#94A3B8',
                          fontSize: '11px', fontWeight: 700, transition: 'all 0.15s',
                        }}>{tag}</button>
                      )
                    })}
                  </div>
                </div>
                {/* ── Food Card: Add-on Editor ── */}
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setEditFoodCard(v => !v)}
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: editFoodCard ? `linear-gradient(135deg, ${accentStart}18, ${accentEnd}10)` : 'rgba(248,250,252,0.9)',
                      border: `1.5px solid ${editFoodCard ? accentStart + '60' : '#e2e8f0'}`,
                      borderRadius: '12px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      color: editFoodCard ? accentStart : '#64748b',
                      fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>🃏 FOOD CARD — CUSTOMIZE ADD-ONS</span>
                    <span style={{ fontSize: '10px' }}>{editFoodCard ? '▲' : '▼'}</span>
                  </button>

                  {editFoodCard && (
                    <div style={{
                      marginTop: '8px', padding: '14px',
                      background: 'rgba(248,250,252,0.95)',
                      border: '1px solid #e2e8f0', borderRadius: '14px',
                    }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.1em', marginBottom: '10px' }}>
                        CUSTOMIZE YOUR DISH OPTIONS
                      </div>

                      {/* Existing add-ons */}
                      {(editDraft.addOns || []).length === 0 && (
                        <div style={{ fontSize: '12px', color: '#cbd5e1', textAlign: 'center', padding: '10px 0', fontWeight: 600 }}>
                          No add-ons yet. Add one below.
                        </div>
                      )}
                      {(editDraft.addOns || []).map((addon, idx) => (
                        <div key={addon.id || idx} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 10px', marginBottom: '6px',
                          background: '#fff', borderRadius: '10px',
                          border: '1px solid #f1f5f9',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        }}>
                          <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                            {addon.label}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            +{currency}{addon.price}
                          </span>
                          <button
                            onClick={() => removeAddon(idx)}
                            style={{
                              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                              background: '#fee2e2', border: 'none', cursor: 'pointer',
                              color: '#ef4444', fontSize: '13px', fontWeight: 900,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              lineHeight: 1,
                            }}
                          >×</button>
                        </div>
                      ))}

                      {/* Add new add-on row */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                        <input
                          placeholder="Option name"
                          value={newAddon.label}
                          onChange={e => setNewAddon(n => ({ ...n, label: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addNewAddon()}
                          style={{
                            flex: 1, padding: '8px 10px',
                            border: '1.5px solid #e2e8f0', borderRadius: '8px',
                            fontSize: '12px', fontWeight: 600, color: '#0f172a',
                            background: '#fff', outline: 'none',
                          }}
                          onFocus={e => e.target.style.borderColor = accentStart}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                        <input
                          type="number"
                          placeholder="Price"
                          value={newAddon.price}
                          onChange={e => setNewAddon(n => ({ ...n, price: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addNewAddon()}
                          style={{
                            width: '72px', padding: '8px 10px',
                            border: '1.5px solid #e2e8f0', borderRadius: '8px',
                            fontSize: '12px', fontWeight: 600, color: '#0f172a',
                            background: '#fff', outline: 'none',
                          }}
                          onFocus={e => e.target.style.borderColor = accentStart}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                        <button
                          onClick={addNewAddon}
                          style={{
                            width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                            background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                            border: 'none', cursor: 'pointer',
                            color: '#fff', fontSize: '18px', fontWeight: 900,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 2px 8px ${accentStart}40`,
                          }}
                        >+</button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button onClick={() => setEditingId(null)} style={{
                    flex: 1, padding: '11px',
                    background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0',
                    borderRadius: '50px', color: '#94A3B8',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={saveEdit} style={{
                    flex: 2, padding: '11px',
                    background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                    border: 'none', borderRadius: '50px', color: '#fff',
                    fontSize: '12px', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer',
                    boxShadow: `0 4px 14px ${accentStart}40`,
                  }}>SAVE CHANGES</button>
                </div>
              </div>
            ) : (
              /* ── View Mode ── */
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px' }}>
                  {item.img && (
                    <img
                      src={item.img}
                      alt={item.name}
                      style={{
                        width: '56px', height: '56px', borderRadius: '12px',
                        objectFit: 'cover', flexShrink: 0,
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                      }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                      {item.name}
                    </div>
                    {item.desc && (
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5, fontWeight: 500 }}>
                        {item.desc}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '17px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.01em' }}>
                      {item.price.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>
                      {currency}
                    </div>
                  </div>
                </div>

                {item.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
                    {item.tags.map(tag => {
                      const tc = TAG_COLORS[tag] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }
                      return (
                        <span key={tag} style={{
                          padding: '3px 10px', borderRadius: '50px',
                          background: tc.bg, border: `1px solid ${tc.border}`,
                          color: tc.color, fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                        }}>{tag}</span>
                      )
                    })}
                  </div>
                )}

                <div style={{ height: '1px', background: `linear-gradient(90deg, ${accentStart}18, transparent)`, marginBottom: '12px' }} />

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => startEdit(item)} className="action-btn" style={{
                    flex: 1, padding: '10px',
                    background: `${accentStart}10`,
                    border: `1.5px solid ${accentStart}25`,
                    borderRadius: '50px', color: accentStart,
                    fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>
                    <Pencil size={13} /> EDIT
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="action-btn" style={{
                    flex: 1, padding: '10px',
                    background: 'rgba(254,242,242,0.9)',
                    border: '1.5px solid #FECACA',
                    borderRadius: '50px', color: '#EF4444',
                    fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>
                    <Trash2 size={13} /> DELETE
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Order Card ─── */
function OrderCard({ order, index, accentStart, currency, onConfirm, onCancel, orderSettings = {} }) {
  const subtotal = order.items.reduce((s, it) => s + it.price, 0)
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const isDone = order.status === 'completed' || order.status === 'cancelled'
  const showCustomerDetails = orderSettings.showName || orderSettings.showPhone || orderSettings.showLocation

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

      {/* Customer details (shown when toggles are on) */}
      {showCustomerDetails && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '5px',
          marginBottom: '14px',
          padding: '10px 12px',
          background: `${accentStart}08`,
          border: `1px solid ${accentStart}18`,
          borderRadius: '12px',
        }}>
          {orderSettings.showName && order.customerName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
              <span>👤</span> {order.customerName}
            </div>
          )}
          {orderSettings.showPhone && order.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#334155', fontWeight: 500 }}>
              <span>📞</span> {order.phone}
            </div>
          )}
          {orderSettings.showLocation && order.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#334155', fontWeight: 500 }}>
              <span>📍</span> {order.location}
            </div>
          )}
        </div>
      )}

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
