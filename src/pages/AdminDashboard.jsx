import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAnalytics, notifyAnalyticsUpdate } from '../context/AnalyticsContext'
import { useRole } from '../context/RoleContext'
import ProfileSlide from '../components/ProfileSlide'
import notificationIconImg from '@assets/image_1777373928129.png'
import {
  NOTIFY_ROLES,
  addNotification,
  getNextPopupForRole,
  confirmNotification,
  markPopupShownThisSession,
  getConfirmedForRole,
  getUnreadCount,
  markBellOpened,
  effectiveRole,
  timeAgo,
} from '../lib/notifications'
import {
  CheckCircle, XCircle,
  ClipboardList, BookOpen, Users, Settings, ArrowLeft, BarChart2,
  Palette, DollarSign, Type, Save, Check, CalendarDays, UtensilsCrossed,
  SlidersHorizontal, Plus, Pencil, Trash2, X, Search, ChevronDown,
  Tag, Info, Share2, Globe, Eye, EyeOff, Send, Bell,
} from 'lucide-react'
import { FaFacebook, FaInstagram, FaLinkedinIn, FaYoutube } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'

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
  confirmed: { label: 'Confirmed', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  preparing: { label: 'Preparing', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  completed: { label: 'Completed', color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0' },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
}

const NAV_ITEMS = [
  { id: 'orders',    icon: ClipboardList, label: 'Orders',    permission: 'orders' },
  { id: 'bookings',  icon: CalendarDays,  label: 'Bookings',  permission: 'bookings' },
  { id: 'menu',      icon: BookOpen,      label: 'Menu',      permission: 'menuEdit' },
  { id: 'customers', icon: BarChart2,     label: 'Analytics', permission: 'analytics' },
  { id: 'settings',  icon: Settings,      label: 'Settings',  permission: 'settings' },
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

function MasterVisibilityToggle({ label, on, onToggle, accentStart, accentEnd }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '14px 18px',
      marginTop: '20px',
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.7)',
      boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px',
          background: on
            ? `linear-gradient(135deg, ${accentStart}22, ${accentEnd}22)`
            : 'rgba(148,163,184,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: on ? accentStart : '#94A3B8',
        }}>
          {on ? <Eye size={15} /> : <EyeOff size={15} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
            {label}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em' }}>
            MASTER CONTROL VIEW ONLY
          </span>
        </div>
      </div>
      <button
        onClick={onToggle}
        aria-label={label}
        style={{
          width: '46px', height: '26px', borderRadius: '50px',
          background: on ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : '#e2e8f0',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background 0.25s ease',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: '3px',
          left: on ? '23px' : '3px',
          width: '20px', height: '20px', borderRadius: '10px',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          transition: 'left 0.25s ease',
          display: 'block',
        }} />
      </button>
    </div>
  )
}

export default function AdminDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromMaster = searchParams.get('from') === 'master'
  const isDefault = !id || id === 'default'
  const { hasPermission, activeRole } = useRole()

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
  const [cancelTarget, setCancelTarget] = useState(null)

  const [masterMsgOpen, setMasterMsgOpen] = useState(false)
  const [masterMsgTopic, setMasterMsgTopic] = useState('')
  const [masterMsgBody, setMasterMsgBody]   = useState('')
  const [masterMsgTargets, setMasterMsgTargets] = useState(['admin', 'manager', 'staff'])

  const [activePopup, setActivePopup] = useState(null)
  const [bellOpen, setBellOpen]       = useState(false)
  const [bellItems, setBellItems]     = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const MASTER_SHOW_ORDERS_KEY   = 'exzibo_master_show_live_orders'
  const MASTER_SHOW_BOOKINGS_KEY = 'exzibo_master_show_table_confirmations'
  const [masterShowOrders, setMasterShowOrders] = useState(() => {
    const v = localStorage.getItem(MASTER_SHOW_ORDERS_KEY)
    return v === null ? true : v === 'true'
  })
  const [masterShowBookings, setMasterShowBookings] = useState(() => {
    const v = localStorage.getItem(MASTER_SHOW_BOOKINGS_KEY)
    return v === null ? true : v === 'true'
  })
  function toggleMasterShowOrders() {
    setMasterShowOrders(prev => {
      const next = !prev
      localStorage.setItem(MASTER_SHOW_ORDERS_KEY, String(next))
      return next
    })
  }
  function toggleMasterShowBookings() {
    setMasterShowBookings(prev => {
      const next = !prev
      localStorage.setItem(MASTER_SHOW_BOOKINGS_KEY, String(next))
      return next
    })
  }

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
  const [profileOpen, setProfileOpen] = useState(false)
  const [overrideName, setOverrideName] = useState('')
  const [logoUrl, setLogoUrl] = useState(() => {
    if (!id || id === 'default') return localStorage.getItem('exzibo_logo_default') || ''
    try {
      const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
      return all.find(r => r.id === id)?.logo || ''
    } catch { return '' }
  })

  const visibleNavItems = NAV_ITEMS.filter(item => hasPermission(item.permission))

  useEffect(() => {
    if (visibleNavItems.length > 0 && !visibleNavItems.find(item => item.id === activeNav)) {
      setActiveNav(visibleNavItems[0].id)
    }
  }, [activeNav, visibleNavItems.map(i => i.id).join(',')])

  function loadBookings(restaurantId) {
    const key = `exzibo_bookings_${restaurantId}`
    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
  }

  function loadOrders(restaurantId) {
    const key = `exzibo_orders_${restaurantId}`
    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
  }

  const STALE_ORDER_EXPIRY_MS = 12 * 60 * 60 * 1000 // 12 hours

  function filterStaleOrders(orderList) {
    const now = Date.now()
    return orderList.filter(o => {
      if (o.status !== 'confirmed' && o.status !== 'cancelled') return true
      const ts = o.createdAt || o.submittedAt
      if (!ts) return true // no timestamp → keep
      return (now - new Date(ts).getTime()) < STALE_ORDER_EXPIRY_MS
    })
  }

  function cleanAndPersistOrders(restaurantId) {
    const raw = loadOrders(restaurantId)
    const cleaned = filterStaleOrders(raw)
    if (cleaned.length !== raw.length) {
      const key = `exzibo_orders_${restaurantId}`
      localStorage.setItem(key, JSON.stringify(cleaned))
      notifyAnalyticsUpdate()
    }
    return cleaned
  }

  useEffect(() => {
    if (isDefault) {
      setOrders(cleanAndPersistOrders('demo'))
      setBookings(loadBookings('demo'))
      return
    }
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = all.find(r => r.id === id)
    if (!found) { navigate('/restaurants'); return }
    setRestaurant(found)
    setOrders(cleanAndPersistOrders(found.id))
    setBookings(loadBookings(found.id))
  }, [id])

  useEffect(() => {
    function refreshData() {
      const restaurantId = isDefault ? 'demo' : id
      setOrders(cleanAndPersistOrders(restaurantId))
      setBookings(loadBookings(restaurantId))
    }
    function handleLogoChanged(e) {
      const { restaurantId: changedId, logo } = e.detail || {}
      const myId = isDefault ? 'default' : id
      if (changedId === myId || (isDefault && changedId === 'default')) {
        setLogoUrl(logo || '')
      }
    }
    function handleNameChanged(e) {
      const { restaurantId: changedId, name } = e.detail || {}
      const myId = isDefault ? 'default' : id
      if (changedId === myId) {
        setOverrideName(name || '')
        if (!isDefault) setRestaurant(prev => prev ? { ...prev, name: name || '' } : prev)
      }
    }
    function handleContactChanged(e) {
      const { restaurantId: changedId, phone, email } = e.detail || {}
      const myId = isDefault ? 'default' : id
      if (changedId === myId) {
        setRestaurant(prev => prev ? { ...prev, phone: phone ?? prev.phone, email: email ?? prev.email } : prev)
      }
    }
    function handleLocationChanged(e) {
      const { restaurantId: changedId, location } = e.detail || {}
      const myId = isDefault ? 'default' : id
      if (changedId === myId) {
        setRestaurant(prev => prev ? { ...prev, location: location ?? prev.location } : prev)
      }
    }
    window.addEventListener('storage', refreshData)
    window.addEventListener('exzibo-data-changed', refreshData)
    window.addEventListener('exzibo-logo-changed', handleLogoChanged)
    window.addEventListener('exzibo-name-changed', handleNameChanged)
    window.addEventListener('exzibo-contact-changed', handleContactChanged)
    window.addEventListener('exzibo-location-changed', handleLocationChanged)
    return () => {
      window.removeEventListener('storage', refreshData)
      window.removeEventListener('exzibo-data-changed', refreshData)
      window.removeEventListener('exzibo-logo-changed', handleLogoChanged)
      window.removeEventListener('exzibo-name-changed', handleNameChanged)
      window.removeEventListener('exzibo-contact-changed', handleContactChanged)
      window.removeEventListener('exzibo-location-changed', handleLocationChanged)
    }
  }, [id, isDefault])

  // Hourly background cleanup of stale confirmed/cancelled orders
  useEffect(() => {
    const restaurantId = isDefault ? 'demo' : id
    const intervalId = setInterval(() => {
      setOrders(cleanAndPersistOrders(restaurantId))
    }, 60 * 60 * 1000)
    return () => clearInterval(intervalId)
  }, [id, isDefault])

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

  // ── Notification system ─────────────────────────────────────────
  function refreshBellState() {
    if (fromMaster) return
    setBellItems(getConfirmedForRole(activeRole))
    setUnreadCount(getUnreadCount(activeRole))
  }

  function checkPopup() {
    if (fromMaster) return
    const next = getNextPopupForRole(activeRole)
    if (next) setActivePopup(next)
  }

  useEffect(() => {
    if (fromMaster) {
      setActivePopup(null)
      return
    }
    refreshBellState()
    checkPopup()
    function onChange() {
      refreshBellState()
      if (!activePopup) checkPopup()
    }
    window.addEventListener('exzibo-notifications-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('exzibo-notifications-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [fromMaster, activeRole])

  function handleSendMasterMessage() {
    const created = addNotification({
      title: masterMsgTopic,
      message: masterMsgBody,
      target_roles: masterMsgTargets,
    })
    if (!created) return
    setMasterMsgOpen(false)
    setMasterMsgTopic('')
    setMasterMsgBody('')
    setMasterMsgTargets(['admin', 'manager', 'staff'])
    showToast('✅ Notification sent')
  }

  function handlePopupConfirm() {
    if (!activePopup) return
    confirmNotification(activePopup.id, activeRole)
    markPopupShownThisSession(activePopup.id)
    setActivePopup(null)
    refreshBellState()
  }

  function handlePopupClose() {
    if (!activePopup) return
    markPopupShownThisSession(activePopup.id)
    setActivePopup(null)
  }

  function openBell() {
    setBellOpen(true)
    markBellOpened(activeRole)
    setUnreadCount(0)
  }
  // ────────────────────────────────────────────────────────────────

  const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'preparing').length

  const todayStr = new Date().toISOString().slice(0, 10)
  const filteredBookings = bookings.filter(b => {
    if (bookingFilter === 'today')    return b.date === todayStr
    if (bookingFilter === 'upcoming') return b.date > todayStr && b.status !== 'cancelled'
    return true
  })
  const accentStart = globalConfig.accentColor
  const accentEnd   = globalConfig.accentColorEnd

  function persistOrders(updatedOrders) {
    const restaurantId = isDefault ? 'demo' : id
    const key = `exzibo_orders_${restaurantId}`
    localStorage.setItem(key, JSON.stringify(updatedOrders))
    notifyAnalyticsUpdate()
  }

  function confirmOrder(orderId) {
    setOrders(prev => {
      const updated = prev.map(o => {
        if (o.id !== orderId) return o
        const next = o.status === 'pending' ? 'confirmed' : o.status === 'preparing' ? 'confirmed' : o.status
        showToast('✅ Order Confirmed!')
        return { ...o, status: next }
      })
      persistOrders(updated)
      return updated
    })
  }

  function cancelOrder(orderId) {
    setOrders(prev => {
      const updated = prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o)
      persistOrders(updated)
      return updated
    })
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

  const displayName = fromMaster
    ? 'Master Control'
    : (overrideName || (isDefault ? globalConfig.adminTitle : (restaurant?.name || 'Admin')))

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
        @keyframes slideUpModal {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
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

      {/* Cancel Confirmation Modal */}
      {cancelTarget && (() => {
        const targetOrder = orders.find(o => o.id === cancelTarget)
        const itemCount = targetOrder?.items?.reduce((s, i) => s + (i.qty || 1), 0) ?? 0
        const total = targetOrder?.grandTotal ?? targetOrder?.items?.reduce((s, i) => s + (i.price * (i.qty || 1)), 0) ?? 0
        return (
          <div
            onClick={() => setCancelTarget(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center',
              background: 'rgba(0,0,0,0.48)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: '24px 24px 0 0',
                padding: '12px 24px 40px',
                width: '100%', maxWidth: '480px',
                animation: 'slideUpModal 0.28s cubic-bezier(0.34,1.1,0.64,1)',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
              }}
            >
              {/* Drag handle */}
              <div style={{ width: '40px', height: '4px', background: '#e2e8f0', borderRadius: '2px', margin: '0 auto 24px' }} />

              {/* Icon */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '30px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <XCircle size={30} color="#EF4444" />
                </div>
              </div>

              {/* Heading */}
              <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '20px', color: '#0f172a', marginBottom: '8px' }}>
                Cancel this order?
              </div>
              <div style={{ textAlign: 'center', fontSize: '14px', color: '#64748B', marginBottom: '24px', fontWeight: 500 }}>
                {itemCount} item{itemCount !== 1 ? 's' : ''} · ₹{total.toLocaleString('en-IN')}
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: '#f1f5f9', marginBottom: '20px' }} />

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setCancelTarget(null)}
                  style={{
                    flex: 1, padding: '14px', borderRadius: '16px',
                    background: '#f1f5f9', border: 'none',
                    color: '#374151', fontSize: '14px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  No, Keep it
                </button>
                <button
                  onClick={() => { cancelOrder(cancelTarget); setCancelTarget(null) }}
                  style={{
                    flex: 2, padding: '14px', borderRadius: '16px',
                    background: '#EF4444', border: 'none',
                    color: '#fff', fontSize: '14px', fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 6px 20px rgba(239,68,68,0.35)',
                    letterSpacing: '0.01em',
                  }}
                >
                  Yes, Cancel Order ✕
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <button
              onClick={() => isDefault ? navigate('/') : navigate('/restaurants')}
              style={{
                width: '38px', height: '38px', borderRadius: '12px',
                background: `${accentStart}18`,
                border: `1px solid ${accentStart}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: accentStart, flexShrink: 0,
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div
              onClick={() => hasPermission('profile') && setProfileOpen(true)}
              style={{
                width: '44px', height: '44px', borderRadius: '14px',
                background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 12px ${accentStart}50`,
                fontSize: '16px', fontWeight: 900, color: '#fff',
                cursor: hasPermission('profile') ? 'pointer' : 'default',
                transition: 'transform 0.15s, box-shadow 0.15s',
                overflow: 'hidden',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.07)'
                e.currentTarget.style.boxShadow = `0 6px 18px ${accentStart}70`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = `0 4px 12px ${accentStart}50`
              }}
            >
              {logoUrl
                ? <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                minWidth: 0,
              }}>
                <span
                  title={displayName}
                  style={{
                    fontSize: '17px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em',
                    minWidth: 0,
                    flex: '0 1 auto',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {displayName}
                </span>
                {isDefault && (
                  <span style={{
                    fontSize: '9px', fontWeight: 700,
                    letterSpacing: '0.1em', color: accentStart,
                    background: `${accentStart}15`, borderRadius: '6px',
                    padding: '2px 7px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}>
                    TEMPLATE
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: accentStart, letterSpacing: '0.1em' }}>
                {activeRole ? activeRole.toUpperCase() : 'ADMIN'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            {!fromMaster && (
              <button
                type="button"
                aria-label="Notifications"
                onClick={openBell}
                style={{
                  position: 'relative',
                  width: '42px', height: '42px', borderRadius: '13px',
                  background: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.6)',
                  boxShadow: '4px 4px 10px rgba(0,0,0,0.08), -2px -2px 8px rgba(255,255,255,0.9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                  transition: 'all 0.2s ease',
                  padding: 0,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = accentStart
                  e.currentTarget.style.borderColor = `${accentStart}40`
                  e.currentTarget.style.boxShadow = `0 0 0 1.5px ${accentStart}30, 4px 4px 10px rgba(0,0,0,0.08)`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#64748b'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'
                  e.currentTarget.style.boxShadow = '4px 4px 10px rgba(0,0,0,0.08), -2px -2px 8px rgba(255,255,255,0.9)'
                }}
              >
                <Bell size={18} strokeWidth={2.1} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px', right: '-4px',
                    minWidth: '18px', height: '18px',
                    padding: '0 5px',
                    borderRadius: '9px',
                    background: '#EF4444',
                    color: '#fff',
                    fontSize: '10px', fontWeight: 800,
                    lineHeight: '18px',
                    textAlign: 'center',
                    boxShadow: '0 2px 6px rgba(239,68,68,0.5), 0 0 0 2px #fff',
                    pointerEvents: 'none',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            {fromMaster && (
              <button
                type="button"
                aria-label="Send message"
                onClick={() => { setMasterMsgTopic(''); setMasterMsgBody(''); setMasterMsgTargets(['admin','manager','staff']); setMasterMsgOpen(true) }}
                style={{
                  width: '52px', height: '32px', borderRadius: '10px',
                  background: '#0A0A0A',
                  border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(10,10,10,0.25)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  padding: 0,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(10,10,10,0.35)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(10,10,10,0.25)'
                }}
              >
                <Send size={15} color="#fff" strokeWidth={2.2} style={{ transform: 'translateX(-1px)' }} />
              </button>
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
            restaurantId={isDefault ? 'demo' : id}
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
            {/* Master Control: Show Live Orders toggle */}
            {fromMaster && (
              <MasterVisibilityToggle
                label="Show Live Orders"
                on={masterShowOrders}
                onToggle={toggleMasterShowOrders}
                accentStart={accentStart}
                accentEnd={accentEnd}
              />
            )}

            {/* Title bar - Orders */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 4px 16px',
            }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Orders
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeRole !== 'manager' && activeRole !== 'staff' && (
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
            {fromMaster && !masterShowOrders ? (
              <div style={{
                textAlign: 'center', padding: '48px 24px',
                color: '#94A3B8', fontSize: '13px', fontWeight: 600,
                background: 'rgba(255,255,255,0.55)',
                borderRadius: '18px',
                border: '1px dashed rgba(148,163,184,0.4)',
              }}>
                Live orders are hidden in Master Control. They remain visible in Admin, Manager and Staff panels.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {orders.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '48px 24px',
                    color: '#94A3B8', fontSize: '14px', fontWeight: 600,
                  }}>
                    No orders yet. Orders placed from your restaurant page will appear here.
                  </div>
                ) : orders.map((order, i) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    index={i}
                    accentStart={accentStart}
                    currency={globalConfig.currency}
                    onConfirm={() => confirmOrder(order.id)}
                    onCancel={() => setCancelTarget(order.id)}
                    orderSettings={orderSettings}
                  />
                ))}
              </div>
            )}
          </>
        ) : activeNav === 'bookings' ? (
          <>
            {/* Master Control: Show Table Confirmations toggle */}
            {fromMaster && (
              <MasterVisibilityToggle
                label="Show Table Confirmations"
                on={masterShowBookings}
                onToggle={toggleMasterShowBookings}
                accentStart={accentStart}
                accentEnd={accentEnd}
              />
            )}

            {/* Title bar - Bookings */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 4px 16px',
            }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Bookings
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeRole !== 'manager' && activeRole !== 'staff' && (
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
            {fromMaster && !masterShowBookings ? (
              <div style={{
                textAlign: 'center', padding: '48px 24px',
                color: '#94A3B8', fontSize: '13px', fontWeight: 600,
                background: 'rgba(255,255,255,0.55)',
                borderRadius: '18px',
                border: '1px dashed rgba(148,163,184,0.4)',
              }}>
                Table confirmations are hidden in Master Control. They remain visible in Admin, Manager and Staff panels.
              </div>
            ) : (
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
            )}
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
        {visibleNavItems.map(item => {
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

      <ProfileSlide
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        restaurantId={isDefault ? 'default' : id}
        logoUrl={logoUrl}
        onLogoUpdate={url => setLogoUrl(url)}
        restaurantName={displayName}
        onNameUpdate={name => setOverrideName(name)}
        onTeamClick={() => { setProfileOpen(false); navigate(`/admin/${id || 'default'}/team`) }}
      />

      {fromMaster && masterMsgOpen && (
        <MasterMessageModal
          topic={masterMsgTopic}
          body={masterMsgBody}
          targets={masterMsgTargets}
          onTopicChange={setMasterMsgTopic}
          onBodyChange={setMasterMsgBody}
          onTargetsChange={setMasterMsgTargets}
          onSend={handleSendMasterMessage}
          onClose={() => setMasterMsgOpen(false)}
          accentStart={accentStart}
          accentEnd={accentEnd}
        />
      )}

      {!fromMaster && activePopup && (
        <NotificationPopup
          notification={activePopup}
          onConfirm={handlePopupConfirm}
          onClose={handlePopupClose}
        />
      )}

      {!fromMaster && bellOpen && (
        <NotificationCenter
          items={bellItems}
          onClose={() => setBellOpen(false)}
          accentStart={accentStart}
          accentEnd={accentEnd}
          role={effectiveRole(activeRole)}
        />
      )}
    </div>
  )
}

function NotificationPopup({ notification, onConfirm, onClose }) {
  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const PURPLE_DEEP    = '#3D1F8C'
  const PURPLE_PRIMARY = '#5B2D8E'
  const LAVENDER_BG    = '#F0EEFA'

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New notification"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(15,15,20,0.6)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        animation: 'notifPopupBackdropIn 0.2s ease',
      }}
    >
      <style>{`
        @keyframes notifPopupBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes notifPopupCardIn {
          from { opacity: 0; transform: translateY(14px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#fff',
          borderRadius: '20px',
          padding: '28px',
          boxSizing: 'border-box',
          position: 'relative',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4), 0 6px 20px rgba(0,0,0,0.12)',
          fontFamily: "'Inter', 'Poppins', system-ui, sans-serif",
          animation: 'notifPopupCardIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px', right: '14px',
            width: '32px', height: '32px', borderRadius: '999px',
            background: 'rgba(15,23,42,0.08)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(15,23,42,0.14)'; e.currentTarget.style.color = '#0f172a' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(15,23,42,0.08)'; e.currentTarget.style.color = '#64748b' }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src={notificationIconImg}
            alt=""
            style={{ width: '52px', height: '52px', flexShrink: 0, display: 'block', borderRadius: '999px', objectFit: 'cover' }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '11px', fontWeight: 800,
              color: PURPLE_PRIMARY, letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}>
              New Notification
            </div>
            <div style={{
              fontSize: '20px', fontWeight: 900,
              color: '#0f172a',
              letterSpacing: '-0.01em',
              marginTop: '2px',
              wordBreak: 'break-word',
              textTransform: 'uppercase',
            }}>
              {notification.title}
            </div>
          </div>
        </div>

        <div style={{
          height: '1px',
          background: 'rgba(15,23,42,0.08)',
          margin: '20px 0 18px',
        }} />

        <div style={{
          position: 'relative',
          background: LAVENDER_BG,
          borderRadius: '14px',
          padding: '18px 20px',
          overflow: 'hidden',
        }}>
          <div style={{
            fontSize: '13px', fontWeight: 800,
            color: PURPLE_PRIMARY,
            marginBottom: '8px',
          }}>
            Message:
          </div>
          <div style={{
            fontSize: '14px',
            color: '#1e293b',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            position: 'relative',
            zIndex: 1,
            paddingRight: '92px',
          }}>
            {notification.message}
          </div>
          <div style={{
            position: 'absolute',
            right: '-6px', bottom: '-10px',
            opacity: 0.18,
            color: PURPLE_PRIMARY,
            pointerEvents: 'none',
          }}>
            <StorefrontIcon size={104} />
          </div>
        </div>

        <button
          type="button"
          onClick={onConfirm}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '15px 18px',
            borderRadius: '999px',
            border: 'none',
            cursor: 'pointer',
            background: PURPLE_DEEP,
            color: '#fff',
            fontSize: '14px', fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            boxShadow: `0 10px 28px ${PURPLE_DEEP}66`,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 14px 32px ${PURPLE_DEEP}80` }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = `0 10px 28px ${PURPLE_DEEP}66` }}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}

function ChatBubbleIcon({ color = '#fff', size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function StorefrontIcon({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* Fork & spoon emblem on top */}
      <circle cx="58" cy="11" r="8" />
      <path d="M54 6 v10" />
      <path d="M52 6 v3 M56 6 v3" />
      <path d="M62 6 v10" />
      <ellipse cx="62" cy="8" rx="1.6" ry="2.4" />

      {/* Awning */}
      <path d="M22 30 H82 V42" />
      <path d="M22 30 V42" />
      <path d="M22 42 q3 5 6 0 q3 5 6 0 q3 5 6 0 q3 5 6 0 q3 5 6 0 q3 5 6 0 q3 5 6 0 q3 5 6 0 q3 5 6 0 q3 5 6 0" />
      {/* Awning vertical stripes */}
      <path d="M30 30 L34 42" />
      <path d="M40 30 L44 42" />
      <path d="M50 30 L54 42" />
      <path d="M60 30 L64 42" />
      <path d="M70 30 L74 42" />

      {/* Building walls */}
      <path d="M26 50 V90 H78 V50" />
      <path d="M26 50 H78" />

      {/* Arched door */}
      <path d="M44 90 V66 a8 8 0 0 1 16 0 V90" />
      {/* Door handle */}
      <circle cx="56" cy="78" r="1.4" />

      {/* Window on the right */}
      <rect x="66" y="62" width="8" height="8" rx="1" />

      {/* Potted plant on the left */}
      <path d="M10 90 L13 80 H21 L24 90 Z" />
      <path d="M17 80 q-4 -10 0 -18" />
      <path d="M14 76 q-3 -2 -3 -8 q4 1 5 6" />
      <path d="M20 76 q3 -2 3 -8 q-4 1 -5 6" />
    </svg>
  )
}

function NotificationCenter({ items, onClose, accentStart, accentEnd, role }) {
  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(15,15,20,0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '80px 16px 24px',
        animation: 'notifPopupBackdropIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          maxHeight: '70vh',
          background: '#fff',
          borderRadius: '20px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35), 0 6px 20px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', 'Poppins', system-ui, sans-serif",
          animation: 'notifPopupCardIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '11px',
              background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${accentStart}55`,
              color: '#fff',
            }}>
              <Bell size={16} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                Notifications
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {role} · last 24 hours
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(15,23,42,0.05)',
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(15,23,42,0.10)'; e.currentTarget.style.color = '#0f172a' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(15,23,42,0.05)'; e.currentTarget.style.color = '#64748b' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: items.length === 0 ? '0' : '8px 0' }}>
          {items.length === 0 ? (
            <div style={{
              padding: '40px 24px',
              textAlign: 'center',
              color: '#94A3B8',
              fontSize: '13px',
              fontWeight: 600,
            }}>
              No notifications yet.<br />
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#cbd5e1' }}>
                Confirmed alerts from the last 24 hours will appear here.
              </span>
            </div>
          ) : items.map(item => (
            <div key={item.id} style={{
              padding: '14px 20px',
              borderTop: '1px solid rgba(15,23,42,0.04)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px',
                marginBottom: '4px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {timeAgo(item.created_at)}
                </div>
              </div>
              <div style={{
                fontSize: '13px', color: '#475569', lineHeight: 1.55,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MasterMessageModal({ topic, body, targets = [], onTopicChange, onBodyChange, onTargetsChange, onSend, onClose, accentStart, accentEnd }) {
  const ROLE_OPTIONS = [
    { key: 'admin',   label: 'Admin' },
    { key: 'manager', label: 'Manager' },
    { key: 'staff',   label: 'Staff' },
  ]
  const toggleRole = (role) => {
    if (!onTargetsChange) return
    onTargetsChange(targets.includes(role) ? targets.filter(r => r !== role) : [...targets, role])
  }
  const canSend = topic.trim().length > 0 && body.trim().length > 0 && targets.length > 0
  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Send message"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(10,10,12,0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        animation: 'masterModalBackdropIn 0.2s ease',
      }}
    >
      <style>{`
        @keyframes masterModalBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes masterModalCardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#fff',
          borderRadius: '22px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35), 0 6px 20px rgba(0,0,0,0.12)',
          padding: '24px 22px 22px',
          position: 'relative',
          fontFamily: "'Inter', 'Poppins', system-ui, sans-serif",
          animation: 'masterModalCardIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px', right: '14px',
            width: '32px', height: '32px', borderRadius: '10px',
            background: 'rgba(15,23,42,0.05)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(15,23,42,0.10)'; e.currentTarget.style.color = '#0f172a' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(15,23,42,0.05)'; e.currentTarget.style.color = '#64748b' }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '11px',
            background: '#0A0A0A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(10,10,10,0.25)',
          }}>
            <Send size={15} color="#fff" strokeWidth={2.2} style={{ transform: 'translateX(-1px)' }} />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
              New Message
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em' }}>
              MASTER CONTROL
            </div>
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px', fontWeight: 800,
            color: '#64748b', letterSpacing: '0.12em',
            marginBottom: '8px',
          }}>
            TOPIC
          </label>
          <input
            autoFocus
            value={topic}
            onChange={e => onTopicChange(e.target.value)}
            placeholder="Enter a topic…"
            style={{
              width: '100%',
              background: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: '12px',
              padding: '12px 14px',
              color: '#0f172a',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = accentStart; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentStart}22` }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        <div style={{ marginTop: '14px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px', fontWeight: 800,
            color: '#64748b', letterSpacing: '0.12em',
            marginBottom: '8px',
          }}>
            MESSAGE
          </label>
          <textarea
            value={body}
            onChange={e => onBodyChange(e.target.value)}
            placeholder="Write your message…"
            rows={5}
            style={{
              width: '100%',
              background: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: '12px',
              padding: '12px 14px',
              color: '#0f172a',
              fontSize: '14px',
              fontWeight: 500,
              lineHeight: 1.55,
              fontFamily: 'inherit',
              outline: 'none',
              resize: 'vertical',
              minHeight: '110px',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = accentStart; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentStart}22` }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        <div style={{ marginTop: '14px' }}>
          <label style={{
            display: 'block',
            fontSize: '11px', fontWeight: 800,
            color: '#64748b', letterSpacing: '0.12em',
            marginBottom: '8px',
          }}>
            SEND TO
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ROLE_OPTIONS.map(opt => {
              const checked = targets.includes(opt.key)
              return (
                <label
                  key={opt.key}
                  style={{
                    flex: '1 1 0',
                    minWidth: '90px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: `1.5px solid ${checked ? accentStart : '#E2E8F0'}`,
                    background: checked ? `${accentStart}10` : '#F8FAFC',
                    color: checked ? accentStart : '#475569',
                    fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRole(opt.key)}
                    style={{
                      width: '15px', height: '15px',
                      accentColor: accentStart,
                      cursor: 'pointer',
                      margin: 0,
                    }}
                  />
                  {opt.label}
                </label>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => { if (canSend && onSend) onSend() }}
          disabled={!canSend}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '13px 18px',
            borderRadius: '14px',
            border: 'none',
            cursor: canSend ? 'pointer' : 'not-allowed',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            background: canSend ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : '#CBD5E1',
            boxShadow: canSend ? `0 8px 22px ${accentStart}55` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            opacity: canSend ? 1 : 0.85,
          }}
          onMouseEnter={e => { if (!canSend) return; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 12px 28px ${accentStart}66` }}
          onMouseLeave={e => { if (!canSend) return; e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = `0 8px 22px ${accentStart}55` }}
        >
          <Send size={14} strokeWidth={2.4} style={{ transform: 'translateX(-1px)' }} />
          Send
        </button>
      </div>
    </div>
  )
}

/* ─── Create Coupon Modal ─── */
function CreateCouponModal({ onClose, coupons = [], onCreateCoupon, onDeleteCoupon, onToggleCoupon }) {
  const todayISO = new Date().toISOString().split('T')[0]
  const nextYearISO = (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]
  })()

  const [view, setView] = useState('form')
  const [couponCode, setCouponCode] = useState('')
  const [discountType, setDiscountType] = useState('Fixed Amount')
  const [discountAmount, setDiscountAmount] = useState('10')
  const [minimumOrderValue, setMinimumOrderValue] = useState('')
  const [validFrom, setValidFrom] = useState(todayISO)
  const [expireDate, setExpireDate] = useState(nextYearISO)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [deleteToast, setDeleteToast] = useState(false)

  const PREFIXES = ['SAVE', 'OFF', 'DEAL', 'GET', 'WIN', 'USE', 'BIG', 'FUN']
  const generateCode = () => {
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)]
    const num = Math.floor(10 + Math.random() * 90)
    setCouponCode(`${prefix}${num}`)
  }

  const fmtDisplay = iso => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${m}/${d}/${y}`
  }

  const isCouponActive = c => c.active !== false && (!c.expireDate || new Date(c.expireDate) >= new Date(todayISO))

  const handleCreate = () => {
    if (!couponCode.trim()) return
    const newCoupon = {
      id: Date.now(),
      code: couponCode.trim().toUpperCase(),
      discountType,
      discountAmount,
      minimumOrderValue: minimumOrderValue ? parseFloat(minimumOrderValue) : 0,
      validFrom,
      expireDate,
    }
    onCreateCoupon(newCoupon)
    onClose()
  }

  const handleConfirmDelete = () => {
    if (pendingDeleteId == null) return
    onDeleteCoupon(pendingDeleteId)
    setPendingDeleteId(null)
    setDeleteToast(true)
    setTimeout(() => setDeleteToast(false), 2500)
  }

  const baseInput = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 14px',
    background: '#fff',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px', color: '#0f172a',
    outline: 'none', fontFamily: 'inherit',
  }

  const label = (text, required, upper) => (
    <div style={{
      fontSize: '12px', fontWeight: 600, marginBottom: '6px',
      color: upper ? '#0f172a' : '#64748b',
      textTransform: upper ? 'uppercase' : 'none',
      letterSpacing: upper ? '0.04em' : '0.01em',
    }}>
      {text}{required && <span style={{ color: '#EF4444', marginLeft: '3px' }}>*</span>}
    </div>
  )

  const last6 = [...coupons].reverse().slice(0, 6)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.3)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        width: '100%', maxWidth: '420px',
        padding: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
        position: 'relative',
      }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={view === 'history' ? () => setView('form') : onClose}
              style={{
                width: '34px', height: '34px', borderRadius: '50%',
                background: '#EFF6FF', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#2E5BFF',
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <span style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
              {view === 'history' ? 'Coupon History' : 'Create New Coupon'}
            </span>
          </div>
          {view === 'form' && (
            <button
              onClick={() => setView('history')}
              style={{
                background: '#2E5BFF', border: 'none', borderRadius: '10px',
                padding: '9px 18px',
                color: '#fff', fontSize: '13px', fontWeight: 800,
                letterSpacing: '0.06em', cursor: 'pointer',
              }}
            >
              HISTORY
            </button>
          )}
        </div>

        {/* ── HISTORY VIEW ── */}
        {view === 'history' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {last6.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '14px' }}>
                No coupons created yet.
              </div>
            ) : last6.map(c => (
              <div key={c.id} style={{
                border: '1.5px solid #f1f5f9',
                borderRadius: '12px',
                padding: '14px 16px',
                background: '#fafafa',
                position: 'relative',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>{c.code}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Active / Inactive toggle */}
                    <div
                      onClick={() => onToggleCoupon && onToggleCoupon(c.id)}
                      title={isCouponActive(c) ? 'Click to deactivate' : 'Click to activate'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px 4px 6px',
                        borderRadius: '20px',
                        background: isCouponActive(c) ? '#D1FAE5' : '#F1F5F9',
                        border: `1.5px solid ${isCouponActive(c) ? '#6EE7B7' : '#e2e8f0'}`,
                        cursor: 'pointer', userSelect: 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      {/* Mini toggle pill */}
                      <div style={{
                        width: '28px', height: '16px', borderRadius: '8px',
                        background: isCouponActive(c) ? '#10B981' : '#cbd5e1',
                        position: 'relative', flexShrink: 0,
                        transition: 'background 0.2s',
                      }}>
                        <div style={{
                          position: 'absolute', top: '2px',
                          left: isCouponActive(c) ? '14px' : '2px',
                          width: '12px', height: '12px',
                          borderRadius: '50%', background: '#fff',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s',
                        }} />
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: 700,
                        color: isCouponActive(c) ? '#059669' : '#94a3b8',
                        letterSpacing: '0.04em',
                      }}>
                        {isCouponActive(c) ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <button
                      onClick={() => setPendingDeleteId(c.id)}
                      style={{
                        background: '#FEF2F2', border: '1px solid #FECACA',
                        borderRadius: '8px', width: '28px', height: '28px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: '#EF4444', flexShrink: 0,
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                  {c.discountType === 'Percentage' ? `${c.discountAmount}% off` : `₹${c.discountAmount} off`}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {fmtDisplay(c.validFrom)} → {fmtDisplay(c.expireDate)}
                </div>
              </div>
            ))}
          </div>
        ) : (

        /* ── FORM VIEW ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Coupon Code */}
          <div>
            {label('Coupon Code', true)}
            <div style={{ position: 'relative' }}>
              <input
                value={couponCode}
                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                placeholder="e.g. SAVE20"
                style={{ ...baseInput, paddingRight: '110px' }}
              />
              <button
                onClick={generateCode}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: '#2E5BFF', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.04em',
                }}
              >
                GENERATE
              </button>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>Enter a unique coupon code</div>
          </div>

          {/* Discount Type + Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              {label('Discount Type', true)}
              <div style={{ position: 'relative' }}>
                <select
                  value={discountType}
                  onChange={e => { setDiscountType(e.target.value); setDiscountAmount('10') }}
                  style={{ ...baseInput, appearance: 'none', WebkitAppearance: 'none', paddingRight: '32px', cursor: 'pointer' }}
                >
                  <option>Fixed Amount</option>
                  <option>Percentage</option>
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              </div>
            </div>
            <div>
              {label(discountType === 'Fixed Amount' ? 'Discount Amount (INR)' : 'Discount (%)', true)}
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  value={discountAmount}
                  onChange={e => setDiscountAmount(e.target.value)}
                  style={{ ...baseInput, paddingRight: discountType === 'Fixed Amount' ? '48px' : '32px' }}
                />
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px', fontWeight: 600, letterSpacing: '0.03em' }}>
                  {discountType === 'Fixed Amount' ? 'INR' : '%'}
                </span>
              </div>
            </div>
          </div>

          {/* Eligibility */}
          <div>
            {label('Eligibility')}
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                placeholder="e.g. 400"
                value={minimumOrderValue}
                onChange={e => setMinimumOrderValue(e.target.value)}
                style={{ ...baseInput, paddingRight: '36px' }}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '15px' }}>₹</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
              Coupon will only apply if the customer's total bill exceeds this amount.
            </div>
          </div>

          {/* Date Pickers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              {label('Valid From')}
              <input
                type="date"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
                style={baseInput}
              />
            </div>
            <div>
              {label('Expire Date', false, true)}
              <input
                type="date"
                value={expireDate}
                onChange={e => setExpireDate(e.target.value)}
                style={baseInput}
              />
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '14px', background: '#fff',
                border: '1.5px solid #e2e8f0', borderRadius: '50px',
                fontSize: '13px', fontWeight: 800, color: '#0f172a',
                cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >
              CANCEL
            </button>
            <button
              onClick={handleCreate}
              style={{
                padding: '14px', background: '#2E5BFF',
                border: 'none', borderRadius: '50px',
                fontSize: '13px', fontWeight: 800, color: '#fff',
                cursor: 'pointer', letterSpacing: '0.06em',
                boxShadow: '0 4px 16px rgba(46,91,255,0.4)',
              }}
            >
              CREATE COUPON
            </button>
          </div>

        </div>
        )}

        {/* ── DELETE CONFIRMATION DIALOG ── */}
        {pendingDeleteId != null && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(3px)',
            borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}>
            <div style={{
              background: '#fff', borderRadius: '16px',
              padding: '24px', width: '100%', maxWidth: '320px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              textAlign: 'center',
            }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: '#FEF2F2', margin: '0 auto 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#EF4444',
              }}>
                <Trash2 size={22} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                Delete Coupon?
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '22px', lineHeight: 1.5 }}>
                Are you sure you want to delete this coupon code? This action cannot be undone.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  onClick={() => setPendingDeleteId(null)}
                  style={{
                    padding: '12px', background: '#fff',
                    border: '1.5px solid #e2e8f0', borderRadius: '50px',
                    fontSize: '13px', fontWeight: 700, color: '#0f172a',
                    cursor: 'pointer', letterSpacing: '0.04em',
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    padding: '12px', background: '#EF4444',
                    border: 'none', borderRadius: '50px',
                    fontSize: '13px', fontWeight: 700, color: '#fff',
                    cursor: 'pointer', letterSpacing: '0.04em',
                    boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
                  }}
                >
                  DELETE
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── DELETE TOAST ── */}
      {deleteToast && (
        <div style={{
          position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 10001,
          background: '#1e293b', color: '#fff',
          padding: '12px 22px', borderRadius: '50px',
          fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          animation: 'toastIn 0.3s ease',
        }}>
          <Check size={15} style={{ color: '#4ade80' }} />
          Coupon deleted successfully.
        </div>
      )}
    </div>
  )
}

/* ─── Settings Panel ─── */
function SettingsPanel({ draft, setDraft, accentStart, accentEnd, onSave, saved, isDefault, restaurantId }) {
  const [aboutText, setAboutText] = useState('')
  const [aboutImage, setAboutImage] = useState('')
  const fileInputRef = useRef(null)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const couponEnabledKey = `exzibo_coupon_enabled_${restaurantId || 'default'}`
  const [couponEnabled, setCouponEnabled] = useState(() => {
    try { const v = localStorage.getItem(couponEnabledKey); return v === null ? true : v === 'true' } catch { return true }
  })
  const [socialLinks, setSocialLinks] = useState({
    facebook: '', instagram: '', twitter: '', website: '', linkedin: '', youtube: '',
  })
  const [googleReview, setGoogleReview] = useState('')
  const [googleReviewPasted, setGoogleReviewPasted] = useState(false)
  const [pastedKey, setPastedKey] = useState(null)
  const couponStorageKey = `exzibo_coupons_${restaurantId || 'default'}`
  const aboutKey = `exzibo_about_${restaurantId || 'demo'}`

  useEffect(() => {
    if (!restaurantId) return
    try {
      // Load about text + image
      const stored = JSON.parse(localStorage.getItem(aboutKey) || '{}')
      if (stored.description) setAboutText(stored.description)
      if (stored.image) setAboutImage(stored.image)
    } catch {}
    try {
      // Load social links (non-demo only)
      if (restaurantId !== 'demo') {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const found = all.find(r => r.id === restaurantId)
        if (found?.socialLinks) setSocialLinks(prev => ({ ...prev, ...found.socialLinks }))
        if (found?.googleReview) setGoogleReview(found.googleReview)
      }
    } catch {}
  }, [restaurantId])

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => setAboutImage(e.target.result)
    reader.readAsDataURL(file)
  }
  const [coupons, setCoupons] = useState(() => {
    try { return JSON.parse(localStorage.getItem(couponStorageKey) || '[]') } catch { return [] }
  })

  const handleCreateCoupon = coupon => {
    const updated = [...coupons, coupon]
    setCoupons(updated)
    localStorage.setItem(couponStorageKey, JSON.stringify(updated))
  }

  const handleDeleteCoupon = id => {
    const updated = coupons.filter(c => c.id !== id)
    setCoupons(updated)
    localStorage.setItem(couponStorageKey, JSON.stringify(updated))
  }

  const handleToggleCoupon = id => {
    const updated = coupons.map(c =>
      c.id === id ? { ...c, active: c.active === false ? true : false } : c
    )
    setCoupons(updated)
    localStorage.setItem(couponStorageKey, JSON.stringify(updated))
  }

  if (!draft) return null

  const cardStyle = {
    background: '#fff',
    borderRadius: '16px',
    padding: '18px 20px',
    border: '1px solid #f1f5f9',
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
  }

  const cardHeaderStyle = {
    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px',
  }

  const iconBoxStyle = (bg, color) => ({
    width: '38px', height: '38px', borderRadius: '10px',
    background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color, flexShrink: 0,
  })

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px',
    background: '#f8fafc',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '13px', color: '#0f172a',
    outline: 'none', fontFamily: 'inherit',
  }

  const socialPlatforms = [
    { key: 'facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/exzibo',  icon: <FaFacebook size={18} />,    bg: '#1877F2', color: '#fff' },
    { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/exzibo', icon: <FaInstagram size={18} />,   bg: 'radial-gradient(circle at 30% 110%, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)', color: '#fff' },
    { key: 'twitter',   label: 'X',         placeholder: 'https://twitter.com/exzibo',   icon: <FaXTwitter size={18} />,    bg: '#000', color: '#fff' },
    { key: 'website',   label: 'Website',   placeholder: 'https://twitter.com/exzibo',   icon: <Globe size={16} />,         bg: '#0EA5E9', color: '#fff' },
    { key: 'linkedin',  label: 'LinkedIn',  placeholder: 'https://linkedin.com/exzibo',  icon: <FaLinkedinIn size={18} />,  bg: '#0A66C2', color: '#fff' },
    { key: 'youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/exzibo',   icon: <FaYoutube size={18} />,     bg: '#FF0000', color: '#fff' },
  ]

  return (
    <div style={{ animation: 'settingsPanelIn 0.3s ease', paddingTop: '24px' }}>

      {/* Coupon Modal */}
      {showCouponModal && (
        <CreateCouponModal
          onClose={() => setShowCouponModal(false)}
          coupons={coupons}
          onCreateCoupon={handleCreateCoupon}
          onDeleteCoupon={handleDeleteCoupon}
          onToggleCoupon={handleToggleCoupon}
        />
      )}

      {/* Settings heading chip */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'inline-block',
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '50px',
          padding: '8px 24px',
          fontSize: '14px', fontWeight: 700, color: '#0f172a',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          Settings
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* 1. Add Coupon Code */}
        <div style={cardStyle}>
          {/* Card header row with toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              onClick={() => couponEnabled && setShowCouponModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                cursor: couponEnabled ? 'pointer' : 'default',
                flex: 1,
              }}
            >
              <div style={iconBoxStyle(couponEnabled ? '#EFF6FF' : '#f1f5f9', couponEnabled ? '#3B82F6' : '#94a3b8')}>
                <Tag size={18} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: couponEnabled ? '#0f172a' : '#94a3b8' }}>Add Coupon Code</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  {couponEnabled ? 'Coupon codes are enabled' : 'Coupon codes are disabled'}
                </div>
              </div>
            </div>
            {/* Toggle switch */}
            <div
              onClick={() => setCouponEnabled(e => { const next = !e; localStorage.setItem(couponEnabledKey, String(next)); return next })}
              style={{
                width: '44px', height: '24px', borderRadius: '12px',
                background: couponEnabled ? '#2E5BFF' : '#cbd5e1',
                position: 'relative', cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute',
                top: '3px',
                left: couponEnabled ? '23px' : '3px',
                width: '18px', height: '18px',
                borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </div>

        {/* 2. About Section */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div style={iconBoxStyle('#EFF6FF', '#3B82F6')}>
              <Info size={18} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>About Section</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Short description or about text for the admin template</div>
            </div>
          </div>
          <input
            value={aboutText}
            onChange={e => setAboutText(e.target.value)}
            placeholder="Write a short description about the admin template..."
            style={{ ...inputStyle, marginBottom: '12px' }}
          />
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => handleImageFile(e.target.files[0])}
          />
          {/* Image upload / preview area */}
          <div
            onClick={() => !aboutImage && fileInputRef.current?.click()}
            style={{
              border: '1.5px dashed #cbd5e1',
              borderRadius: '10px',
              minHeight: '120px',
              background: aboutImage ? 'transparent' : '#f8fafc',
              position: 'relative',
              overflow: 'hidden',
              cursor: aboutImage ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {aboutImage ? (
              <>
                <img
                  src={aboutImage}
                  alt="About preview"
                  style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '9px', display: 'block' }}
                />
                {/* Replace / clear buttons */}
                <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '6px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                    style={{
                      padding: '4px 10px', fontSize: '11px', fontWeight: 700,
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px',
                      color: '#0f172a', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                    }}
                  >Change</button>
                  <button
                    onClick={e => { e.stopPropagation(); setAboutImage('') }}
                    style={{
                      padding: '4px 10px', fontSize: '11px', fontWeight: 700,
                      background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px',
                      color: '#dc2626', cursor: 'pointer',
                    }}
                  >Remove</button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', pointerEvents: 'none' }}>
                <div style={{ fontSize: '28px', lineHeight: 1 }}>🖼</div>
                <div style={{ fontSize: '11px', marginTop: '6px' }}>Click to upload image</div>
              </div>
            )}
            {/* + button always visible */}
            {!aboutImage && (
              <button
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                style={{
                  position: 'absolute', bottom: '10px', right: '10px',
                  width: '28px', height: '28px',
                  background: '#fff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '18px', color: '#64748b',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                }}
              >+</button>
            )}
          </div>
        </div>

        {/* 3. Add Social Media Links */}
        <style>{`
          .social-links-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: clamp(6px, 2vw, 10px);
          }
          .social-link-item {
            display: flex;
            align-items: center;
            gap: clamp(4px, 1.5vw, 7px);
            min-width: 0;
          }
          .social-link-icon {
            width: clamp(28px, 7vw, 40px);
            height: clamp(28px, 7vw, 40px);
            border-radius: clamp(8px, 2vw, 12px);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .social-link-icon svg {
            width: clamp(13px, 3.5vw, 18px);
            height: clamp(13px, 3.5vw, 18px);
          }
          .social-link-input {
            flex: 1;
            min-width: 0;
            padding: clamp(5px, 1.5vw, 8px) clamp(7px, 2.5vw, 13px);
            background: #f1f5f9;
            border: none;
            border-radius: 999px;
            font-size: clamp(9px, 2vw, 11px);
            color: #0f172a;
            outline: none;
            font-family: inherit;
          }
          .social-link-input::placeholder {
            color: #94a3b8;
          }
          .social-paste-btn {
            flex-shrink: 0;
            padding: clamp(5px, 1.5vw, 8px) clamp(7px, 2.5vw, 13px);
            background: #1a237e;
            border: none;
            border-radius: 999px;
            color: #fff;
            font-size: clamp(8px, 1.8vw, 10px);
            font-weight: 800;
            letter-spacing: 0.06em;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.2s;
          }
          .social-paste-btn:hover {
            background: #283593;
          }
          .social-paste-btn.pasted {
            background: #16a34a;
          }
        `}</style>
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6', flexShrink: 0 }}>
              <Share2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Add Social Media Links</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Enter social media profile URLs</div>
            </div>
          </div>
          <div className="social-links-grid">
            {socialPlatforms.map(p => (
              <div key={p.key} className="social-link-item">
                <div className="social-link-icon" style={{ background: p.bg, color: p.color }}>
                  {p.icon}
                </div>
                <input
                  type="url"
                  className="social-link-input"
                  value={socialLinks[p.key]}
                  onChange={e => setSocialLinks(s => ({ ...s, [p.key]: e.target.value }))}
                  placeholder={p.placeholder}
                />
                <button
                  className={`social-paste-btn${pastedKey === p.key ? ' pasted' : ''}`}
                  title={`Paste ${p.label} URL`}
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      if (text) {
                        setSocialLinks(s => ({ ...s, [p.key]: text }))
                        setPastedKey(p.key)
                        setTimeout(() => setPastedKey(null), 1500)
                      }
                    } catch {
                      setPastedKey(null)
                    }
                  }}
                >
                  {pastedKey === p.key ? '✓' : 'PASTE'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Google Review Card */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Google Review</span>
            </div>
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text) {
                    setGoogleReview(text)
                    setGoogleReviewPasted(true)
                    setTimeout(() => setGoogleReviewPasted(false), 1500)
                  }
                } catch {}
              }}
              style={{
                padding: '7px 16px',
                background: googleReviewPasted ? '#15803d' : '#16a34a',
                border: 'none', borderRadius: '8px',
                color: '#fff', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >
              {googleReviewPasted ? '✓ PASTED' : 'PASTE'}
            </button>
          </div>
          <div style={{ height: '1px', background: '#f1f5f9', marginBottom: '14px' }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px',
            padding: '10px 14px',
          }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Google Link</span>
            <input
              type="url"
              value={googleReview}
              onChange={e => setGoogleReview(e.target.value)}
              placeholder="https://g.page/..."
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: '13px', color: '#0f172a', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={() => {
            // Save about text + image
            try {
              localStorage.setItem(aboutKey, JSON.stringify({ description: aboutText, image: aboutImage }))
            } catch {}
            // Save social links to restaurant record
            if (restaurantId && restaurantId !== 'demo') {
              try {
                const mainList = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
                if (mainList.find(r => r.id === restaurantId)) {
                  localStorage.setItem('exzibo_restaurants', JSON.stringify(mainList.map(r => r.id === restaurantId ? { ...r, socialLinks, googleReview } : r)))
                }
              } catch {}
            }
            // Notify all listeners
            window.dispatchEvent(new Event('storage'))
            onSave()
          }}
          style={{
            width: '100%', padding: '16px',
            background: saved ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #2563EB, #1D4ED8)',
            border: 'none', borderRadius: '50px',
            color: '#fff', fontSize: '14px', fontWeight: 800,
            letterSpacing: '0.06em', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: saved ? '0 6px 20px rgba(16,185,129,0.4)' : '0 6px 20px rgba(37,99,235,0.4)',
            transition: 'all 0.3s ease',
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

/* ─── Admin Coupon Management ─── */
function generateCouponCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function AdminCouponManagement({ accentStart, restaurantId }) {
  const couponKey = `exzibo_admin_coupon_${restaurantId}`
  const historyKey = `exzibo_coupon_history_${restaurantId}`

  const [coupon, setCoupon] = useState({
    code: '',
    discountType: 'Percentage',
    discountPct: '10.00',
    minDiscount: '400.00',
    maxDiscount: '100.00',
    active: true,
    validUntil: '',
    expireDate: '',
  })
  const [history, setHistory] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [updated, setUpdated] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const stored = localStorage.getItem(couponKey)
    if (stored) setCoupon(JSON.parse(stored))
    const hist = localStorage.getItem(historyKey)
    if (hist) setHistory(JSON.parse(hist))
  }, [couponKey, historyKey])

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleUpdate = () => {
    localStorage.setItem(couponKey, JSON.stringify(coupon))
    const discountLabel = coupon.discountType === 'Fixed Amount'
      ? `₹${coupon.discountPct}`
      : `${coupon.discountPct}%`
    const newEntry = {
      code: coupon.code,
      type: coupon.discountType,
      discount: discountLabel,
      status: coupon.active ? 'Active' : 'Inactive',
      date: coupon.expireDate
        ? new Date(coupon.expireDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—',
      savedAt: new Date().toISOString(),
    }
    const prev = JSON.parse(localStorage.getItem(historyKey) || '[]')
    const next = [newEntry, ...prev.filter(h => h.code !== coupon.code)].slice(0, 20)
    localStorage.setItem(historyKey, JSON.stringify(next))
    setHistory(next)
    setUpdated(true)
    setTimeout(() => setUpdated(false), 2000)
  }

  const handleCancel = () => {
    const stored = localStorage.getItem(couponKey)
    if (stored) setCoupon(JSON.parse(stored))
    else setCoupon({
      code: '', discountType: 'Percentage', discountPct: '10.00',
      minDiscount: '400.00', maxDiscount: '100.00', active: true,
      validUntil: '', expireDate: '',
    })
  }

  const handleDelete = () => {
    localStorage.removeItem(couponKey)
    setCoupon({
      code: '', discountType: 'Percentage', discountPct: '',
      minDiscount: '', maxDiscount: '', active: false,
      validUntil: '', expireDate: '',
    })
    setShowHistory(false)
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 14px',
    background: 'rgba(248,250,252,0.9)',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '14px', fontWeight: 500, color: '#0f172a',
    outline: 'none', fontFamily: 'inherit',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px', fontWeight: 600,
    color: '#64748b',
    marginBottom: '6px',
    letterSpacing: '0.03em',
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.75)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '20px',
      padding: '20px',
      border: '1px solid rgba(255,255,255,0.7)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
    }}>
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: '#2563EB', marginBottom: '2px' }}>Coupon Management</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Create and manage discount coupons for your restaurants.</div>
      </div>

      <div style={{
        background: 'rgba(248,250,252,0.6)',
        borderRadius: '14px',
        padding: '16px',
        border: '1px solid rgba(226,232,240,0.8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: 'rgba(37,99,235,0.12)',
            border: '1px solid rgba(37,99,235,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2563EB', cursor: 'pointer', flexShrink: 0,
          }}>
            <ArrowLeft size={15} />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Edit Coupon</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Coupon Code <span style={{ color: '#ef4444' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                value={coupon.code}
                onChange={e => setCoupon(p => ({ ...p, code: e.target.value }))}
                style={{ ...inputStyle, paddingRight: '110px' }}
                placeholder="e.g. SAVE20"
                onFocus={e => e.target.style.borderColor = '#2563EB'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
              <button
                onClick={() => setCoupon(p => ({ ...p, code: generateCouponCode() }))}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: '#2563EB', fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.05em', padding: '4px 8px',
                }}
              >GENERATE</button>
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>Enter a unique coupon code</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Discount Type <span style={{ color: '#ef4444' }}>*</span></label>
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowDropdown(v => !v)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 14px',
                    background: 'rgba(248,250,252,0.9)',
                    border: `1.5px solid ${showDropdown ? '#2563EB' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    fontSize: '14px', fontWeight: 500, color: '#0f172a',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <span>{coupon.discountType}</span>
                  <ChevronDown size={15} style={{ color: '#94a3b8', transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {showDropdown && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
                    background: '#fff',
                    border: '1.5px solid rgba(37,99,235,0.3)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  }}>
                    {['Percentage', 'Fixed Amount'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => { setCoupon(p => ({ ...p, discountType: opt })); setShowDropdown(false) }}
                        style={{
                          width: '100%', padding: '11px 14px',
                          background: coupon.discountType === opt ? 'rgba(37,99,235,0.08)' : 'transparent',
                          border: 'none',
                          color: coupon.discountType === opt ? '#2563EB' : '#0f172a',
                          fontSize: '14px', fontWeight: coupon.discountType === opt ? 700 : 400,
                          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                      >
                        {opt}
                        {coupon.discountType === opt && <Check size={14} style={{ color: '#2563EB' }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={labelStyle}>
                {coupon.discountType === 'Fixed Amount' ? 'Discount Amount' : 'Discount %'}{' '}
                <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number" min="0" step="0.01"
                  value={coupon.discountPct}
                  onChange={e => setCoupon(p => ({ ...p, discountPct: e.target.value }))}
                  style={{ ...inputStyle, paddingRight: '36px' }}
                  onFocus={e => e.target.style.borderColor = '#2563EB'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <span style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '14px', fontWeight: 700,
                  color: '#64748b',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}>
                  {coupon.discountType === 'Fixed Amount' ? '₹' : '%'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Eligibility — Minimum Order Value (₹)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number" step="1"
                placeholder="e.g. 400"
                value={coupon.minimumOrderValue || ''}
                onChange={e => setCoupon(p => ({ ...p, minimumOrderValue: e.target.value }))}
                style={{ ...inputStyle, paddingRight: '36px' }}
                onFocus={e => e.target.style.borderColor = '#2563EB'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '15px' }}>₹</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
              Coupon will only apply if the customer's total bill exceeds this amount.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setCoupon(p => ({ ...p, active: !p.active }))}
              style={{
                width: '50px', height: '27px', borderRadius: '14px',
                background: coupon.active ? '#2563EB' : '#cbd5e1',
                border: 'none', cursor: 'pointer',
                position: 'relative', transition: 'background 0.25s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: '3.5px',
                left: coupon.active ? '27px' : '3.5px',
                width: '20px', height: '20px', borderRadius: '50%',
                background: '#fff', transition: 'left 0.25s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </button>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Active</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Valid Until</label>
              <input
                type="date"
                value={coupon.validUntil}
                onChange={e => setCoupon(p => ({ ...p, validUntil: e.target.value }))}
                style={{ ...inputStyle, colorScheme: 'light' }}
                onFocus={e => e.target.style.borderColor = '#2563EB'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, fontWeight: 800, color: '#0f172a', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>EXPIRE DATE</label>
              <input
                type="date"
                value={coupon.expireDate}
                onChange={e => setCoupon(p => ({ ...p, expireDate: e.target.value }))}
                style={{ ...inputStyle, colorScheme: 'light' }}
                onFocus={e => e.target.style.borderColor = '#2563EB'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCancel}
              style={{
                flex: 1, padding: '12px',
                background: 'transparent',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                color: '#64748b', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.06em',
                transition: 'all 0.2s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.color = '#475569' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#64748b' }}
            >CANCEL</button>
            <button
              onClick={handleUpdate}
              style={{
                flex: 1, padding: '12px',
                background: updated ? 'linear-gradient(135deg,#10B981,#059669)' : '#2563EB',
                border: 'none',
                borderRadius: '12px',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.06em',
                transition: 'all 0.25s', fontFamily: 'inherit',
                boxShadow: updated ? '0 4px 16px rgba(16,185,129,0.35)' : '0 4px 16px rgba(37,99,235,0.35)',
              }}
            >{updated ? '✓ UPDATED!' : 'UPDATE'}</button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowHistory(v => !v)}
              style={{
                flex: 1, padding: '13px',
                background: '#2563EB',
                border: 'none', borderRadius: '12px',
                color: '#fff', fontSize: '13px', fontWeight: 800,
                cursor: 'pointer', letterSpacing: '0.08em', fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#2563EB' }}
            >HISTORY</button>
            <button
              onClick={handleDelete}
              style={{
                padding: '13px 18px',
                background: 'transparent',
                border: '1.5px solid rgba(239,68,68,0.4)',
                borderRadius: '12px',
                color: '#ef4444', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.06em', fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = '#ef4444' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
              title="Delete coupon — removes it from the restaurant website"
            >DELETE</button>
          </div>

          {showHistory && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '10px', letterSpacing: '0.06em' }}>COUPON HISTORY</div>
              {history.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>
                  No coupon history yet. Save a coupon to see it here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {history.map((h, idx) => (
                    <div key={h.code + idx} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '11px 14px',
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{h.code}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{h.type} • {h.discount} • Until {h.date}</div>
                      </div>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px',
                        background: h.status === 'Active' ? 'rgba(37,99,235,0.1)' : 'rgba(100,116,139,0.1)',
                        border: `1px solid ${h.status === 'Active' ? 'rgba(37,99,235,0.25)' : 'rgba(100,116,139,0.2)'}`,
                        color: h.status === 'Active' ? '#2563EB' : '#64748b',
                        fontSize: '11px', fontWeight: 600,
                      }}>{h.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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

// Single yield to keep the UI alive without adding loop overhead.
const yieldFrame = () => new Promise(r => setTimeout(r, 0))

// Fast single-pass compression:
// Pre-scales the canvas to ~130% of target size in one draw,
// then tries 3 fixed quality values — no loop, no binary search.
// Completes in 2-4 toDataURL calls regardless of image size.
async function compressToLimit(dataUrl, maxKB) {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = async () => {
      try {
        const maxBytes = maxKB * 1024
        const rawBytes = dataUrl.length * 0.75

        // Scale dimensions so uncompressed canvas is ~1.3× target byte budget.
        // The extra headroom means quality 0.82 will almost always land under limit.
        const ratio = (maxBytes * 1.3) / rawBytes
        let scale = Math.min(1, Math.sqrt(ratio))
        scale = Math.max(0.03, scale)

        const w = Math.max(1, Math.round(img.naturalWidth  * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))

        // One yield before the heavy draw — keeps page responsive
        await yieldFrame()

        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)

        // Try 3 quality levels — no loop, instant on any device
        for (const q of [0.82, 0.60, 0.38]) {
          const out = canvas.toDataURL('image/jpeg', q)
          if (out.length * 0.75 <= maxBytes) return resolve(out)
        }

        // Rare fallback: halve canvas and try once more
        await yieldFrame()
        canvas.width  = Math.max(1, Math.round(w * 0.5))
        canvas.height = Math.max(1, Math.round(h * 0.5))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch (e) {
        console.error('compress error', e)
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

function ImageUploadField({ value, onChange, accentStart }) {
  const inputRef = React.useRef(null)
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const [sizeError, setSizeError] = React.useState('')
  const [compressModal, setCompressModal] = React.useState(false)
  const pendingSrcRef = React.useRef(null)
  const [pendingPreview, setPendingPreview] = React.useState(null)
  const [compressing, setCompressing] = React.useState(false)
  const [compressedResult, setCompressedResult] = React.useState(null)

  // Deliver the compressed image to the parent AFTER the modal has fully closed,
  // so the parent state update never races with the modal's own state updates.
  React.useEffect(() => {
    if (compressedResult) {
      onChangeRef.current(compressedResult)
      setCompressedResult(null)
    }
  }, [compressedResult])

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) return
    setSizeError('')

    const sizeKB = file.size / 1024
    if (sizeKB < 60) {
      setSizeError('Image quality too low. Minimum size is 60 KB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      if (sizeKB > 200) {
        pendingSrcRef.current = ev.target.result
        setPendingPreview(ev.target.result)
        setCompressModal(true)
      } else {
        onChangeRef.current(ev.target.result)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleCompressConfirm() {
    const src = pendingSrcRef.current
    if (!src) return
    setCompressing(true)
    let result = null
    try {
      result = await compressToLimit(src, 200)
    } catch (err) {
      console.error('Compression failed:', err)
    }
    // Always clear modal state first so the modal unmounts cleanly.
    pendingSrcRef.current = null
    setPendingPreview(null)
    setCompressing(false)
    setCompressModal(false)
    // Deliver via effect so it fires after the modal-close render cycle.
    if (result) setCompressedResult(result)
  }

  function handleCompressCancel() {
    pendingSrcRef.current = null
    setPendingPreview(null)
    setCompressModal(false)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* ── IMAGE TOO LARGE MODAL ── */}
      {compressModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div style={{
            background: '#fff', borderRadius: '22px',
            width: '100%', maxWidth: '380px',
            padding: '28px 24px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          }}>
            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '16px',
                background: '#FEF3C7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '26px',
              }}>⚠️</div>
            </div>

            {/* Title */}
            <div style={{ textAlign: 'center', fontSize: '17px', fontWeight: 900, color: '#0f172a', marginBottom: '8px' }}>
              Image Too Large
            </div>
            <div style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', fontWeight: 500, lineHeight: 1.5, marginBottom: '24px' }}>
              This image exceeds the 200 KB limit. Click Confirm to automatically compress it.
            </div>

            {/* Preview thumbnail */}
            {pendingPreview && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <img
                  src={pendingPreview}
                  alt="preview"
                  style={{
                    width: '80px', height: '80px', borderRadius: '14px',
                    objectFit: 'cover', border: '2px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handleCompressCancel}
                disabled={compressing}
                style={{
                  flex: 1, padding: '13px',
                  background: '#f1f5f9', border: 'none',
                  borderRadius: '13px', color: '#374151',
                  fontSize: '13px', fontWeight: 700,
                  cursor: compressing ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', opacity: compressing ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompressConfirm}
                disabled={compressing}
                style={{
                  flex: 2, padding: '13px',
                  background: compressing
                    ? '#94a3b8'
                    : `linear-gradient(135deg, ${accentStart}, ${accentStart}cc)`,
                  border: 'none', borderRadius: '13px',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  cursor: compressing ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: compressing ? 'none' : `0 6px 20px ${accentStart}40`,
                  letterSpacing: '0.01em',
                }}
              >
                {compressing ? 'Compressing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FIELD DISPLAY ── */}
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
              onClick={() => { setSizeError(''); inputRef.current?.click() }}
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
              onClick={() => { onChange(null); setSizeError('') }}
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
        <div>
          <button
            type="button"
            onClick={() => { setSizeError(''); inputRef.current?.click() }}
            style={{
              width: '100%', padding: '18px',
              background: sizeError ? '#FEF2F2' : 'rgba(248,250,252,0.9)',
              border: `1.5px dashed ${sizeError ? '#FECACA' : '#CBD5E1'}`,
              borderRadius: '14px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              transition: 'border-color 0.2s, background 0.2s',
            }}
            onMouseEnter={e => {
              if (!sizeError) {
                e.currentTarget.style.borderColor = accentStart
                e.currentTarget.style.background = `${accentStart}08`
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = sizeError ? '#FECACA' : '#CBD5E1'
              e.currentTarget.style.background = sizeError ? '#FEF2F2' : 'rgba(248,250,252,0.9)'
            }}
          >
            <span style={{ fontSize: '24px' }}>📷</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: sizeError ? '#EF4444' : '#64748B', letterSpacing: '0.04em' }}>
              TAP TO UPLOAD PHOTO
            </span>
            <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>
              JPG, PNG, WEBP supported
            </span>
          </button>
          {sizeError ? (
            <div style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600, textAlign: 'center', marginTop: '6px' }}>
              ⚠ {sizeError}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, textAlign: 'center', marginTop: '6px' }}>
              Accepted image size: 60 KB – 200 KB
            </div>
          )}
        </div>
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
    let menuToSave = menu
    if (editingId !== null && editDraft !== null) {
      menuToSave = {
        ...menu,
        [activeCategory]: (menu[activeCategory] || []).map(i =>
          i.id === editingId ? { ...editDraft, price: parseFloat(editDraft.price) || 0 } : i
        ),
      }
      setMenu(menuToSave)
      setEditingId(null)
      setEditDraft(null)
    }
    localStorage.setItem(storageKey, JSON.stringify(menuToSave))
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(menuToSave) }))
    localStorage.setItem(filtersKey, JSON.stringify(catFilters))
    window.dispatchEvent(new StorageEvent('storage', { key: filtersKey, newValue: JSON.stringify(catFilters) }))
    localStorage.setItem(enabledKey, JSON.stringify(filtersEnabled))
    window.dispatchEvent(new StorageEvent('storage', { key: enabledKey, newValue: JSON.stringify(filtersEnabled) }))
    localStorage.setItem(tabsKey, JSON.stringify(categoryTabs))
    window.dispatchEvent(new StorageEvent('storage', { key: tabsKey, newValue: JSON.stringify(categoryTabs) }))
    showToast('✅ Menu saved successfully ✓')
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
    if (!editDraft || editingId === null) return
    const updated = {
      ...menu,
      [activeCategory]: (menu[activeCategory] || []).map(i =>
        i.id === editingId ? { ...editDraft, price: parseFloat(editDraft.price) || 0 } : i
      ),
    }
    setMenu(updated)
    localStorage.setItem(storageKey, JSON.stringify(updated))
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(updated) }))
    setSavedAll(true)
    setHasDraftChanges(false)
    setEditingId(null)
    setEditDraft(null)
    showToast('✅ Item saved successfully ✓')
    clearTimeout(saveAllTimer.current)
    saveAllTimer.current = setTimeout(() => setSavedAll(false), 2500)
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', gap: '8px', padding: '0 4px 20px' }}>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <h1 style={{ fontSize: 'clamp(18px, 5vw, 28px)', fontWeight: 900, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Menu
          </h1>
          <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: '#94A3B8', margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {items.length} item{items.length !== 1 ? 's' : ''} in {categoryTabs.find(c => c.key === activeCategory)?.label}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'nowrap' }}>
          <button
            onClick={handleSaveAll}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: 'clamp(7px, 1.8vw, 10px) clamp(10px, 2.5vw, 18px)',
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
              fontSize: 'clamp(9px, 2vw, 12px)', fontWeight: 800, letterSpacing: '0.06em',
              cursor: 'pointer', whiteSpace: 'nowrap',
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
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: 'clamp(7px, 1.8vw, 10px) clamp(8px, 2vw, 16px)',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  border: 'none',
                  color: '#fff', fontSize: 'clamp(9px, 2vw, 12px)', fontWeight: 800, letterSpacing: '0.06em',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <Plus size={14} /> ADD ITEM
              </button>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <button
                onClick={() => setShowSectionDropdown(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 'clamp(7px, 1.8vw, 10px) clamp(8px, 1.8vw, 12px)',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  border: 'none',
                  color: '#fff', fontSize: 'clamp(9px, 2vw, 12px)',
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
  const subtotal = order.grandTotal != null
    ? order.grandTotal
    : order.items.reduce((s, it) => s + (it.price * (it.qty || 1)), 0)
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
  const isDone = order.status === 'confirmed' || order.status === 'completed' || order.status === 'cancelled'
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>GRAND TOTAL</div>
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

function AnalyticsLineChart({ data, minV: propMin, maxV: propMax }) {
  const chartData = (data && data.length > 0) ? data : WEALTH_DATA.map(v => v * 1000)
  const rawMax = Math.max(...chartData)
  const rawMin = Math.min(...chartData)
  const minV = propMin !== undefined ? propMin : (rawMin > 0 ? 0 : rawMin)
  const maxV = propMax !== undefined ? propMax : (rawMax > 0 ? rawMax * 1.15 : 1)
  const range = maxV - minV || 1

  const pts = chartData.map((v, i) => [
    (i / (chartData.length - 1)) * CHART_W,
    CHART_H - ((v - minV) / range) * CHART_H,
  ])
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `M ${pts[0][0]},${CHART_H} ` + pts.map(([x, y]) => `L ${x},${y}`).join(' ') + ` L ${pts[pts.length - 1][0]},${CHART_H} Z`

  const gridLines = [0.25, 0.5, 0.75].map(f => CHART_H - f * CHART_H)

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 6}`} style={{ width: '100%', height: '120px' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8321A" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#E8321A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines.map((y, i) => (
        <line key={i} x1={0} y1={y} x2={CHART_W} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
      ))}
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
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}></span>
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

const WEEKLY_REVENUE = [8200, 9450, 8800, 8178]

function AnalyticsPanel({ accentStart, accentEnd, restaurantId }) {
  const [showSheet, setShowSheet] = React.useState(false)
  const [showRevenueModal, setShowRevenueModal] = React.useState(false)
  const [showCustomerModal, setShowCustomerModal] = React.useState(false)
  const [categoryItems, setCategoryItems] = React.useState(() => buildCategoryItems(restaurantId))

  const { totalWealth, todaysCollection, totalCustomers, totalCustomersThisMonth, customerGrowth, weeklyCustomerData, totalBookings, categoryData, setRestaurantId, monthlyRevenue, weeklyRevenue } = useAnalytics()

  const chartData = (monthlyRevenue && monthlyRevenue.some(v => v > 0)) ? monthlyRevenue : null
  const chartMax  = chartData ? Math.max(...chartData) : 75000
  const chartMin  = 0
  const fmtK = v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v/1000)}k` : String(v)
  const realWeekly = (weeklyRevenue && weeklyRevenue.some(v => v > 0)) ? weeklyRevenue : null

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
        @keyframes overlayFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalScaleIn { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: scale(1); } }
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

        <div
          style={{ ...card, cursor: 'pointer' }}
          onClick={() => setShowRevenueModal(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>Overview</span>
            <ABarChart2 size={16} color="#94a3b8" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>{totalWealth}</span>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Total wealth</span>
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>{fmtK(chartMax)}</div>
          <AnalyticsLineChart data={chartData || WEALTH_DATA.map(v => v * 1000)} minV={chartMin} maxV={chartMax * 1.15} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
            <span>{fmtK(chartMin)}</span><span>{fmtK(Math.round(chartMax / 2))}</span><span>{fmtK(chartMax)}</span>
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

          <div
            style={{ ...card, cursor: 'pointer' }}
            onClick={() => setShowCustomerModal(true)}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155', lineHeight: 1.4 }}>Total<br />customer</span>
              <AUsers size={16} color="#94a3b8" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', marginBottom: '4px' }}>{totalCustomers.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: parseFloat(customerGrowth) >= 0 ? accent : '#ef4444', fontWeight: 700 }}>
              {customerGrowth}% this month
            </div>
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

      {/* ── Revenue Modal ── */}
      {showRevenueModal && (() => {
        const displayWeekly = realWeekly || WEEKLY_REVENUE
        const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
        const totalMonthly = displayWeekly.reduce((s, v) => s + v, 0)
        const bestIdx = displayWeekly.indexOf(Math.max(...displayWeekly))
        return (
          <div
            onClick={() => setShowRevenueModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '16px',
              animation: 'overlayFadeIn 0.25s ease',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: '20px',
                padding: '28px 24px',
                width: '90%',
                maxWidth: '400px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                animation: 'modalScaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setShowRevenueModal(false)}
                style={{
                  position: 'absolute', top: 16, right: 16,
                  background: '#f0f0f5', border: 'none', borderRadius: '50%',
                  width: 32, height: 32, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#555',
                  lineHeight: 1,
                }}
              >✕</button>

              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: '0 0 4px' }}>{monthName}</h2>
              <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>Monthly Revenue Breakdown</p>

              <div style={{ background: '#f7f7fb', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
                <span style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Total Monthly Revenue
                </span>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#111', marginTop: 4 }}>
                  ₹{totalMonthly.toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {displayWeekly.map((rev, i) => {
                  const prev = i > 0 ? displayWeekly[i - 1] : null
                  const change = prev !== null ? (((rev - prev) / prev) * 100).toFixed(1) : null
                  const isUp = change !== null && parseFloat(change) >= 0
                  const isBest = i === bestIdx
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px',
                        background: isBest ? '#f0eeff' : '#fafafa',
                        borderRadius: 12,
                        border: isBest ? '1.5px solid #6C63FF' : '1.5px solid #f0f0f0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: isBest ? 800 : 600, color: isBest ? '#6C63FF' : '#444' }}>
                          Week {i + 1}
                        </span>
                        {isBest && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#6C63FF', background: '#e4e1ff', borderRadius: 6, padding: '2px 6px' }}>
                            BEST
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {change !== null && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? '#10b981' : '#ef4444' }}>
                            {isUp ? '↑' : '↓'} {isUp ? '+' : ''}{change}%
                          </span>
                        )}
                        <span style={{ fontSize: 14, fontWeight: isBest ? 800 : 600, color: isBest ? '#6C63FF' : '#111' }}>
                          ₹{rev.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Customer Details Modal ── */}
      {showCustomerModal && (() => {
        const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
        const bestIdx = (weeklyCustomerData || []).reduce((bi, w, i, arr) => w.total > arr[bi].total ? i : bi, 0)
        const grandTotal = (weeklyCustomerData || []).reduce((s, w) => s + w.total, 0)
        const growthNum = parseFloat(customerGrowth)
        const growthColor = growthNum >= 0 ? '#10b981' : '#ef4444'
        return (
          <div
            onClick={() => setShowCustomerModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1001,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '16px',
              animation: 'overlayFadeIn 0.25s ease',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: '20px',
                padding: '28px 24px',
                width: '90%',
                maxWidth: '420px',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                animation: 'modalScaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setShowCustomerModal(false)}
                style={{
                  position: 'absolute', top: 16, right: 16,
                  background: '#f0f0f5', border: 'none', borderRadius: '50%',
                  width: 32, height: 32, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#555',
                  lineHeight: 1,
                }}
              >✕</button>

              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: '0 0 4px' }}>Customer Details</h2>
              <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>{monthName}</p>

              <div style={{ background: '#f7f7fb', borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    This Month
                  </span>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#111', marginTop: 2 }}>
                    {totalCustomersThisMonth.toLocaleString()}
                  </div>
                  <span style={{ fontSize: 11, color: '#888' }}>unique customers</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    vs Last Month
                  </span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: growthColor, marginTop: 4 }}>
                    {customerGrowth}%
                  </div>
                  <span style={{ fontSize: 10, color: '#aaa' }}>growth</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {(weeklyCustomerData || []).map((w, i) => {
                  const isBest = i === bestIdx
                  const barPct = grandTotal > 0 ? Math.round((w.total / grandTotal) * 100) : 0
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '14px 16px',
                        background: isBest ? '#f0eeff' : '#fafafa',
                        borderRadius: 14,
                        border: isBest ? '1.5px solid #6C63FF' : '1.5px solid #f0f0f0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: isBest ? 800 : 700, color: isBest ? '#6C63FF' : '#334155' }}>
                            {w.label}
                          </span>
                          {isBest && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#6C63FF', background: '#e4e1ff', borderRadius: 6, padding: '2px 6px' }}>
                              MOST ACTIVE
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 800, color: isBest ? '#6C63FF' : '#111' }}>
                          {w.total}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                        <span>📦 {w.ordersCount} orders</span>
                        <span>📅 {w.bookingsCount} bookings</span>
                      </div>
                      <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${barPct}%`,
                          background: isBest ? '#6C63FF' : '#94a3b8',
                          borderRadius: 2, transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ background: '#0f172a', borderRadius: 14, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Grand Total
                  </span>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                    {grandTotal.toLocaleString()} customers
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Best week</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>
                    {(weeklyCustomerData || [])[bestIdx]?.label}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
