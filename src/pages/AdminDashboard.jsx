import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAnalytics } from '../context/AnalyticsContext'
import {
  CheckCircle, XCircle,
  ClipboardList, BookOpen, Users, Settings, ArrowLeft, BarChart2,
  Palette, DollarSign, Type, Save, Check, CalendarDays, UtensilsCrossed,
  SlidersHorizontal, Plus, Pencil, Trash2, X, Search,
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
  { id: 'bookings',  icon: CalendarDays,  label: 'Bookings' },
  { id: 'menu',      icon: BookOpen,      label: 'Menu' },
  { id: 'customers', icon: BarChart2,      label: 'Analytics' },
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
  const [showMenuSearch, setShowMenuSearch] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const menuSearchRef = useRef(null)

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
          {activeNav === 'menu' && (
            <div
              onClick={() => {
                setShowMenuSearch(v => !v)
                if (!showMenuSearch) {
                  setMenuSearch('')
                  setTimeout(() => menuSearchRef.current?.focus(), 50)
                } else {
                  setMenuSearch('')
                }
              }}
              style={{
                width: '42px', height: '42px', borderRadius: '13px',
                background: showMenuSearch ? `${accentStart}15` : 'rgba(255,255,255,0.8)',
                boxShadow: showMenuSearch
                  ? `0 0 0 1.5px ${accentStart}50, 4px 4px 10px rgba(0,0,0,0.08)`
                  : '4px 4px 10px rgba(0,0,0,0.08), -2px -2px 8px rgba(255,255,255,0.9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', border: `1px solid ${showMenuSearch ? accentStart + '40' : 'rgba(255,255,255,0.6)'}`,
                transition: 'all 0.2s',
              }}
            >
              <Search size={18} color={showMenuSearch ? accentStart : '#64748b'} />
            </div>
          )}
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
            showMenuSearch={showMenuSearch}
            menuSearch={menuSearch}
            setMenuSearch={setMenuSearch}
            menuSearchRef={menuSearchRef}
            onCloseSearch={() => { setShowMenuSearch(false); setMenuSearch('') }}
          />
        ) : activeNav === 'orders' ? (
          <>
            {/* Title bar - Orders */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 4px 16px',
            }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Orders
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                <div style={{
                  padding: '6px 16px',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  borderRadius: '50px', color: '#fff',
                  fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
                  boxShadow: `0 4px 14px ${accentStart}60`,
                }}>
                  {`${activeCount} ACTIVE`}
                </div>
              </div>
            </div>

            {/* Order Settings Panel */}
            {showOrderSettings && (
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
                            width: '18px', height: '18px', borderRadius: '9px',
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
                  orderSettings={orderSettings}
                />
              ))}
            </div>
          </>
        ) : activeNav === 'bookings' ? (
          <>
            {/* Title bar - Bookings */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 4px 16px',
            }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Bookings
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                <div style={{
                  padding: '6px 16px',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  borderRadius: '50px', color: '#fff',
                  fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
                  boxShadow: `0 4px 14px ${accentStart}60`,
                }}>
                  {`${bookings.filter(b => b.status !== 'cancelled').length} UPCOMING`}
                </div>
              </div>
            </div>

            {/* Booking Settings Panel */}
            {showBookingSettings && (
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
                            width: '18px', height: '18px', borderRadius: '9px',
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

            {/* Booking Date Filter */}
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

            {/* Booking cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredBookings.length === 0
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
        ) : activeNav === 'customers' ? (
          <AnalyticsPanel accentStart={accentStart} accentEnd={accentEnd} restaurantId={isDefault ? 'demo' : id} />
        ) : null}
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
                    width: '12px', height: '12px', borderRadius: '6px',
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
  Popular:       { bg: '#FEF9C3', color: '#B45309', border: '#FDE68A' },
  'Gluten Free': { bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
  Vegetarian:    { bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' },
  Seasonal:      { bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' },
}

const CATEGORY_TABS = [
  { key: 'starters', label: 'Starters', emoji: '🥗' },
  { key: 'mains',    label: 'Mains',    emoji: '🍖' },
  { key: 'drinks',   label: 'Drinks',   emoji: '🍹' },
]

const BLANK_ITEM = { name: '', desc: '', price: '', tags: [], img: null, veg: false }

const DEFAULT_CAT_FILTERS = {
  starters: [
    { id: 'all', emoji: '🍽️', label: 'All', image: null, assignedItems: [] },
    { id: 'veg', emoji: '🥗', label: 'Veg', image: null, assignedItems: [] },
    { id: 'nonveg', emoji: '🥩', label: 'Non-Veg', image: null, assignedItems: [] },
    { id: 'popular', emoji: '⭐', label: 'Popular', image: null, assignedItems: [] },
    { id: 'seasonal', emoji: '🌿', label: 'Seasonal', image: null, assignedItems: [] },
  ],
  mains: [
    { id: 'all', emoji: '🍽️', label: 'All', image: null, assignedItems: [] },
    { id: 'grill', emoji: '🔥', label: 'Grill', image: null, assignedItems: [] },
    { id: 'seafood', emoji: '🦞', label: 'Seafood', image: null, assignedItems: [] },
    { id: 'vegetarian', emoji: '🥦', label: 'Vegetarian', image: null, assignedItems: [] },
    { id: 'pasta', emoji: '🍝', label: 'Pasta', image: null, assignedItems: [] },
  ],
  drinks: [
    { id: 'all', emoji: '🥤', label: 'All', image: null, assignedItems: [] },
    { id: 'cocktails', emoji: '🍹', label: 'Cocktails', image: null, assignedItems: [] },
    { id: 'wine', emoji: '🍷', label: 'Wine', image: null, assignedItems: [] },
    { id: 'beer', emoji: '🍺', label: 'Beer', image: null, assignedItems: [] },
    { id: 'soft', emoji: '🧃', label: 'Soft', image: null, assignedItems: [] },
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

function MenuPanel({ restaurantId, accentStart, accentEnd, currency, showToast, showMenuSearch, menuSearch, setMenuSearch, menuSearchRef, onCloseSearch }) {
  const storageKey  = `exzibo_menu_${restaurantId}`
  const filtersKey  = `exzibo_menu_filters_${restaurantId}`
  const tabsKey     = `exzibo_tabs_${restaurantId}`
  const enabledKey  = `exzibo_filters_enabled_${restaurantId}`

  function loadTabs() {
    try {
      const saved = JSON.parse(localStorage.getItem(tabsKey))
      return saved?.length ? saved : CATEGORY_TABS
    } catch { return CATEGORY_TABS }
  }

  function loadMenu() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey))
      return saved || INITIAL_MENU
    } catch { return INITIAL_MENU }
  }

  function loadCatFilters() {
    try {
      const saved = JSON.parse(localStorage.getItem(filtersKey))
      return saved || DEFAULT_CAT_FILTERS
    } catch { return DEFAULT_CAT_FILTERS }
  }

  function loadFiltersEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(enabledKey))
      return saved || {}
    } catch { return {} }
  }

  const [categoryTabs, setCategoryTabs] = useState(loadTabs)
  const [menu, setMenu] = useState(loadMenu)
  const [activeCategory, setActiveCategory] = useState(() => loadTabs()[0]?.key || 'starters')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addDraft, setAddDraft] = useState(BLANK_ITEM)
  const [editFoodCard, setEditFoodCard] = useState(false)
  const [newAddon, setNewAddon] = useState({ label: '', price: '' })
  const [catFilters, setCatFilters] = useState(loadCatFilters)
  const [filtersEnabled, setFiltersEnabled] = useState(loadFiltersEnabled)
  const [activeCatFilter, setActiveCatFilter] = useState(() =>
    Object.fromEntries(loadTabs().map(t => [t.key, 'all']))
  )
  const [hoveredCatId, setHoveredCatId] = useState(null)
  const [showAddCatModal, setShowAddCatModal] = useState(false)
  const [newCat, setNewCat] = useState({ emoji: '', label: '', image: null })
  const [assignModalCat, setAssignModalCat] = useState(null)
  const [assignSearch, setAssignSearch] = useState('')
  const [assignSearchOpen, setAssignSearchOpen] = useState(false)
  const [editIconCat, setEditIconCat] = useState(null)
  const [editIconDraft, setEditIconDraft] = useState({ emoji: '', image: null })
  const [savedAll, setSavedAll] = useState(false)
  const [hasDraftChanges, setHasDraftChanges] = useState(false)
  const [showSectionDropdown, setShowSectionDropdown] = useState(false)
  const [showNewSectionModal, setShowNewSectionModal] = useState(false)
  const [newSectionDraft, setNewSectionDraft] = useState({ label: '', emoji: '🍽️' })
  const saveAllTimer = useRef(null)
  const longPressTimer = useRef(null)
  const catImageInputRef = useRef(null)
  const editIconImageRef = useRef(null)
  const sectionDropdownRef = useRef(null)

  function saveMenu(updated) {
    setMenu(updated)
    setSavedAll(false)
    setHasDraftChanges(true)
  }

  function saveCatFilters(updated) {
    setCatFilters(updated)
    setSavedAll(false)
    setHasDraftChanges(true)
  }

  function saveTabs(updated) {
    setCategoryTabs(updated)
    setSavedAll(false)
    setHasDraftChanges(true)
  }

  function handleSaveAll() {
    localStorage.setItem(storageKey, JSON.stringify(menu))
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(menu) }))
    localStorage.setItem(filtersKey, JSON.stringify(catFilters))
    window.dispatchEvent(new StorageEvent('storage', { key: filtersKey, newValue: JSON.stringify(catFilters) }))
    localStorage.setItem(enabledKey, JSON.stringify(filtersEnabled))
    window.dispatchEvent(new StorageEvent('storage', { key: enabledKey, newValue: JSON.stringify(filtersEnabled) }))
    localStorage.setItem(tabsKey, JSON.stringify(categoryTabs))
    window.dispatchEvent(new StorageEvent('storage', { key: tabsKey, newValue: JSON.stringify(categoryTabs) }))
    showToast('✅ Menu published to website!')
    setSavedAll(true)
    setHasDraftChanges(false)
    clearTimeout(saveAllTimer.current)
    saveAllTimer.current = setTimeout(() => setSavedAll(false), 2500)
  }

  function addSection() {
    if (!newSectionDraft.label.trim()) return
    const key = newSectionDraft.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now()
    const newTab = { key, label: newSectionDraft.label.trim(), emoji: newSectionDraft.emoji || '🍽️' }
    const updatedTabs = [...categoryTabs, newTab]
    const updatedMenu = { ...menu, [key]: [] }
    const updatedFilters = { ...catFilters, [key]: [{ id: 'all', emoji: '🍽️', label: 'All', image: null, assignedItems: [] }] }
    const updatedEnabled = { ...filtersEnabled, [key]: true }
    saveTabs(updatedTabs)
    setMenu(updatedMenu)
    setCatFilters(updatedFilters)
    setFiltersEnabled(updatedEnabled)
    setActiveCatFilter(prev => ({ ...prev, [key]: 'all' }))
    setActiveCategory(key)
    setNewSectionDraft({ label: '', emoji: '🍽️' })
    setShowNewSectionModal(false)
    showToast('✅ Section created! Save changes to publish.')
  }

  function deleteSection(key) {
    if (categoryTabs.length <= 1) { showToast('⚠️ Cannot delete the only section!'); return }
    const updatedTabs = categoryTabs.filter(t => t.key !== key)
    const { [key]: _m, ...updatedMenu } = menu
    const { [key]: _f, ...updatedFilters } = catFilters
    const { [key]: _e, ...updatedEnabled } = filtersEnabled
    saveTabs(updatedTabs)
    setMenu(updatedMenu)
    setCatFilters(updatedFilters)
    setFiltersEnabled(updatedEnabled)
    setActiveCategory(updatedTabs[0].key)
    setShowSectionDropdown(false)
    showToast('🗑️ Section deleted! Save changes to publish.')
  }

  function deleteItem(id) {
    const updated = { ...menu, [activeCategory]: menu[activeCategory].filter(i => i.id !== id) }
    saveMenu(updated)
  }

  function toggleAvailability(id) {
    const updated = {
      ...menu,
      [activeCategory]: menu[activeCategory].map(i =>
        i.id === id ? { ...i, available: i.available === false ? true : false } : i
      ),
    }
    setMenu(updated)
    setSavedAll(false)
    setHasDraftChanges(true)
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
    setMenu(updated)
    setSavedAll(false)
    setHasDraftChanges(true)
    setEditingId(null)
    setEditDraft(null)
  }

  function addItem() {
    if (!addDraft.name.trim()) return
    const item = { id: Date.now(), img: addDraft.img || null, name: addDraft.name.trim(), desc: addDraft.desc.trim(), price: parseFloat(addDraft.price) || 0, tags: addDraft.tags, veg: addDraft.veg || false }
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
    const cat = {
      id: Date.now().toString(),
      emoji: newCat.emoji || '🏷️',
      label: newCat.label.trim(),
      image: newCat.image || null,
      assignedItems: [],
    }
    const updated = { ...catFilters, [activeCategory]: [...catFilters[activeCategory], cat] }
    saveCatFilters(updated)
    setNewCat({ emoji: '', label: '', image: null })
    setShowAddCatModal(false)
  }

  function removeCatFilter(catId) {
    if (catId === 'all') return
    const updated = { ...catFilters, [activeCategory]: catFilters[activeCategory].filter(c => c.id !== catId) }
    saveCatFilters(updated)
    if (activeCatFilter[activeCategory] === catId) {
      setActiveCatFilter(prev => ({ ...prev, [activeCategory]: 'all' }))
    }
  }

  function handleCatImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setNewCat(p => ({ ...p, image: ev.target.result }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function openEditIcon(catId) {
    const cat = (catFilters[activeCategory] || []).find(c => c.id === catId)
    if (!cat) return
    setEditIconDraft({ emoji: cat.emoji || '', image: cat.image || null })
    setEditIconCat(catId)
  }

  function handleLongPressStart(catId) {
    longPressTimer.current = setTimeout(() => openEditIcon(catId), 600)
  }

  function handleLongPressEnd() {
    clearTimeout(longPressTimer.current)
  }

  function handleEditIconImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setEditIconDraft(p => ({ ...p, image: ev.target.result }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function saveEditIcon() {
    const updated = {
      ...catFilters,
      [activeCategory]: catFilters[activeCategory].map(c =>
        c.id === editIconCat
          ? { ...c, emoji: editIconDraft.emoji || c.emoji, image: editIconDraft.image }
          : c
      ),
    }
    saveCatFilters(updated)
    setEditIconCat(null)
  }

  function toggleAssignItem(catId, itemId) {
    const updated = {
      ...catFilters,
      [activeCategory]: catFilters[activeCategory].map(c => {
        if (c.id !== catId) return c
        const assigned = c.assignedItems || []
        const has = assigned.includes(itemId)
        return { ...c, assignedItems: has ? assigned.filter(i => i !== itemId) : [...assigned, itemId] }
      }),
    }
    saveCatFilters(updated)
  }

  const items = menu[activeCategory] || []

  const searchResults = menuSearch.trim()
    ? categoryTabs.flatMap(tab =>
        (menu[tab.key] || [])
          .filter(item =>
            item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
            (item.desc || '').toLowerCase().includes(menuSearch.toLowerCase())
          )
          .map(item => ({ ...item, _sectionKey: tab.key, _sectionLabel: tab.label, _sectionEmoji: tab.emoji }))
      )
    : []

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
            {items.length} item{items.length !== 1 ? 's' : ''} in {categoryTabs.find(c => c.key === activeCategory)?.label}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={handleSaveAll}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 18px',
              background: savedAll
                ? 'rgba(34,197,94,0.12)'
                : hasDraftChanges
                  ? 'rgba(232,50,26,0.08)'
                  : 'rgba(15,23,42,0.07)',
              border: savedAll
                ? '1.5px solid rgba(34,197,94,0.4)'
                : hasDraftChanges
                  ? '1.5px solid rgba(232,50,26,0.45)'
                  : '1.5px solid rgba(15,23,42,0.12)',
              borderRadius: '50px',
              color: savedAll ? '#16a34a' : hasDraftChanges ? '#E8321A' : '#475569',
              fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
            }}
          >
            {savedAll
              ? <><Check size={14} /> SAVED!</>
              : hasDraftChanges
                ? <><span style={{ width: '6px', height: '6px', borderRadius: '3px', background: '#E8321A', display: 'inline-block', flexShrink: 0 }} /><Save size={14} /> SAVE CHANGES</>
                : <><Save size={14} /> SAVE CHANGES</>
            }
          </button>
          <div style={{ position: 'relative' }} ref={sectionDropdownRef}>
            <div style={{ display: 'flex', borderRadius: '50px', overflow: 'hidden', boxShadow: `0 4px 14px ${accentStart}50` }}>
              <button
                onClick={() => { setShowAdd(true); setEditingId(null); setAddDraft(BLANK_ITEM) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 16px',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  border: 'none',
                  color: '#fff', fontSize: '12px', fontWeight: 800, letterSpacing: '0.06em',
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> ADD ITEM
              </button>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <button
                onClick={() => setShowSectionDropdown(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '10px 12px',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  border: 'none',
                  color: '#fff', fontSize: '12px',
                  cursor: 'pointer',
                }}
                title="Section options"
              >
                ▾
              </button>
            </div>
            {showSectionDropdown && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: '#fff', borderRadius: '14px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                border: '1px solid #e2e8f0',
                minWidth: '190px', zIndex: 100,
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => { setShowNewSectionModal(true); setShowSectionDropdown(false) }}
                  style={{
                    width: '100%', padding: '12px 16px', border: 'none', background: 'transparent',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    fontSize: '12px', fontWeight: 700, color: '#0f172a',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Plus size={14} color={accentStart} /> New Section
                </button>
                <div style={{ height: '1px', background: '#f1f5f9' }} />
                <button
                  onClick={() => deleteSection(activeCategory)}
                  style={{
                    width: '100%', padding: '12px 16px', border: 'none', background: 'transparent',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    fontSize: '12px', fontWeight: 700, color: '#EF4444',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Trash2 size={14} color="#EF4444" /> Delete "{categoryTabs.find(t => t.key === activeCategory)?.label}"
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showSectionDropdown && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowSectionDropdown(false)} />
      )}

      {/* New Section Modal */}
      {showNewSectionModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300,
        }} onClick={() => setShowNewSectionModal(false)}>
          <div style={{
            background: '#fff', borderRadius: '24px', padding: '28px',
            width: '90%', maxWidth: '360px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>New Section</h3>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '20px', fontWeight: 500 }}>Add a new menu section (e.g. Desserts, Specials)</p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <input
                value={newSectionDraft.emoji}
                onChange={e => setNewSectionDraft(d => ({ ...d, emoji: e.target.value }))}
                placeholder="🍽️"
                style={{ width: '56px', padding: '10px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '20px', textAlign: 'center', outline: 'none', fontFamily: 'inherit', flexShrink: 0 }}
              />
              <input
                value={newSectionDraft.label}
                onChange={e => setNewSectionDraft(d => ({ ...d, label: e.target.value }))}
                placeholder="Section name *"
                onKeyDown={e => e.key === 'Enter' && addSection()}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 500, color: '#0f172a', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowNewSectionModal(false)} style={{ flex: 1, padding: '11px', background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0', borderRadius: '50px', color: '#94A3B8', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addSection} style={{ flex: 2, padding: '11px', background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`, border: 'none', borderRadius: '50px', color: '#fff', fontSize: '12px', fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer', boxShadow: `0 4px 14px ${accentStart}40` }}>CREATE SECTION</button>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      {showMenuSearch && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
            borderRadius: '16px', padding: '10px 16px',
            border: `1.5px solid ${accentStart}30`,
            boxShadow: `0 4px 20px ${accentStart}10`,
          }}>
            <Search size={16} color={accentStart} style={{ flexShrink: 0 }} />
            <input
              ref={menuSearchRef}
              value={menuSearch}
              onChange={e => setMenuSearch(e.target.value)}
              placeholder="Search items by name or description…"
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: '14px', fontWeight: 500, color: '#0f172a',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            {menuSearch && (
              <button onClick={() => setMenuSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: '#94A3B8' }}>
                <X size={14} />
              </button>
            )}
          </div>

          {menuSearch.trim() && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: '13px', fontWeight: 600 }}>
                  No items match "{menuSearch}"
                </div>
              ) : (
                searchResults.map(item => (
                  <div key={`${item._sectionKey}-${item.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
                    borderRadius: '14px', padding: '12px 14px',
                    border: '1px solid rgba(255,255,255,0.7)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                  }}>
                    {item.img && (
                      <img src={item.img} alt={item.name} style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: '10px', color: '#94A3B8', background: 'rgba(0,0,0,0.04)', borderRadius: '50px', padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {item._sectionEmoji} {item._sectionLabel}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
                        {currency}{item.price}
                        {item.available === false && <span style={{ marginLeft: '6px', color: '#EF4444', fontWeight: 700 }}>• Unavailable</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setActiveCategory(item._sectionKey)
                          setShowMenuSearch(false)
                          setMenuSearch('')
                          setTimeout(() => {
                            setShowAdd(false)
                            startEdit(item)
                          }, 50)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '6px 12px', borderRadius: '50px', border: 'none',
                          background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                          color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        onClick={() => {
                          const updated = { ...menu, [item._sectionKey]: menu[item._sectionKey].filter(i => i.id !== item.id) }
                          saveMenu(updated)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: '30px', height: '30px', borderRadius: '15px', border: 'none',
                          background: '#FEF2F2', color: '#EF4444', cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

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
        {categoryTabs.map(tab => {
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
            Category Filters · {categoryTabs.find(c => c.key === activeCategory)?.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Toggle for enabling/disabling filters per section */}
            <div
              onClick={() => {
                const current = filtersEnabled[activeCategory] !== false
                setFiltersEnabled(prev => ({ ...prev, [activeCategory]: !current }))
                setSavedAll(false)
                setHasDraftChanges(true)
              }}
              title={filtersEnabled[activeCategory] !== false ? 'Disable filters for this section' : 'Enable filters for this section'}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px',
                background: filtersEnabled[activeCategory] !== false ? 'rgba(34,197,94,0.10)' : 'rgba(0,0,0,0.05)',
                border: `1px solid ${filtersEnabled[activeCategory] !== false ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.12)'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                userSelect: 'none',
              }}
            >
              <div style={{
                width: '28px', height: '16px',
                borderRadius: '8px',
                background: filtersEnabled[activeCategory] !== false ? '#22c55e' : '#CBD5E1',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: filtersEnabled[activeCategory] !== false ? '14px' : '2px',
                  width: '12px', height: '12px',
                  borderRadius: '6px',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }} />
              </div>
              <span style={{
                fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em',
                color: filtersEnabled[activeCategory] !== false ? '#16a34a' : '#94A3B8',
                transition: 'color 0.2s',
              }}>
                {filtersEnabled[activeCategory] !== false ? 'ON' : 'OFF'}
              </span>
            </div>
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
        </div>
        <div style={{
          display: 'flex', gap: '10px',
          overflowX: 'auto',
          overflowY: 'visible',
          paddingBottom: '4px',
          paddingTop: '10px',
          paddingRight: '10px',
          scrollbarWidth: 'none',
        }}>
          {(catFilters[activeCategory] || []).map(cat => {
            const isActive = activeCatFilter[activeCategory] === cat.id
            const isHov = hoveredCatId === cat.id
            const assignedCount = (cat.assignedItems || []).length
            return (
              <div
                key={cat.id}
                style={{ position: 'relative', flexShrink: 0 }}
                onMouseEnter={() => setHoveredCatId(cat.id)}
                onMouseLeave={() => { setHoveredCatId(null); handleLongPressEnd() }}
                onMouseDown={() => handleLongPressStart(cat.id)}
                onMouseUp={handleLongPressEnd}
                onTouchStart={() => handleLongPressStart(cat.id)}
                onTouchEnd={handleLongPressEnd}
              >
                <button
                  onClick={() => cat.id !== 'all' ? setAssignModalCat(cat.id) : setActiveCatFilter(prev => ({ ...prev, [activeCategory]: cat.id }))}
                  title={cat.id !== 'all' ? 'Click to assign items • Long press to edit icon' : 'Show all items'}
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
                    userSelect: 'none',
                  }}
                >
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: isActive ? `${accentStart}12` : 'rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px', overflow: 'hidden',
                    position: 'relative',
                  }}>
                    {cat.image
                      ? <img src={cat.image} alt={cat.label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                      : cat.emoji}
                    {isHov && cat.id !== 'all' && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.35)',
                        borderRadius: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px',
                        pointerEvents: 'none',
                      }}>📋</div>
                    )}
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
                {assignedCount > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '28px', right: '-4px',
                    background: accentStart, color: '#fff',
                    fontSize: '9px', fontWeight: 800,
                    width: '16px', height: '16px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #fff',
                    pointerEvents: 'none',
                  }}>
                    {assignedCount}
                  </div>
                )}
                {cat.id !== 'all' && (
                  <button
                    onClick={e => { e.stopPropagation(); removeCatFilter(cat.id) }}
                    onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); removeCatFilter(cat.id) }}
                    style={{
                      position: 'absolute', top: '-8px', right: '-8px',
                      width: '24px', height: '24px',
                      background: '#EF4444', border: '2px solid #fff',
                      borderRadius: '12px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
                      zIndex: 10,
                      touchAction: 'none',
                    }}
                    title="Remove filter"
                  >
                    <X size={11} color="#fff" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Hidden image input for category filter */}
      <input ref={catImageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCatImageUpload} />
      {/* Hidden image input for edit icon */}
      <input ref={editIconImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEditIconImageUpload} />

      {/* Edit Icon Modal */}
      {editIconCat !== null && (() => {
        const cat = (catFilters[activeCategory] || []).find(c => c.id === editIconCat)
        if (!cat) return null
        const previewImage = editIconDraft.image
        const previewEmoji = editIconDraft.emoji || cat.emoji
        return (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 220,
          }} onClick={() => setEditIconCat(null)}>
            <div style={{
              background: '#fff',
              border: '1.5px solid rgba(0,0,0,0.08)',
              borderRadius: '24px',
              padding: '28px',
              width: '340px',
              maxWidth: '92vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px',
                  background: `${accentStart}10`, border: `1.5px solid ${accentStart}25`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '26px', overflow: 'hidden', flexShrink: 0,
                }}>
                  {previewImage
                    ? <img src={previewImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '14px' }} />
                    : previewEmoji}
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Edit Icon</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, marginTop: '2px' }}>"{cat.label}" filter</div>
                </div>
                <button onClick={() => setEditIconCat(null)} style={{ marginLeft: 'auto', background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: '12px', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={14} color="#64748B" />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#94A3B8', marginBottom: '8px' }}>CUSTOM IMAGE</div>
                  {previewImage ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={previewImage} alt="" style={{ width: '52px', height: '52px', borderRadius: '12px', objectFit: 'cover', border: '1.5px solid #e2e8f0', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                        <button type="button" onClick={() => editIconImageRef.current?.click()} style={{ padding: '7px 12px', background: `${accentStart}12`, border: `1.5px solid ${accentStart}30`, borderRadius: '50px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: accentStart }}>CHANGE IMAGE</button>
                        <button type="button" onClick={() => setEditIconDraft(p => ({ ...p, image: null }))} style={{ padding: '6px 12px', background: 'transparent', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: '50px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: '#EF4444' }}>REMOVE IMAGE</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => editIconImageRef.current?.click()}
                      style={{ width: '100%', padding: '14px', background: 'rgba(248,250,252,0.9)', border: '1.5px dashed #CBD5E1', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = accentStart; e.currentTarget.style.background = `${accentStart}08` }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = 'rgba(248,250,252,0.9)' }}
                    >
                      <span style={{ fontSize: '18px' }}>📷</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Upload Image</span>
                    </button>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#94A3B8', marginBottom: '8px' }}>EMOJI (used if no image)</div>
                  <input
                    value={editIconDraft.emoji}
                    onChange={e => setEditIconDraft(p => ({ ...p, emoji: e.target.value }))}
                    placeholder={cat.emoji || '🍽️'}
                    maxLength={4}
                    style={{
                      width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                      background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0',
                      borderRadius: '10px', color: '#0f172a', fontSize: '22px', textAlign: 'center',
                    }}
                  />
                </div>

                {cat.id !== 'all' && (
                  <button
                    onClick={() => { setEditIconCat(null); setAssignModalCat(cat.id) }}
                    style={{
                      padding: '10px', background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0',
                      borderRadius: '10px', color: '#64748B', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}
                  >
                    📋 Assign Menu Items ({(cat.assignedItems || []).length} assigned)
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={() => setEditIconCat(null)} style={{ flex: 1, padding: '11px', background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0', borderRadius: '12px', color: '#64748B', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveEditIcon} style={{ flex: 2, padding: '11px', background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`, border: 'none', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer', boxShadow: `0 4px 14px ${accentStart}40` }}>Save Icon</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Add Category Filter Modal */}
      {showAddCatModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200,
        }} onClick={() => { setShowAddCatModal(false); setNewCat({ emoji: '', label: '', image: null }) }}>
          <div style={{
            background: '#fff',
            borderRadius: '24px',
            padding: '28px',
            width: '360px',
            maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Add Category Filter</h3>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '20px', fontWeight: 500 }}>
              Adding to <span style={{ color: accentStart, fontWeight: 700 }}>{categoryTabs.find(c => c.key === activeCategory)?.label}</span> section
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Image Upload */}
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Filter Image (optional)</label>
                {newCat.image ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={newCat.image} alt="preview" style={{ width: '56px', height: '56px', borderRadius: '14px', objectFit: 'cover', border: '2px solid #e2e8f0', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <button type="button" onClick={() => catImageInputRef.current?.click()} style={{ padding: '7px 12px', background: `${accentStart}12`, border: `1.5px solid ${accentStart}30`, borderRadius: '50px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: accentStart, letterSpacing: '0.06em' }}>CHANGE</button>
                      <button type="button" onClick={() => setNewCat(p => ({ ...p, image: null }))} style={{ padding: '6px 12px', background: 'transparent', border: '1.5px solid #FECACA', borderRadius: '50px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#EF4444' }}>REMOVE</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => catImageInputRef.current?.click()} style={{ width: '100%', padding: '14px', background: 'rgba(248,250,252,0.9)', border: '1.5px dashed #CBD5E1', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = accentStart; e.currentTarget.style.background = `${accentStart}08` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = 'rgba(248,250,252,0.9)' }}
                  >
                    <span style={{ fontSize: '20px' }}>📷</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Upload Filter Image</span>
                  </button>
                )}
              </div>

              {/* Emoji Icon */}
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Emoji Icon {newCat.image ? '(shown if no image)' : ''}</label>
                <input
                  value={newCat.emoji}
                  onChange={e => setNewCat(p => ({ ...p, emoji: e.target.value }))}
                  placeholder="e.g. 🥗"
                  maxLength={4}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '22px', textAlign: 'center', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {/* Category Name */}
              <div>
                <label style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', color: '#64748B', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Category Name</label>
                <input
                  value={newCat.label}
                  onChange={e => setNewCat(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. Organic, Vegan, Spicy..."
                  onKeyDown={e => e.key === 'Enter' && addCatFilter()}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px', background: 'rgba(248,250,252,0.9)', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '13px', fontWeight: 500, color: '#0f172a', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {/* Preview */}
              {newCat.label.trim() && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '10px 8px 8px', width: '72px', background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.06)', borderRadius: '14px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', overflow: 'hidden' }}>
                      {newCat.image
                        ? <img src={newCat.image} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                        : (newCat.emoji || '🏷️')}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#94A3B8', whiteSpace: 'nowrap' }}>{newCat.label}</span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => { setShowAddCatModal(false); setNewCat({ emoji: '', label: '', image: null }) }} style={{ flex: 1, padding: '12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', color: '#64748B', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addCatFilter} style={{ flex: 2, padding: '12px', background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`, border: 'none', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer', boxShadow: `0 4px 14px ${accentStart}40`, opacity: newCat.label.trim() ? 1 : 0.45 }}>Add Filter</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Items Modal (long press) */}
      {assignModalCat && (() => {
        const cat = (catFilters[activeCategory] || []).find(c => c.id === assignModalCat)
        if (!cat) return null
        const sectionItems = menu[activeCategory] || []
        const assigned = cat.assignedItems || []
        const filteredItems = assignSearch.trim()
          ? sectionItems.filter(i => i.name.toLowerCase().includes(assignSearch.toLowerCase()))
          : sectionItems
        const sectionLabel = categoryTabs.find(c => c.key === activeCategory)?.label || activeCategory
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
            onClick={() => { setAssignModalCat(null); setAssignSearch(''); setAssignSearchOpen(false) }}>
            <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: assignSearchOpen ? '12px' : '20px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${accentStart}12`, border: `1.5px solid ${accentStart}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', overflow: 'hidden', flexShrink: 0 }}>
                  {cat.image ? <img src={cat.image} alt={cat.label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} /> : cat.emoji}
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Assign Items to "{cat.label}"</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, marginTop: '2px' }}>
                    {assigned.length} of {sectionItems.length} items assigned · {sectionLabel}
                  </div>
                </div>
                <button onClick={() => { setAssignSearchOpen(o => !o); setAssignSearch('') }} style={{ marginLeft: 'auto', background: assignSearchOpen ? `${accentStart}15` : 'rgba(0,0,0,0.05)', border: 'none', borderRadius: '16px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Search size={15} color={assignSearchOpen ? accentStart : '#64748B'} />
                </button>
                <button onClick={() => { setAssignModalCat(null); setAssignSearch(''); setAssignSearchOpen(false) }} style={{ background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: '16px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={16} color="#64748B" />
                </button>
              </div>
              {assignSearchOpen && (
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    autoFocus
                    value={assignSearch}
                    onChange={e => setAssignSearch(e.target.value)}
                    placeholder={`Search in ${sectionLabel}…`}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '10px 12px 10px 34px',
                      background: 'rgba(248,250,252,0.9)',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '12px', color: '#0f172a', fontSize: '13px',
                      outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = accentStart}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                  {assignSearch && (
                    <button onClick={() => setAssignSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <X size={13} color="#94A3B8" />
                    </button>
                  )}
                </div>
              )}
              {sectionItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8', fontSize: '13px' }}>No items in this section yet.</div>
              ) : filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8', fontSize: '13px' }}>No items match "{assignSearch}"</div>
              ) : (
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {filteredItems.map(item => {
                    const isAssigned = assigned.includes(item.id)
                    return (
                      <button key={item.id} onClick={() => toggleAssignItem(cat.id, item.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: isAssigned ? `${accentStart}08` : 'rgba(248,250,252,0.9)', border: `1.5px solid ${isAssigned ? accentStart + '30' : '#e2e8f0'}`, borderRadius: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', overflow: 'hidden', flexShrink: 0 }}>
                          {item.img && typeof item.img === 'string' && (item.img.startsWith('/') || item.img.startsWith('data:'))
                            ? <img src={item.img} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }} />
                            : (item.img || '🍽️')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{item.name}</div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500 }}>₹{item.price?.toLocaleString('en-IN') || 0}</div>
                        </div>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${isAssigned ? accentStart : '#CBD5E1'}`, background: isAssigned ? accentStart : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                          {isAssigned && <Check size={12} color="#fff" strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <button onClick={() => {
                setAssignModalCat(null)
                localStorage.setItem(filtersKey, JSON.stringify(catFilters))
                window.dispatchEvent(new StorageEvent('storage', { key: filtersKey, newValue: JSON.stringify(catFilters) }))
              }} style={{ marginTop: '16px', padding: '14px', background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`, border: 'none', borderRadius: '14px', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: `0 4px 14px ${accentStart}40` }}>
                Done — {assigned.length} item{assigned.length !== 1 ? 's' : ''} assigned
              </button>
            </div>
          </div>
        )
      })()}

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
            NEW ITEM — {categoryTabs.find(c => c.key === activeCategory)?.label.toUpperCase()}
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
            <button
              type="button"
              onClick={() => setAddDraft(d => ({ ...d, veg: !d.veg }))}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 14px', borderRadius: '50px', cursor: 'pointer',
                background: addDraft.veg ? '#f0fdf4' : '#fff5f5',
                border: `1.5px solid ${addDraft.veg ? '#22c55e' : '#ef4444'}`,
                color: addDraft.veg ? '#16a34a' : '#dc2626',
                fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                transition: 'all 0.2s', alignSelf: 'flex-start',
              }}
            >
              <span style={{
                width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0,
                border: `2px solid ${addDraft.veg ? '#22c55e' : '#ef4444'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '3px',
                  background: addDraft.veg ? '#22c55e' : '#ef4444',
                }} />
              </span>
              {addDraft.veg ? 'VEG' : 'NON-VEG'}
            </button>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: accentStart, letterSpacing: '0.1em' }}>
                    EDITING ITEM
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>UNAVAILABLE</span>
                    <div
                      onClick={() => setEditDraft(d => ({ ...d, available: d.available === false ? true : false }))}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px',
                        background: editDraft.available !== false ? accentStart : '#cbd5e1',
                        position: 'relative', cursor: 'pointer',
                        transition: 'background 0.25s ease',
                        boxShadow: editDraft.available !== false ? `0 0 8px ${accentStart}50` : 'none',
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: '3px',
                        left: editDraft.available !== false ? '20px' : '3px',
                        width: '16px', height: '16px',
                        borderRadius: '8px', background: '#fff',
                        transition: 'left 0.25s ease',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: accentStart, letterSpacing: '0.06em' }}>AVAILABLE</span>
                  </div>
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
                  {/* Price + Veg/Non-Veg row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number" value={editDraft.price} onChange={e => setEditDraft(d => ({ ...d, price: e.target.value }))}
                      style={{ ...inputSt, flex: 1 }}
                      onFocus={e => e.target.style.borderColor = accentStart}
                      onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                    <div
                      onClick={() => setEditDraft(d => ({ ...d, veg: !d.veg }))}
                      style={{
                        display: 'flex', alignItems: 'center',
                        borderRadius: '999px', overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                        border: '1.5px solid #e2e8f0',
                        background: '#f8fafc',
                      }}
                    >
                      <span style={{
                        padding: '7px 14px',
                        background: !editDraft.veg ? '#ef4444' : 'transparent',
                        color: !editDraft.veg ? '#fff' : '#94A3B8',
                        fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em',
                        transition: 'all 0.2s',
                      }}>NON-VEG</span>
                      <span style={{
                        padding: '7px 14px',
                        background: editDraft.veg ? '#22c55e' : 'transparent',
                        color: editDraft.veg ? '#fff' : '#94A3B8',
                        fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em',
                        transition: 'all 0.2s',
                      }}>VEG</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.keys(TAG_COLORS).map(tag => {
                      const active = editDraft.tags.includes(tag)
                      const tc = TAG_COLORS[tag]
                      const isOutlineOnly = tag === 'Vegetarian' || tag === 'Seasonal'
                      return (
                        <button key={tag} onClick={() => toggleTag(editDraft, setEditDraft, tag)} style={{
                          padding: '5px 14px', borderRadius: '999px', cursor: 'pointer',
                          background: active && !isOutlineOnly ? tc.bg : active && isOutlineOnly ? 'rgba(100,116,139,0.08)' : 'transparent',
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
                              width: '22px', height: '22px', borderRadius: '11px', flexShrink: 0,
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
                  <button onClick={() => { setEditingId(null); setEditDraft(null) }} style={{
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
                {/* Availability toggle row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '10px', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: item.available === false ? '#EF4444' : '#22c55e', textTransform: 'uppercase' }}>
                    {item.available === false ? 'Unavailable' : 'Available'}
                  </span>
                  <div
                    onClick={() => toggleAvailability(item.id)}
                    title={item.available === false ? 'Mark as available' : 'Mark as unavailable'}
                    style={{
                      width: '40px', height: '22px', borderRadius: '11px',
                      background: item.available === false ? '#e2e8f0' : `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                      position: 'relative', cursor: 'pointer',
                      transition: 'background 0.25s ease',
                      flexShrink: 0,
                      boxShadow: item.available === false ? 'none' : `0 2px 8px ${accentStart}50`,
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '3px',
                      left: item.available === false ? '3px' : '19px',
                      width: '16px', height: '16px',
                      borderRadius: '8px', background: '#fff',
                      transition: 'left 0.25s ease',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px', opacity: item.available === false ? 0.5 : 1, transition: 'opacity 0.2s' }}>
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

/* ─── Analytics Panel (Customers Tab) ─── */
const WEALTH_DATA = [38, 62, 58, 44, 42, 60, 64, 58, 62, 55, 48, 42]
const CHART_W = 320
const CHART_H = 110
const MIN_V = 35
const MAX_V = 75

function AnalyticsLineChart() {
  const pts = WEALTH_DATA.map((v, i) => [
    (i / (WEALTH_DATA.length - 1)) * CHART_W,
    CHART_H - ((v - MIN_V) / (MAX_V - MIN_V)) * CHART_H,
  ])
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `M ${pts[0][0]},${CHART_H} ` + pts.map(([x, y]) => `L ${x},${y}`).join(' ') + ` L ${pts[pts.length - 1][0]},${CHART_H} Z`
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 6}`} style={{ width: '100%', height: '120px' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8321A" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#E8321A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[35, 55, 75].map((v, i) => {
        const y = CHART_H - ((v - MIN_V) / (MAX_V - MIN_V)) * CHART_H
        return <line key={i} x1={0} y1={y} x2={CHART_W} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
      })}
      <path d={area} fill="url(#ag)" />
      <polyline points={polyline} fill="none" stroke="#E8321A" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke="#E8321A" strokeWidth="2" />)}
    </svg>
  )
}

function AnalyticsDonutChart({ accentStart, segments: propSegments }) {
  const accent = accentStart || '#6C63FF'
  const segments = propSegments && propSegments.length >= 2
    ? propSegments.map((s, i) => ({ ...s, color: i === 0 ? accent : s.color }))
    : [
        { value: 55, color: accent },
        { value: 25, color: '#3d3799' },
        { value: 20, color: '#a5d8f0' },
      ]
  const total = segments.reduce((s, d) => s + d.value, 0)
  const r = 40, cx = 55, cy = 55, sw = 16, circ = 2 * Math.PI * r
  let cum = 0
  return (
    <div style={{ position: 'relative', width: 110, height: 110 }}>
      <svg viewBox="0 0 110 110" width={110} height={110} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circ
          const offset = (cum / total) * circ
          cum += seg.value
          return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={sw} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>rent</span>
      </div>
    </div>
  )
}

const ANALYTICS_PALETTE = [
  { barColor: '#1e293b', iconBg: '#e8eaf5', pctColor: '#0f172a' },
  { barColor: '#0eb5a0', iconBg: '#dff6f3', pctColor: '#0eb5a0' },
  { barColor: '#6C63FF', iconBg: '#ede9fe', pctColor: '#64748b' },
  { barColor: '#f59e0b', iconBg: '#fffbeb', pctColor: '#d97706' },
  { barColor: '#ec4899', iconBg: '#fdf2f8', pctColor: '#db2777' },
  { barColor: '#10b981', iconBg: '#ecfdf5', pctColor: '#059669' },
  { barColor: '#3b82f6', iconBg: '#eff6ff', pctColor: '#2563eb' },
]

function buildCategoryItems(restaurantId) {
  try {
    const tabs = JSON.parse(localStorage.getItem(`exzibo_tabs_${restaurantId}`)) || CATEGORY_TABS
    const menu = JSON.parse(localStorage.getItem(`exzibo_menu_${restaurantId}`)) || {}
    const totalItems = tabs.reduce((sum, t) => sum + (menu[t.key]?.length || 0), 0) || 1
    return tabs.map((tab, i) => {
      const count = menu[tab.key]?.length || 0
      const pct = Math.round((count / totalItems) * 100)
      const value = -(count * 184.9 + i * 111.3).toFixed(2)
      const palette = ANALYTICS_PALETTE[i % ANALYTICS_PALETTE.length]
      return {
        emoji: tab.emoji || '🍽️',
        label: tab.label,
        pct: `${pct}%`,
        pctColor: palette.pctColor,
        value: value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        barColor: palette.barColor,
        barW: `${Math.max(pct, 4)}%`,
        iconBg: palette.iconBg,
      }
    })
  } catch {
    return []
  }
}

function AnalyticsPanel({ accentStart, accentEnd, restaurantId }) {
  const [showSheet, setShowSheet] = React.useState(false)
  const [categoryItems, setCategoryItems] = React.useState(() => buildCategoryItems(restaurantId))

  const { totalWealth, todaysCollection, totalCustomers, totalBookings, categoryData, setRestaurantId } = useAnalytics()

  React.useEffect(() => {
    setRestaurantId(restaurantId)
  }, [restaurantId, setRestaurantId])

  React.useEffect(() => {
    const refresh = () => setCategoryItems(buildCategoryItems(restaurantId))
    window.addEventListener('storage', refresh)
    window.addEventListener('exzibo-data-changed', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('exzibo-data-changed', refresh)
    }
  }, [restaurantId])

  const accent = accentStart || '#6C63FF'
  const accentE = accentEnd || accent
  const card = {
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '20px',
    padding: '18px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)',
    border: '1px solid rgba(255,255,255,0.7)',
  }
  return (
    <>
      <style>{`
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes sheetSlideDown {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(100%); opacity: 0; }
        }
        @keyframes overlayIn  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '14px', animation: 'fadeSlideUp 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 4px 8px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            Analytics Page
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[ABarChart2, ACalendar].map((Icon, i) => (
              <div key={i} style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(226,232,240,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <Icon size={16} color="#64748b" />
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>Overview</span>
            <ABarChart2 size={16} color="#94a3b8" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{totalWealth}</span>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Total wealth</span>
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>75k</div>
          <AnalyticsLineChart />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
            <span>35k</span><span>55k</span><span>75k</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ background: `linear-gradient(135deg, ${accent}, ${accentE})`, borderRadius: '20px', padding: '18px', boxShadow: `0 4px 20px ${accent}40` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.4 }}>Todays<br />Collection</span>
              <AGrid size={15} color="rgba(255,255,255,0.65)" />
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>{todaysCollection}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total in INR.</div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155', lineHeight: 1.4 }}>Total<br />customer</span>
              <AUsers size={16} color="#94a3b8" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', marginBottom: '4px' }}>{totalCustomers.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: accent, fontWeight: 700 }}>+12% this month</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', paddingBottom: '8px' }}>
          <div
            onClick={() => setShowSheet(true)}
            style={{ ...card, display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>Category</span>
              <ACalendar size={15} color="#94a3b8" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AnalyticsDonutChart accentStart={accentStart} segments={categoryData} />
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.4 }}>Total<br />Booking</span>
              <ACalendar size={15} color="#94a3b8" />
            </div>
            <div style={{ fontSize: '40px', fontWeight: 900, color: '#0f172a', lineHeight: 1, marginBottom: '10px' }}>{totalBookings.toLocaleString()}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Bookings this month</div>
          </div>
        </div>
      </div>

      {/* ── Category Bottom Sheet ── */}
      {showSheet && (
        <div
          onClick={() => setShowSheet(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(15,23,42,0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            animation: 'overlayIn 0.2s ease',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '480px',
              background: '#fff',
              borderRadius: '24px 24px 0 0',
              padding: '12px 24px 40px',
              animation: 'sheetSlideUp 0.32s cubic-bezier(0.32,0.72,0,1)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', paddingTop: '4px' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#e2e8f0' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
              {categoryItems.map((item, i) => (
                <div key={i} style={{ paddingBottom: '18px', borderBottom: i < categoryItems.length - 1 ? '1px solid #f1f5f9' : 'none', marginBottom: i < categoryItems.length - 1 ? '18px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                      {item.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{item.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: item.pctColor }}>{item.pct}</span>
                          <span style={{ color: '#cbd5e1', fontSize: '12px' }}>•</span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: item.barColor }}>{item.value}</span>
                        </div>
                      </div>
                      <div style={{ height: '5px', borderRadius: '3px', background: '#f1f5f9', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: item.barW, borderRadius: '3px', background: item.barColor, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ABarChart2({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  )
}
function ACalendar({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function AGrid({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}
function AUsers({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
