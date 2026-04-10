import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { notifyAnalyticsUpdate } from '../context/AnalyticsContext'
import {
  Star, MapPin, Bell, ShoppingCart, Home,
  UtensilsCrossed, ClipboardList, CalendarDays,
  Heart, Moon, Sun, ChevronRight, ChevronLeft,
  Phone, Flame, Award, Clock, Users, AtSign,
  Share2, MessageCircle, Globe, Leaf, ExternalLink,
  Trash2, Minus, Plus, Tag, CheckCircle, ShoppingBag,
  Copy, PhoneCall, ArrowLeft
} from 'lucide-react'
import { FaInstagram, FaFacebook, FaWhatsapp } from 'react-icons/fa'
import { FaXTwitter, FaHouse, FaUtensils, FaCartShopping, FaClipboardList, FaCalendarDays, FaStore } from 'react-icons/fa6'

const FALLBACK_IMAGES = [
  '/menu/wagyu-ribeye.png',
  '/menu/lobster-thermidor.png',
  '/menu/truffle-beef-carpaccio.png',
  '/menu/mushroom-risotto.png',
  '/menu/atlantic-oysters.png',
]

const MENU_FALLBACK = {
  starters: [
    { name: 'Truffle Beef Carpaccio', price: 2100, oldPrice: 3150, img: '/menu/truffle-beef-carpaccio.png', description: 'Thin-sliced wagyu with black truffle and aged parmesan', tags: ['Popular'], veg: false },
    { name: 'Atlantic Oysters', price: 2800, oldPrice: 4200, img: '/menu/atlantic-oysters.png', description: 'Half dozen with mignonette and lemon', tags: ['Seasonal'], veg: false },
    { name: 'Heirloom Burrata', price: 1650, oldPrice: 2475, img: '/menu/heirloom-burrata.png', description: 'Fresh burrata with heirloom tomatoes and basil oil', tags: ['Vegetarian'], veg: true },
  ],
  mains: [
    { name: 'A5 Wagyu Ribeye', price: 15500, oldPrice: 23250, img: '/menu/wagyu-ribeye.png', description: 'Japanese A5 Wagyu with bone marrow butter', tags: ['Popular'], veg: false },
    { name: 'Lobster Thermidor', price: 7950, oldPrice: 11925, img: '/menu/lobster-thermidor.png', description: 'Whole Maine lobster in cognac cream sauce', tags: ['Seasonal'], veg: false },
    { name: 'Forest Mushroom Risotto', price: 3500, oldPrice: 5250, img: '/menu/mushroom-risotto.png', description: 'Arborio rice with wild porcini and truffle oil', tags: ['Vegetarian', 'Gluten Free'], veg: true },
  ],
  drinks: [
    { name: 'Noir Negroni', price: 1850, oldPrice: 2775, img: '/menu/noir-negroni.png', description: 'Gin, Campari, vermouth with activated charcoal', tags: ['Popular'], veg: true },
    { name: 'Smoke & Mirrors', price: 1600, oldPrice: 2400, img: '/menu/noir-negroni.png', description: 'Mezcal, jalapeño, lime, smoked salt rim', tags: [], veg: true },
  ],
}

const MENU_TABS = [
  { id: 'starters', label: 'STARTERS' },
  { id: 'mains', label: 'MAIN COURSE' },
  { id: 'drinks', label: 'DRINKS' },
]

function loadMenuTabs(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(`exzibo_tabs_${id}`))
    if (saved?.length) return saved.map(t => ({ id: t.key, label: t.label.toUpperCase() }))
  } catch {}
  return MENU_TABS
}

const DEFAULT_CATEGORY_FILTERS = {
  starters: [{ id: 'all', emoji: '🍽️', label: 'All', image: null, assignedItems: [] }],
  mains:    [{ id: 'all', emoji: '🍽️', label: 'All', image: null, assignedItems: [] }],
  drinks:   [{ id: 'all', emoji: '🥤', label: 'All', image: null, assignedItems: [] }],
}

function loadFiltersFromStorage(id) {
  try {
    const saved = localStorage.getItem(`exzibo_menu_filters_${id}`)
    if (saved) return JSON.parse(saved)
  } catch (_) {}
  return DEFAULT_CATEGORY_FILTERS
}

function buildTheme(dark) {
  return {
    pageBg: dark ? '#0a0a0a' : '#f2f2f2',
    headerBg: dark ? 'rgba(15,15,15,0.95)' : 'rgba(237,237,237,0.97)',
    headerBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    color: dark ? '#fff' : '#111',
    locationColor: dark ? '#888' : '#777',
    cardBg: dark ? '#1c1c1c' : '#fff',
    cardBorder: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    cardShadow: dark ? '0 2px 16px rgba(0,0,0,0.4)' : '0 2px 16px rgba(0,0,0,0.07)',
    tabBarBg: dark ? '#1e1e1e' : '#fff',
    tabBarBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    tabBarShadow: dark ? '0 4px 24px rgba(0,0,0,0.5)' : '0 4px 24px rgba(0,0,0,0.10)',
    tabInactiveColor: dark ? '#888' : '#888',
    itemName: dark ? '#f0f0f0' : '#111',
    priceNew: dark ? '#f0f0f0' : '#111',
    priceOld: dark ? '#555' : '#aaa',
    offerColor: dark ? '#4ade80' : '#1a7a4a',
    viewCartBorder: dark ? 'rgba(74,222,128,0.5)' : '#2ecc71',
    viewCartColor: dark ? '#4ade80' : '#1a7a4a',
    vegDot: '#2ecc71',
    nonVegDot: '#e53935',
    bannerText: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
    bannerHeart: '#e53935',
    brandText: dark ? '#333' : '#ccc',
    navBg: dark ? '#ffffff' : '#111111',
    navBorder: dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
    navInactive: dark ? '#888' : 'rgba(255,255,255,0.45)',
    toggleBg: dark ? 'rgba(255,255,255,0.08)' : '#f0f0f0',
    toggleBorder: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
    ratingBg: 'rgba(255,184,0,0.12)',
    ratingBorder: 'rgba(255,184,0,0.3)',
    bellBg: dark ? 'rgba(255,255,255,0.07)' : '#f0f0f0',
    bellBorder: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    bellColor: '#888',
    // Home view specific
    statsBg: dark ? 'rgba(255,255,255,0.03)' : '#fff',
    statsBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    statsDivider: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    statsLabel: dark ? '#555' : '#aaa',
    statsValue: dark ? '#ddd' : '#222',
    sectionTitle: dark ? '#fff' : '#111',
    sectionSub: dark ? '#555' : '#aaa',
    bestsellerBg: dark ? '#1c1c1c' : '#fff',
    bestsellerBorder: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    bestsellerName: dark ? '#e0e0e0' : '#111',
    btnSecBg: dark ? 'rgba(255,255,255,0.06)' : '#fff',
    btnSecBorder: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
    // About & footer
    aboutCardBg: dark ? 'linear-gradient(135deg,rgba(232,50,26,0.08) 0%,rgba(255,255,255,0.02) 100%)' : 'linear-gradient(135deg,rgba(232,50,26,0.05) 0%,rgba(0,0,0,0.02) 100%)',
    aboutCardBorder: dark ? 'rgba(232,50,26,0.14)' : 'rgba(232,50,26,0.16)',
    aboutText: dark ? '#bbb' : '#444',
    aboutSub: dark ? '#666' : '#888',
    aboutSubBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    infoRowBg: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    infoRowBorder: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    infoLabel: dark ? '#555' : '#999',
    infoValue: dark ? '#ccc' : '#222',
    footerBg: dark ? 'rgba(255,255,255,0.02)' : '#fff',
    footerBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    footerLocation: dark ? '#444' : '#999',
    socialBg: dark ? 'rgba(255,255,255,0.05)' : '#f5f5f5',
    socialBorder: dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
    socialColor: dark ? '#666' : '#888',
    btnSecColor: dark ? '#fff' : '#111',
    adminBg: dark ? 'rgba(232,50,26,0.08)' : 'rgba(232,50,26,0.06)',
    adminBorder: dark ? 'rgba(232,50,26,0.18)' : 'rgba(232,50,26,0.14)',
  }
}

function normalizeItem(item) {
  return {
    ...item,
    description: item.description || item.desc || '',
    img: item.img || null,
    veg: item.veg !== undefined
      ? item.veg
      : (item.tags || []).some(t => ['Vegetarian', 'Vegan'].includes(t)),
    oldPrice: item.oldPrice || Math.round(item.price * 1.5),
  }
}

function injectOldPrice(item) {
  return { ...item, oldPrice: item.oldPrice || Math.round(item.price * 1.5) }
}

function loadMenuFromStorage(id, tabs) {
  const saved = localStorage.getItem(`exzibo_menu_${id}`)
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved)
    const activeTabs = tabs || MENU_TABS
    const result = {}
    activeTabs.forEach(tab => {
      result[tab.id] = parsed[tab.id]?.length ? parsed[tab.id].map(normalizeItem) : (MENU_FALLBACK[tab.id] || [])
    })
    return result
  } catch { return null }
}

export default function RestaurantWebsite() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [menuTabs, setMenuTabs] = useState(MENU_TABS)
  const [menuData, setMenuData] = useState(() => Object.fromEntries(MENU_TABS.map(t => [t.id, []])))
  const [activeNav, setActiveNav] = useState(location.state?.activeNav || 'home')
  const [activeMenuTab, setActiveMenuTab] = useState('starters')
  const [darkMode, setDarkMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('exzibo_darkmode') || 'false') } catch { return false }
  })
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [liked, setLiked] = useState({})
  const [cartItems, setCartItems] = useState([])
  const [cartBounce, setCartBounce] = useState(false)
  const [cartBtnXY, setCartBtnXY] = useState(null)
  const cartDragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false })
  const [couponInput, setCouponInput] = useState('')
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [currentOrder, setCurrentOrder] = useState(null)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [orderNotes, setOrderNotes] = useState('')
  const [orderStatus, setOrderStatus] = useState(1)
  const [orderHistory, setOrderHistory] = useState([])
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState(null)
  const [showOrderConfirm, setShowOrderConfirm] = useState(false)

  useEffect(() => {
    const cartKey = `exzibo_cart_${slug}`
    const saved = localStorage.getItem(cartKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.length > 0) setCartItems(parsed)
      } catch (_) {}
    }
  }, [slug])

  useEffect(() => {
    const cartKey = `exzibo_cart_${slug}`
    localStorage.setItem(cartKey, JSON.stringify(cartItems))
  }, [cartItems, slug])

  useEffect(() => {
    localStorage.setItem('exzibo_darkmode', JSON.stringify(darkMode))
    document.body.style.background = darkMode ? '#0a0a0a' : '#f2f2f2'
    document.documentElement.style.background = darkMode ? '#0a0a0a' : '#f2f2f2'
    return () => {
      document.body.style.background = ''
      document.documentElement.style.background = ''
    }
  }, [darkMode])

  const [dynamicCategories, setDynamicCategories] = useState(DEFAULT_CATEGORY_FILTERS)
  const [filtersEnabled, setFiltersEnabled] = useState({ starters: true, mains: true, drinks: true })
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [vegMode, setVegMode] = useState(false)
  const [searchHidden, setSearchHidden] = useState(false)
  const lastScrollYRef = useRef(0)
  const tickingRef = useRef(false)
  const isHiddenRef = useRef(false)
  const hiddenAtYRef = useRef(null)
  const cartIconRef = useRef(null)

  useEffect(() => {
    const MIN_SCROLL = 80      // don't hide until scrolled past this point
    const SHOW_DISTANCE = 120  // must scroll up THIS far from where bar was hidden

    function onScroll() {
      if (tickingRef.current) return
      tickingRef.current = true
      requestAnimationFrame(() => {
        const currentY = Math.max(0, window.scrollY)
        const diff = currentY - lastScrollYRef.current

        if (diff > 0 && currentY > MIN_SCROLL && !isHiddenRef.current) {
          // Scrolling down past safe zone → hide and record position
          setSearchHidden(true)
          isHiddenRef.current = true
          hiddenAtYRef.current = currentY
        } else if (diff < 0 && isHiddenRef.current) {
          // Scrolling up → only reveal if scrolled SHOW_DISTANCE above hide point
          // This prevents momentum bounce and bottom-overscroll glitches
          if (hiddenAtYRef.current - currentY >= SHOW_DISTANCE) {
            setSearchHidden(false)
            isHiddenRef.current = false
            hiddenAtYRef.current = null
          }
        }

        lastScrollYRef.current = currentY
        tickingRef.current = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const [bookingForm, setBookingForm] = useState({ name: '', phone: '', email: '', date: '', time: '19:00', guests: 2, occasion: 'Casual Dining', seating: 'Indoor', notes: '' })
  const [bookingSubmitted, setBookingSubmitted] = useState(false)
  const [bookingErrors, setBookingErrors] = useState({})

  function handleBookingChange(field, value) {
    setBookingForm(prev => ({ ...prev, [field]: value }))
    setBookingErrors(prev => ({ ...prev, [field]: '' }))
  }

  function handleBookingSubmit() {
    const errs = {}
    if (!bookingForm.name.trim()) errs.name = 'Required'
    if (!bookingForm.phone.trim()) errs.phone = 'Required'
    if (!bookingForm.email.trim()) errs.email = 'Required'
    if (!bookingForm.date) errs.date = 'Required'
    if (Object.keys(errs).length) { setBookingErrors(errs); return }

    const restaurantId = restaurant?.id || slug || 'demo'
    const storageKey = `exzibo_bookings_${restaurantId}`
    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]')
    const newBooking = {
      id: 'BK' + Date.now().toString().slice(-6),
      name: bookingForm.name.trim(),
      phone: bookingForm.phone.trim(),
      email: bookingForm.email.trim(),
      date: bookingForm.date,
      time: bookingForm.time,
      guests: bookingForm.guests,
      occasion: bookingForm.occasion,
      seating: bookingForm.seating,
      notes: bookingForm.notes.trim(),
      status: 'pending',
      submittedAt: new Date().toISOString(),
    }
    localStorage.setItem(storageKey, JSON.stringify([newBooking, ...existing]))
    notifyAnalyticsUpdate()
    setBookingSubmitted(true)
  }

  const VALID_COUPON = 'SPICE10'
  const COUPON_DISCOUNT_PCT = 10

  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0)
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0)
  const deliveryFee = subtotal > 500 ? 0 : 40
  const gstAmt = +(subtotal * 0.05).toFixed(2)
  const discountAmt = couponApplied ? +(subtotal * COUPON_DISCOUNT_PCT / 100).toFixed(2) : 0
  const grandTotal = +(subtotal + gstAmt + deliveryFee - discountAmt).toFixed(2)

  function updateQty(id, delta) {
    setCartItems(prev => prev.map(item =>
      item.id === id ? { ...item, qty: Math.max(1, item.qty + delta) } : item
    ))
  }
  function removeItem(id) {
    setCartItems(prev => prev.filter(item => item.id !== id))
  }
  function handleApplyCoupon() {
    if (couponApplied) return
    if (couponInput.trim().toUpperCase() === VALID_COUPON) {
      setCouponApplied(true)
      setCouponError('')
    } else {
      setCouponError('Invalid coupon code')
    }
  }
  function flyToCart(imgSrc, clickedEl) {
    if (!cartIconRef.current || !clickedEl) return

    let imgEl = null
    let el = clickedEl
    for (let i = 0; i < 8 && el; i++) {
      const found = el.querySelector('img')
      if (found) { imgEl = found; break }
      el = el.parentElement
    }

    const startRect = imgEl ? imgEl.getBoundingClientRect() : clickedEl.getBoundingClientRect()
    const endRect = cartIconRef.current.getBoundingClientRect()

    const size = Math.min(Math.min(startRect.width, startRect.height), 72)
    const clone = document.createElement('img')
    clone.src = imgSrc || '/menu/wagyu-ribeye.png'
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${startRect.left + startRect.width / 2 - size / 2}px`,
      top: `${startRect.top + startRect.height / 2 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '12px',
      objectFit: 'cover',
      zIndex: '10000',
      pointerEvents: 'none',
      boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
      transformOrigin: 'center center',
    })
    document.body.appendChild(clone)

    const startCX = startRect.left + startRect.width / 2
    const startCY = startRect.top + startRect.height / 2
    const endCX = endRect.left + endRect.width / 2
    const endCY = endRect.top + endRect.height / 2
    const dx = endCX - startCX
    const dy = endCY - startCY
    const cpDx = dx * 0.15
    const cpDy = dy - Math.abs(dx) * 0.55 - 60

    const STEPS = 40
    const keyframes = Array.from({ length: STEPS + 1 }, (_, i) => {
      const t = i / STEPS
      const bx = 2 * (1 - t) * t * cpDx + t * t * dx
      const by = 2 * (1 - t) * t * cpDy + t * t * dy
      const scale = 1 - t * 0.72
      const opacity = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1
      return { transform: `translate(${bx}px, ${by}px) scale(${scale})`, opacity }
    })

    const anim = clone.animate(keyframes, { duration: 720, easing: 'ease-in', fill: 'forwards' })
    anim.onfinish = () => {
      clone.remove()
      setCartBounce(true)
      setTimeout(() => setCartBounce(false), 450)
    }
  }

  function addToCart(item, e) {
    setCartItems(prev => {
      const existing = prev.find(c => c.name === item.name)
      if (existing) return prev.map(c => c.name === item.name ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { id: Date.now(), name: item.name, price: item.price, qty: 1, img: item.img || '/menu/wagyu-ribeye.png' }]
    })

    if (e) flyToCart(item.img || '/menu/wagyu-ribeye.png', e.currentTarget)
  }

  function handlePlaceOrder() {
    if (cartItems.length === 0) return
    if (currentOrder) {
      setOrderHistory(prev => [{ ...currentOrder, status: 'CONFIRMED' }, ...prev])
    }
    const orderId = String(Math.floor(100000000 + Math.random() * 900000000))
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const order = {
      id: orderId,
      items: [...cartItems],
      subtotal,
      gstAmt,
      deliveryFee,
      discountAmt,
      grandTotal,
      itemCount: cartItems.reduce((s, i) => s + i.qty, 0),
      date: dateStr,
      couponApplied,
      status: 'PLACED',
    }
    const restaurantId = restaurant?.id || slug || 'demo'
    setCurrentOrder({ ...order, _restaurantId: restaurantId })
    setOrderStatus(0)
    setOrderNotes('')
    setViewingHistoryOrder(null)
    setShowSuccessPopup(true)
    setCartItems([])
    setCouponApplied(false)
    setCouponInput('')

    const adminOrder = {
      id: orderId,
      table: String(Math.floor(Math.random() * 20) + 1).padStart(2, '0'),
      status: 'pending',
      customerName: '',
      phone: '',
      location: '',
      submittedAt: new Date().toISOString(),
      grandTotal,
      items: cartItems.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    }
    const ordersKey = `exzibo_orders_${restaurantId}`
    const existing = JSON.parse(localStorage.getItem(ordersKey) || '[]')
    localStorage.setItem(ordersKey, JSON.stringify([adminOrder, ...existing]))
    notifyAnalyticsUpdate()

    setTimeout(() => {
      setShowSuccessPopup(false)
      setActiveNav('orders')
    }, 2500)
  }

  const theme = buildTheme(darkMode)

  useEffect(() => {
    if (slug === 'demo') {
      setRestaurant({
        id: 'demo', slug: 'demo',
        name: 'La Maison Noire',
        location: 'Cyber City, Gurugram',
        description: 'An uncompromising culinary experience rooted in craft, quality, and atmosphere. Every dish is a conversation between heritage and innovation.',
        chefInfo: 'Chef Marcus Aurélius, trained in Paris and Tokyo, brings 20 years of Michelin-star experience to every plate.',
        rating: '4.9',
        phone: '+91 98765 43210',
        tables: '24',
        images: FALLBACK_IMAGES,
        socialLinks: { instagram: '#', facebook: '#', twitter: '#', website: '#' },
      })
      const demoTabs = loadMenuTabs('demo')
      setMenuTabs(demoTabs)
      setMenuData(loadMenuFromStorage('demo', demoTabs) || MENU_FALLBACK)
      setDynamicCategories(loadFiltersFromStorage('demo'))
      try { const fe = localStorage.getItem('exzibo_filters_enabled_demo'); if (fe) setFiltersEnabled(JSON.parse(fe)) } catch {}
      setActiveMenuTab(demoTabs[0]?.id || 'starters')
      return
    }
    const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = restaurants.find(r => r.slug === slug || r.id === slug)
    if (found) {
      const tabs = loadMenuTabs(found.id)
      setMenuTabs(tabs)
      setRestaurant(found)
      setMenuData(loadMenuFromStorage(found.id, tabs) || Object.fromEntries(tabs.map(t => [t.id, []])))
      setDynamicCategories(loadFiltersFromStorage(found.id))
      try { const fe = localStorage.getItem(`exzibo_filters_enabled_${found.id}`); if (fe) setFiltersEnabled(JSON.parse(fe)) } catch {}
      setActiveMenuTab(tabs[0]?.id || 'starters')
    } else {
      setNotFound(true)
    }
  }, [slug])

  useEffect(() => {
    if (!currentOrder) return
    const restaurantId = currentOrder._restaurantId || restaurant?.id || slug || 'demo'
    const ordersKey = `exzibo_orders_${restaurantId}`

    function syncOrderStatus() {
      try {
        const orders = JSON.parse(localStorage.getItem(ordersKey) || '[]')
        const adminOrder = orders.find(o => o.id === currentOrder.id)
        if (!adminOrder) return
        if (adminOrder.status === 'preparing') setOrderStatus(1)
        else if (adminOrder.status === 'completed') setOrderStatus(1)
        else if (adminOrder.status === 'cancelled') setOrderStatus(0)
        else setOrderStatus(0)
      } catch {}
    }

    syncOrderStatus()
    window.addEventListener('storage', syncOrderStatus)
    window.addEventListener('exzibo-data-changed', syncOrderStatus)
    return () => {
      window.removeEventListener('storage', syncOrderStatus)
      window.removeEventListener('exzibo-data-changed', syncOrderStatus)
    }
  }, [currentOrder, restaurant, slug])

  useEffect(() => {
    function onStorageChange(e) {
      if (!e.key?.startsWith('exzibo_menu_') && !e.key?.startsWith('exzibo_tabs_') && !e.key?.startsWith('exzibo_filters_enabled_')) return
      const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
      const found = restaurants.find(r => r.slug === slug || r.id === slug)
      const id = found?.id || (slug === 'demo' ? 'demo' : null)
      if (!id) return
      if (e.key === `exzibo_tabs_${id}`) {
        try {
          const saved = JSON.parse(e.newValue)
          if (saved?.length) {
            const newTabs = saved.map(t => ({ id: t.key, label: t.label.toUpperCase() }))
            setMenuTabs(newTabs)
            const newMenu = loadMenuFromStorage(id, newTabs)
            if (newMenu) setMenuData(newMenu)
            setActiveMenuTab(prev => newTabs.find(t => t.id === prev) ? prev : newTabs[0]?.id || 'starters')
          }
        } catch {}
        return
      }
      if (e.key === `exzibo_menu_${id}`) {
        setMenuData(prev => {
          const tabs = Object.keys(prev).map(id => ({ id }))
          return loadMenuFromStorage(id, tabs.length ? tabs : undefined) || MENU_FALLBACK
        })
      }
      if (e.key === `exzibo_menu_filters_${id}`) {
        setDynamicCategories(loadFiltersFromStorage(id))
        setActiveCategory('all')
      }
      if (e.key === `exzibo_filters_enabled_${id}`) {
        try { if (e.newValue) setFiltersEnabled(JSON.parse(e.newValue)) } catch {}
      }
    }
    window.addEventListener('storage', onStorageChange)
    return () => window.removeEventListener('storage', onStorageChange)
  }, [slug])

  useEffect(() => {
    setActiveCategory('all')
  }, [activeMenuTab])

  useEffect(() => {
    if (filtersEnabled[activeMenuTab] === false) {
      setActiveCategory('all')
    }
  }, [filtersEnabled, activeMenuTab])

  useEffect(() => {
    const images = restaurant?.images?.length ? restaurant.images : FALLBACK_IMAGES
    if (images.length <= 1) return
    const interval = setInterval(() => setCarouselIdx(i => (i + 1) % images.length), 4000)
    return () => clearInterval(interval)
  }, [restaurant])

  const carouselImages = restaurant?.images?.length ? restaurant.images : FALLBACK_IMAGES

  const visibleMenuData = Object.fromEntries(
    menuTabs.map(tab => [tab.id, (menuData[tab.id] || []).filter(m => m.available !== false)])
  )

  const allItems = menuTabs.flatMap(tab => visibleMenuData[tab.id] || [])
  const tagged = allItems.filter(m => m.tags?.some(t => ['Popular', 'Seasonal', "Chef's Pick"].includes(t)))

  const getCategoryItems = () => {
    const q = searchQuery.trim().toLowerCase()
    let base = []
    switch (activeCategory) {
      case 'starters': base = visibleMenuData.starters; break
      case 'mains': base = visibleMenuData.mains; break
      case 'drinks': base = visibleMenuData.drinks; break
      case 'popular': base = allItems.filter(m => m.tags?.some(t => ['Popular', "Chef's Pick"].includes(t))); break
      case 'veg': base = allItems.filter(m => m.veg); break
      default: base = tagged.length > 0 ? tagged : allItems
    }
    if (q) base = base.filter(m => m.name.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q))
    return base
  }
  const bestsellers = getCategoryItems()

  const searchFilteredAll = searchQuery.trim() ? menuTabs.flatMap(tab =>
    (visibleMenuData[tab.id] || [])
      .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || (m.description || '').toLowerCase().includes(searchQuery.toLowerCase()))
      .map(m => ({ ...m, _cat: tab.label }))
  ) : null

  const rawMenuItems = visibleMenuData[activeMenuTab] || []
  const tabCategories = dynamicCategories[activeMenuTab] || DEFAULT_CATEGORY_FILTERS[activeMenuTab] || []
  const categoryFiltered = activeCategory === 'all' ? rawMenuItems : rawMenuItems.filter(item => {
    const cat = tabCategories.find(c => c.id === activeCategory)
    if (!cat) return true
    const assigned = cat.assignedItems || []
    return assigned.length === 0 || assigned.includes(item.id)
  })
  const activeMenuItems = vegMode
    ? [...categoryFiltered].sort((a, b) => (b.veg ? 1 : 0) - (a.veg ? 1 : 0))
    : categoryFiltered

  function onCartBtnPointerDown(e) {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    cartDragRef.current = { isDragging: true, startX: clientX, startY: clientY, startLeft: rect.left, startTop: rect.top, moved: false }

    const onMove = (me) => {
      if (!cartDragRef.current.isDragging) return
      me.preventDefault && me.preventDefault()
      const cx = me.touches ? me.touches[0].clientX : me.clientX
      const cy = me.touches ? me.touches[0].clientY : me.clientY
      const dx = cx - cartDragRef.current.startX
      const dy = cy - cartDragRef.current.startY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) cartDragRef.current.moved = true
      const newLeft = Math.max(0, Math.min(window.innerWidth - 72, cartDragRef.current.startLeft + dx))
      const newTop = Math.max(0, Math.min(window.innerHeight - 56, cartDragRef.current.startTop + dy))
      setCartBtnXY({ left: newLeft, top: newTop })
    }
    const onUp = () => {
      cartDragRef.current.isDragging = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }

  function onCartBtnClick(e) {
    if (cartDragRef.current.moved) { cartDragRef.current.moved = false; return }
    setActiveNav('cart')
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: '#f2f2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: "'Inter', sans-serif", padding: '24px', gap: '0' }}>
        <div style={{ fontSize: '80px', fontWeight: 900, color: 'rgba(0,0,0,0.06)', lineHeight: 1 }}>404</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: '#111', marginTop: '-8px', marginBottom: '8px' }}>Restaurant not found</div>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '32px', textAlign: 'center', maxWidth: '280px', lineHeight: 1.6 }}>No restaurant matches this URL.</div>
        <a href="/restaurant/demo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E8321A', borderRadius: '12px', padding: '14px 28px', color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none', marginBottom: '12px' }}>
          View Demo Restaurant
        </a>
        <a href="/" style={{ fontSize: '12px', color: '#aaa', textDecoration: 'none', fontWeight: 600 }}>← Back to Home</a>
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div style={{ minHeight: '100vh', background: '#f2f2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(232,50,26,0.2)', borderTopColor: '#E8321A', borderRadius: '20px', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ color: '#aaa', fontSize: '13px' }}>Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="restaurant-page" style={{
      background: theme.pageBg,
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      maxWidth: '480px',
      margin: '0 auto',
      paddingBottom: '80px',
      position: 'relative',
      transition: 'background 0.3s ease',
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes successPop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes checkDraw { 0% { stroke-dashoffset: 80; opacity: 0; } 40% { opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 1; } }
        @keyframes statusBounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        .menu-card { animation: fadeUp 0.35s ease both; }
        .menu-card:nth-child(1) { animation-delay: 0ms; }
        .menu-card:nth-child(2) { animation-delay: 60ms; }
        .menu-card:nth-child(3) { animation-delay: 120ms; }
        .menu-card:nth-child(4) { animation-delay: 180ms; }
        .view-cart-btn { transition: background 0.2s ease, transform 0.15s ease; }
        .view-cart-btn:hover { background: rgba(46,204,113,0.08) !important; }
        .view-cart-btn:active { transform: scale(0.96); }
        .tab-pill { transition: background 0.2s ease, color 0.2s ease; }
        .toggle-btn { transition: background 0.2s ease, transform 0.15s ease; }
        .toggle-btn:active { transform: scale(0.9); }
        .food-card { transition: transform 0.2s ease; }
        .food-card:active { transform: scale(0.97); }
        .category-pill:hover { transform: translateY(-1px); }
        .category-pill:active { transform: scale(0.95); }
        .bestseller-card { transition: transform 0.22s ease, box-shadow 0.22s ease; }
        .bestseller-card:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 12px 32px rgba(0,0,0,0.22) !important; }
        .bestseller-card:active { transform: scale(0.97); }
        .action-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .action-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(232,50,26,0.48) !important; }
        .action-btn:active { transform: scale(0.97); }
        .stat-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cartIconBounce { 0% { transform: scale(1); } 30% { transform: scale(1.38); } 60% { transform: scale(0.92); } 80% { transform: scale(1.12); } 100% { transform: scale(1); } }
        .reveal { animation: slideUp 0.45s ease both; }
        .reveal-1 { animation-delay: 0ms; }
        .reveal-2 { animation-delay: 80ms; }
        .reveal-3 { animation-delay: 160ms; }
        .reveal-4 { animation-delay: 240ms; }
        .restaurant-header input::placeholder { color: ${darkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)'} !important; }

      `}</style>

      {/* ── STICKY HEADER CARD — inverted from page theme ── */}
      {/* Light mode → dark header | Dark mode → light header */}
      <header className="restaurant-header" style={{
        padding: '18px 20px',
        background: darkMode ? '#ffffff' : '#111111',
        boxShadow: darkMode ? '0 8px 25px rgba(0,0,0,0.15)' : '0 8px 25px rgba(0,0,0,0.5)',
        cursor: searchHidden ? 'pointer' : 'default',
      }} onClick={() => {
        if (isHiddenRef.current) {
          setSearchHidden(false)
          isHiddenRef.current = false
          hiddenAtYRef.current = null
        }
      }}>
        {/* Row 1: Logo + Name/Location + Buttons — ALWAYS VISIBLE */}
        <div className="header-top-row" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Logo avatar */}
          <div style={{
            width: '60px', height: '60px', borderRadius: '16px', flexShrink: 0,
            background: 'linear-gradient(135deg, #E8321A 0%, #ff6b35 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'none',
            overflow: 'hidden',
          }}>
            {carouselImages[0] ? (
              <img src={carouselImages[0]} alt={restaurant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <UtensilsCrossed size={26} color="#fff" />
            )}
          </div>
          {/* Name + Location */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: darkMode ? '#111' : '#fff', letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.3s ease' }}>
              {restaurant.name}
            </div>
            <div style={{ fontSize: '12px', color: darkMode ? '#777' : 'rgba(255,255,255,0.5)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', transition: 'color 0.3s ease' }}>
              <MapPin size={11} color="#E8321A" />
              {restaurant.location || 'Fine Dining'}
            </div>
          </div>
          {/* Theme toggle only */}
          <button className="toggle-btn" onClick={() => setDarkMode(d => !d)} style={{
            flexShrink: 0,
            width: '46px', height: '46px', borderRadius: '14px',
            background: darkMode ? '#f0f0f0' : 'rgba(255,255,255,0.10)',
            border: darkMode ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            transition: 'background 0.3s ease',
          }}>
            {darkMode ? <Sun size={18} color="#FFB800" /> : <Moon size={18} color="rgba(255,255,255,0.85)" />}
          </button>
        </div>

        {/* Row 2: search bar — only on home & menu pages */}
        {(activeNav === 'home' || activeNav === 'menu') && (
          <div className={`search-wrapper${searchHidden ? ' search-hidden' : ''}`}>
            <div className="header-search-row">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search dishes, drinks..."
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: darkMode ? '#f5f5f5' : 'rgba(255,255,255,0.10)',
                      border: darkMode ? '1.5px solid rgba(0,0,0,0.08)' : '1.5px solid rgba(255,255,255,0.12)',
                      borderRadius: '16px', padding: '14px 16px 14px 46px',
                      fontSize: '14px', color: darkMode ? '#111' : '#fff', fontFamily: 'inherit', outline: 'none',
                      transition: 'border-color 0.2s ease, background 0.2s ease, color 0.3s ease',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#E8321A'; e.target.style.background = darkMode ? '#f0f0f0' : 'rgba(255,255,255,0.15)' }}
                    onBlur={e => { e.target.style.borderColor = darkMode ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'; e.target.style.background = darkMode ? '#f5f5f5' : 'rgba(255,255,255,0.10)' }}
                  />
                  <svg style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={darkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: darkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0' }}>×</button>
                  )}
                </div>
                <button
                  onClick={() => setVegMode(v => !v)}
                  title={vegMode ? 'Show all items' : 'Show veg items first'}
                  style={{
                    flexShrink: 0, width: '50px', height: '50px', borderRadius: '16px',
                    background: vegMode ? '#22c55e' : '#E8321A',
                    border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: vegMode ? '0 4px 14px rgba(34,197,94,0.45)' : '0 4px 14px rgba(232,50,26,0.4)',
                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  {vegMode
                    ? <Leaf width="17" height="17" color="#fff" strokeWidth={2.5} />
                    : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Menu category tabs — only visible when on the menu tab */}
        {activeNav === 'menu' && (
          <div style={{ paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: darkMode ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.09)', borderRadius: '16px', padding: '5px' }}>
              {menuTabs.map(tab => {
                const active = activeMenuTab === tab.id
                return (
                  <button key={tab.id} className="tab-pill" onClick={() => setActiveMenuTab(tab.id)} style={{
                    flex: 1, padding: '9px 8px', borderRadius: '12px', border: 'none',
                    background: active ? '#E8321A' : 'transparent',
                    color: active ? '#fff' : darkMode ? '#666' : 'rgba(255,255,255,0.55)',
                    fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                    letterSpacing: '0.05em', whiteSpace: 'nowrap', textAlign: 'center',
                    boxShadow: active ? '0 4px 14px rgba(232,50,26,0.35)' : 'none',
                    fontFamily: 'inherit',
                  }}>
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </header>

      {/* ── CATEGORY FILTER STRIP — standalone, outside header ── */}
      {activeNav === 'menu' && filtersEnabled[activeMenuTab] !== false && (
        <div style={{ padding: '14px 16px 0' }}>
          <div className="category-scroll-row" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            {tabCategories.map(cat => {
              const isActive = activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '6px',
                    background: isActive
                      ? '#fff'
                      : (darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'),
                    border: 'none',
                    borderRadius: '16px',
                    padding: '10px 10px 8px',
                    cursor: 'pointer',
                    minWidth: '62px',
                    boxShadow: isActive ? '0 4px 14px rgba(0,0,0,0.2)' : 'none',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    overflow: 'hidden',
                    background: isActive ? 'rgba(232,50,26,0.08)' : (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {cat.image ? (
                      <img src={cat.image} alt={cat.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '24px', lineHeight: 1 }}>{cat.emoji}</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: isActive ? 800 : 500,
                    color: isActive ? '#111' : (darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'),
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                  }}>
                    {cat.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SEARCH RESULTS OVERLAY ── */}
      {searchFilteredAll && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: theme.pageBg,
          zIndex: 40, overflowY: 'auto', paddingBottom: '100px',
          paddingTop: '148px',
          animation: 'fadeIn 0.2s ease',
        }}>
          {/* Header */}
          <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: theme.sectionTitle, letterSpacing: '-0.02em' }}>
                {searchFilteredAll.length > 0 ? `${searchFilteredAll.length} result${searchFilteredAll.length !== 1 ? 's' : ''}` : 'No results'}
              </div>
              <div style={{ fontSize: '12px', color: theme.sectionSub, marginTop: '2px' }}>
                {searchFilteredAll.length > 0 ? `for "${searchQuery}"` : `No dishes match "${searchQuery}"`}
              </div>
            </div>
          </div>

          {/* Empty State */}
          {searchFilteredAll.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>🍽️</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: theme.sectionTitle }}>Nothing found</div>
              <div style={{ fontSize: '13px', color: theme.sectionSub, textAlign: 'center', lineHeight: 1.6 }}>Try a different dish name or ingredient</div>
            </div>
          )}

          {/* Results List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 14px' }}>
            {searchFilteredAll.map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: '12px', alignItems: 'center',
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '16px',
                padding: '12px',
                boxShadow: theme.cardShadow,
                animation: 'fadeUp 0.3s ease both',
                animationDelay: `${i * 40}ms`,
              }}>
                {/* Image */}
                <div style={{ width: '72px', height: '72px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
                  <img
                    src={item.img || '/menu/wagyu-ribeye.png'}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
                  />
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: theme.itemName, lineHeight: 1.2 }}>{item.name}</span>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
                      color: item._cat === 'Drink' ? '#60a5fa' : item._cat === 'Starter' ? '#fbbf24' : '#4ade80',
                      background: item._cat === 'Drink' ? 'rgba(96,165,250,0.12)' : item._cat === 'Starter' ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)',
                      borderRadius: '5px', padding: '2px 6px', textTransform: 'uppercase', flexShrink: 0,
                    }}>{item._cat}</span>
                  </div>
                  {item.description && (
                    <div style={{ fontSize: '11px', color: theme.sectionSub, lineHeight: 1.5, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: theme.priceNew }}>₹{item.price.toLocaleString()}</span>
                      {item.oldPrice && <span style={{ fontSize: '11px', color: theme.priceOld, textDecoration: 'line-through' }}>₹{item.oldPrice.toLocaleString()}</span>}
                    </div>
                    <button
                      onClick={(e) => addToCart(item, e)}
                      style={{
                        background: '#E8321A', color: '#fff', border: 'none',
                        borderRadius: '10px', padding: '7px 14px',
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(232,50,26,0.35)',
                        transition: 'transform 0.15s ease',
                        fontFamily: 'inherit',
                      }}
                      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.93)'}
                      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── HOME VIEW ── */}
      {activeNav === 'home' && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>

          {/* Hero Carousel */}
          <section className="reveal reveal-1" style={{ position: 'relative', height: '300px', overflow: 'hidden', margin: '14px 14px 0' }}>
            <div style={{ position: 'relative', height: '100%', borderRadius: '20px', overflow: 'hidden' }}>
              {carouselImages.map((src, i) => (
                <div key={i} style={{ position: 'absolute', inset: 0, backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: i === carouselIdx ? 1 : 0, transition: 'opacity 1s ease' }} />
              ))}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.65) 100%)', borderRadius: '20px' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '18px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(232,50,26,0.9)', borderRadius: '8px', padding: '4px 10px', marginBottom: '8px', width: 'fit-content' }}>
                  <Flame size={10} color="#fff" />
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Premium Dining</span>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: '6px', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
                  An Unforgettable<br />Culinary Experience
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  {(restaurant.description || '').slice(0, 70)}{(restaurant.description?.length || 0) > 70 ? '…' : ''}
                </div>
              </div>
              {carouselImages.length > 1 && (
                <>
                  <button onClick={() => setCarouselIdx(i => (i - 1 + carouselImages.length) % carouselImages.length)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '15px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}>
                    <ChevronLeft size={15} />
                  </button>
                  <button onClick={() => setCarouselIdx(i => (i + 1) % carouselImages.length)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '15px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}>
                    <ChevronRight size={15} />
                  </button>
                  <div style={{ position: 'absolute', bottom: '10px', right: '14px', display: 'flex', gap: '4px' }}>
                    {carouselImages.map((_, i) => (
                      <button key={i} onClick={() => setCarouselIdx(i)} style={{ width: i === carouselIdx ? '16px' : '5px', height: '5px', borderRadius: '3px', background: i === carouselIdx ? '#fff' : 'rgba(255,255,255,0.4)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s ease' }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── ACTION BUTTONS: icon square + "View menu" pill ── */}
          <section className="reveal reveal-2" style={{ padding: '14px 14px 0', display: 'flex', gap: '12px', alignItems: 'stretch' }}>
            {/* Left: booking icon square button */}
            <button
              className="action-btn"
              onClick={() => setActiveNav('booking')}
              style={{
                width: '48px', height: '48px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: darkMode ? '#ffffff' : '#111111',
                border: 'none', borderRadius: '20px',
                cursor: 'pointer', position: 'relative',
                boxShadow: darkMode ? '0 4px 18px rgba(0,0,0,0.18)' : '0 4px 18px rgba(0,0,0,0.45)',
                transition: 'background 0.3s ease, box-shadow 0.3s ease',
              }}
            >
              <img
                src="/booking-icon.jpeg"
                alt="booking"
                style={{
                  width: '38px', height: '38px', objectFit: 'contain', borderRadius: '4px',
                  filter: darkMode ? 'invert(1)' : 'none',
                  transition: 'filter 0.3s ease',
                }}
              />
            </button>

            {/* Right: View menu pill */}
            <button
              className="action-btn"
              onClick={() => setActiveNav('menu')}
              style={{
                flex: 1, height: '48px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: darkMode ? '#ffffff' : '#111111',
                border: 'none', borderRadius: '20px',
                color: darkMode ? '#111111' : '#ffffff',
                fontSize: '16px', fontWeight: 800, cursor: 'pointer',
                letterSpacing: '-0.02em', fontFamily: 'inherit',
                boxShadow: darkMode ? '0 4px 18px rgba(0,0,0,0.18)' : '0 4px 18px rgba(0,0,0,0.45)',
                transition: 'background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease',
              }}
            >
              View menu
            </button>
          </section>

          {/* ── BEST SELLING FOOD — 3-column portrait grid ── */}
          <section className="reveal reveal-3" style={{ padding: '20px 14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 900, color: theme.sectionTitle, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Best Selling Food
              </div>
              <button onClick={() => setActiveNav('menu')} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', color: '#E8321A', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                See all <ChevronRight size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {bestsellers.map((item, i) => (
                <div
                  key={i}
                  className="menu-card"
                  style={{
                    borderRadius: '18px', overflow: 'hidden', cursor: 'pointer',
                    position: 'relative', height: '240px',
                    minWidth: '160px', width: '160px', flexShrink: 0,
                    boxShadow: theme.cardShadow,
                    animationDelay: `${i * 60}ms`,
                    scrollSnapAlign: 'start',
                  }}
                  onClick={() => navigate(`/restaurant/${slug}/food/${encodeURIComponent(item.name)}`, { state: { item, returnTab: 'home', darkMode } })}
                >
                  {/* Full-bleed image */}
                  <img
                    src={item.img || '/menu/wagyu-ribeye.png'}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
                  />
                  {/* Bottom blur gradient overlay */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 60%, transparent 100%)',
                    backdropFilter: 'blur(2px)',
                    WebkitBackdropFilter: 'blur(2px)',
                    maskImage: 'linear-gradient(to top, black 40%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to top, black 40%, transparent 100%)',
                  }} />
                  {/* Add button — bottom right, stops propagation so it doesn't open detail */}
                  <button
                    onClick={e => { e.stopPropagation(); addToCart(item, e) }}
                    style={{
                      position: 'absolute', bottom: '10px', right: '10px',
                      background: 'rgba(255,255,255,0.92)',
                      border: 'none', borderRadius: '10px',
                      padding: '5px 10px',
                      fontSize: '11px', fontWeight: 800, color: '#111',
                      cursor: 'pointer', letterSpacing: '0.02em',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      display: 'flex', alignItems: 'center', gap: '3px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                      fontFamily: 'inherit',
                    }}
                  >
                    Add <span style={{ fontSize: '13px', lineHeight: 1 }}>+</span>
                  </button>
                </div>
              ))}
            </div>
          </section>


          {/* ── OUR STORY ── */}
          <section className="reveal reveal-4" style={{ padding: '24px 14px 0' }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: theme.sectionTitle, letterSpacing: '-0.01em' }}>Our Story</div>
              <div style={{ fontSize: '11px', color: theme.sectionSub, marginTop: '2px' }}>Where every plate tells a story</div>
            </div>

            {/* About hero image */}
            {carouselImages.length > 1 && (
              <div style={{ height: '155px', borderRadius: '16px', overflow: 'hidden', marginBottom: '12px', backgroundImage: `url(${carouselImages[1] || carouselImages[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />
              </div>
            )}

            {/* Philosophy card */}
            <div style={{
              background: theme.aboutCardBg,
              border: `1px solid ${theme.aboutCardBorder}`,
              borderRadius: '16px',
              padding: '20px 20px 20px 0',
              marginBottom: '10px',
              display: 'flex',
              gap: '0',
              overflow: 'hidden',
              position: 'relative',
            }}>
              {/* Crimson left accent bar */}
              <div style={{ width: '4px', minWidth: '4px', background: 'linear-gradient(to bottom, #E8321A, #c0200e)', borderRadius: '0 2px 2px 0', marginRight: '16px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.22em', color: '#E8321A', textTransform: 'uppercase' }}>The Philosophy</div>
                </div>
                {/* Opening quote mark */}
                <div style={{ fontSize: '42px', lineHeight: 0.6, color: '#E8321A', opacity: 0.25, fontFamily: 'Georgia, serif', marginBottom: '8px', userSelect: 'none' }}>"</div>
                <p style={{ fontSize: '14px', lineHeight: 1.8, color: theme.aboutText, margin: 0, fontStyle: 'italic' }}>
                  {restaurant.description || 'An uncompromising culinary experience rooted in craft, quality, and atmosphere. Every dish is a conversation between heritage and innovation.'}
                </p>
                {restaurant.additionalInfo && (
                  <p style={{ fontSize: '12px', lineHeight: 1.7, color: theme.aboutSub, marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.aboutSubBorder}`, margin: '12px 0 0', fontStyle: 'normal' }}>
                    {restaurant.additionalInfo}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Info */}
            <div style={{ background: theme.statsBg, border: `1px solid ${theme.statsBorder}`, borderRadius: '16px', padding: '18px', marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', color: theme.infoLabel, textTransform: 'uppercase', marginBottom: '14px' }}>Quick Info</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {restaurant.location && (
                  <InfoRow icon={<MapPin size={14} color="#E8321A" />} label="Location" value={restaurant.location} theme={theme} />
                )}
                {(() => {
                  const now = new Date()
                  const h = now.getHours()
                  const isOpen = h >= 12 && h < 23
                  return (
                    <InfoRow
                      icon={<Clock size={14} color={isOpen ? '#4ade80' : '#E8321A'} />}
                      label="Opening Hours"
                      value={`12:00 PM – 11:00 PM · ${isOpen ? 'Open Now' : 'Closed'}`}
                      theme={theme}
                    />
                  )
                })()}
                {restaurant.phone && (
                  <InfoRow icon={<Phone size={14} color="#60a5fa" />} label="Reservations" value={restaurant.phone} theme={theme} />
                )}
                {restaurant.rating && (
                  <InfoRow icon={<Star size={14} color="#FFB800" fill="#FFB800" />} label="Rating" value={`${restaurant.rating} / 5`} theme={theme} />
                )}
              </div>
            </div>
          </section>

          {/* ── FOOTER ── */}
          <footer style={{ margin: '16px 14px', background: theme.footerBg, border: `1px solid ${theme.footerBorder}`, borderRadius: '20px', padding: '24px 18px', textAlign: 'center', boxShadow: theme.cardShadow }}>
            <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.02em', color: theme.sectionTitle, marginBottom: '4px' }}>{restaurant.name}</div>
            {restaurant.location && (
              <div style={{ fontSize: '11px', color: theme.footerLocation, marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <MapPin size={10} /> {restaurant.location}
              </div>
            )}
            {(restaurant.socialLinks?.instagram || restaurant.socialLinks?.facebook || restaurant.socialLinks?.twitter || restaurant.socialLinks?.whatsapp) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '18px' }}>
                {restaurant.socialLinks?.instagram && <SocialBtn href={restaurant.socialLinks.instagram} icon={<FaInstagram size={19} />} brandColor="#E1306C" theme={theme} />}
                {restaurant.socialLinks?.facebook && <SocialBtn href={restaurant.socialLinks.facebook} icon={<FaFacebook size={19} />} brandColor="#1877F2" theme={theme} />}
                {restaurant.socialLinks?.twitter && <SocialBtn href={restaurant.socialLinks.twitter} icon={<FaXTwitter size={18} />} brandColor="#000000" theme={theme} />}
                {restaurant.socialLinks?.whatsapp && <SocialBtn href={restaurant.socialLinks.whatsapp} icon={<FaWhatsapp size={19} />} brandColor="#25D366" theme={theme} />}
              </div>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name + ' ' + (restaurant.location || ''))}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.25)', borderRadius: '50px', padding: '10px 20px', color: '#FFB800', fontSize: '12px', fontWeight: 700, textDecoration: 'none', letterSpacing: '0.04em' }}
            >
              <Star size={12} fill="#FFB800" /> Rate Us on Google
            </a>
            <div style={{ marginTop: '18px', fontSize: '10px', color: theme.footerLocation, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Powered by EXZIBO</div>
          </footer>
        </div>
      )}

      {/* ── MENU VIEW ── */}
      {activeNav === 'menu' && (
        <div style={{ animation: 'fadeIn 0.3s ease', paddingBottom: cartCount > 0 ? '130px' : '100px', transition: 'padding-bottom 0.3s ease' }}>

          {/* Menu Cards */}
          <div style={{ padding: '4px 14px 8px' }}>
            {activeMenuItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: theme.tabInactiveColor, fontSize: '13px' }}>No items in this category yet</div>
            )}
            {activeMenuItems.map((item, i) => {
              const inCart = cartItems.find(c => c.name === item.name)
              return (
                <MenuCard
                  key={`${activeMenuTab}-${i}`}
                  item={item}
                  theme={theme}
                  onAddToCart={addToCart}
                  cartQty={inCart ? inCart.qty : 0}
                  onPress={() => navigate(`/restaurant/${slug}/food/${encodeURIComponent(item.name)}`, { state: { item, returnTab: activeNav, darkMode } })}
                />
              )
            })}
          </div>

          {/* Banner */}
          <div style={{ padding: '24px 20px 8px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: '48px', fontWeight: 900, lineHeight: 1.1, color: theme.bannerText, letterSpacing: '-0.02em', userSelect: 'none' }}>
              Explore the menus, taste the city
            </div>
            <div style={{ position: 'absolute', right: '28px', top: '28px', opacity: 0.8 }}>
              <Heart size={34} fill={theme.bannerHeart} color={theme.bannerHeart} />
            </div>
          </div>
          <div style={{ padding: '0 20px 24px', fontSize: '11px', fontWeight: 700, color: theme.brandText, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Exzibo</div>
        </div>
      )}

      {/* ── FLOATING CART BUTTON (draggable, right side) ── */}
      {(activeNav === 'home' || activeNav === 'menu' || activeNav === 'orders') && cartCount > 0 && (() => {
        const previewImgs = cartItems.slice(0, 2).map(i => i.img)
        const imgSize = 32
        const overlap = 10
        const stackWidth = previewImgs.length === 1 ? imgSize : imgSize + (imgSize - overlap)
        return (
          <button
            onMouseDown={onCartBtnPointerDown}
            onTouchStart={onCartBtnPointerDown}
            onClick={onCartBtnClick}
            style={{
              position: 'fixed',
              ...(cartBtnXY
                ? { left: cartBtnXY.left, top: cartBtnXY.top }
                : { right: '16px', bottom: '100px' }),
              zIndex: 80,
              background: '#111', border: 'none', borderRadius: '20px',
              height: '56px',
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '0 16px 0 12px',
              cursor: 'grab',
              boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
              userSelect: 'none', touchAction: 'none',
            }}
          >
            {/* Overlapping item images */}
            <div style={{ position: 'relative', width: `${stackWidth}px`, height: `${imgSize}px`, flexShrink: 0 }}>
              {previewImgs.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt=""
                  style={{
                    position: 'absolute',
                    left: `${idx * (imgSize - overlap)}px`,
                    top: 0,
                    width: `${imgSize}px`,
                    height: `${imgSize}px`,
                    borderRadius: '999px',
                    objectFit: 'cover',
                    border: '2px solid #111',
                    zIndex: previewImgs.length - idx,
                  }}
                />
              ))}
            </div>
            {/* Count + cart icon */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
              <ShoppingCart size={18} color="#fff" strokeWidth={2.2} />
              <span style={{
                background: '#1DB954', color: '#fff',
                fontSize: '9px', fontWeight: 800,
                borderRadius: '6px', padding: '1px 5px',
                minWidth: '16px', textAlign: 'center', lineHeight: '14px',
              }}>{cartCount}</span>
            </div>
          </button>
        )
      })()}

      {/* ── CART VIEW ── */}
      {activeNav === 'cart' && (
        <div style={{ animation: 'fadeIn 0.3s ease', paddingBottom: '100px' }}>
          <style>{`
            .cart-item-card { transition: box-shadow 0.2s ease, transform 0.15s ease; }
            .cart-item-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.13) !important; }
            .qty-btn { transition: background 0.15s ease, transform 0.1s ease; }
            .qty-btn:active { transform: scale(0.88); }
            .delete-btn { transition: color 0.15s ease, background 0.15s ease; }
            .delete-btn:hover { background: rgba(232,50,26,0.10) !important; color: #E8321A !important; }
            .coupon-apply-btn { transition: background 0.15s ease, transform 0.1s ease; }
            .coupon-apply-btn:active { transform: scale(0.96); }
            .checkout-btn { transition: opacity 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease; }
            .checkout-btn:hover { opacity: 0.92; box-shadow: 0 12px 32px rgba(232,50,26,0.50) !important; }
            .checkout-btn:active { transform: scale(0.98); }
          `}</style>

          {/* Section title */}
          <div style={{ padding: '22px 18px 8px' }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: theme.color, letterSpacing: '-0.01em' }}>Your Order</div>
          </div>

          {/* Empty state */}
          {cartItems.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: '14px', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '36px', background: darkMode ? 'rgba(255,255,255,0.05)' : '#f0ece8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={32} color={darkMode ? '#555' : '#ccc'} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: theme.color }}>Your cart is empty</div>
              <div style={{ fontSize: '13px', color: theme.locationColor, textAlign: 'center', lineHeight: 1.6, maxWidth: '220px' }}>Browse the menu and add your favourite dishes!</div>
              <button
                onClick={() => setActiveNav('menu')}
                style={{ marginTop: '8px', background: '#E8321A', color: '#fff', border: 'none', borderRadius: '14px', padding: '12px 28px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(232,50,26,0.35)' }}
              >
                Browse Menu
              </button>
            </div>
          )}

          {/* Cart items */}
          {cartItems.length > 0 && (
            <div style={{ padding: '4px 14px 0' }}>
              {cartItems.map(item => (
                <div
                  key={item.id}
                  className="cart-item-card"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: theme.cardBg,
                    border: `1px solid ${theme.cardBorder}`,
                    borderRadius: '18px',
                    padding: '14px',
                    marginBottom: '12px',
                    boxShadow: theme.cardShadow,
                    position: 'relative',
                  }}
                >
                  {/* Food image */}
                  <div style={{ flexShrink: 0, width: '72px', height: '72px', borderRadius: '13px', overflow: 'hidden', background: darkMode ? '#222' : '#f5f1ee' }}>
                    <img
                      src={item.img}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
                    />
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: theme.color, lineHeight: 1.3, flex: 1 }}>{item.name}</div>
                      <button
                        className="delete-btn"
                        onClick={() => removeItem(item.id)}
                        style={{ flexShrink: 0, background: darkMode ? 'rgba(255,255,255,0.06)' : '#f5f1ee', border: 'none', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#666' : '#bbb', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#E8321A', marginTop: '4px' }}>₹{(item.price * item.qty).toLocaleString('en-IN')}</div>

                    {/* Quantity stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '8px', width: 'fit-content' }}>
                      <button
                        className="qty-btn"
                        onClick={() => updateQty(item.id, -1)}
                        style={{ width: '28px', height: '28px', borderRadius: '8px', border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`, background: darkMode ? 'rgba(255,255,255,0.05)' : '#f5f5f5', color: theme.color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <Minus size={12} strokeWidth={2.5} />
                      </button>
                      <span style={{ minWidth: '28px', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: theme.color }}>{item.qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateQty(item.id, 1)}
                        style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: '#E8321A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <Plus size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Coupon + Summary card */}
          {cartItems.length > 0 && (
            <>
            <div style={{ padding: '4px 14px 0' }}>
              <div style={{
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: theme.cardShadow,
              }}>

                {/* Coupon section */}
                <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${theme.cardBorder}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <Tag size={13} color="#E8321A" strokeWidth={2.5} />
                    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', color: '#E8321A', textTransform: 'uppercase' }}>Apply Coupon</span>
                  </div>
                  {couponApplied ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.08)', border: '1.5px solid rgba(34,197,94,0.25)', borderRadius: '12px', padding: '11px 14px' }}>
                      <CheckCircle size={16} color="#22c55e" />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e', flex: 1 }}>SPICE10 applied — 10% off!</span>
                      <button
                        onClick={() => { setCouponApplied(false); setCouponInput('') }}
                        style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: '0' }}
                      >Remove</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          value={couponInput}
                          onChange={e => { setCouponInput(e.target.value); setCouponError('') }}
                          onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                          placeholder="Enter code (SPICE10)"
                          style={{
                            flex: 1, background: darkMode ? 'rgba(255,255,255,0.05)' : '#f7f3f0',
                            border: `1.5px solid ${couponError ? 'rgba(232,50,26,0.4)' : (darkMode ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)')}`,
                            borderRadius: '12px', padding: '11px 14px', fontSize: '13px', color: theme.color,
                            outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s',
                          }}
                        />
                        <button
                          className="coupon-apply-btn"
                          onClick={handleApplyCoupon}
                          style={{ background: '#E8321A', color: '#fff', border: 'none', borderRadius: '12px', padding: '11px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(232,50,26,0.30)' }}
                        >
                          Apply
                        </button>
                      </div>
                      {couponError && (
                        <div style={{ fontSize: '11px', color: '#E8321A', marginTop: '6px', fontWeight: 600, paddingLeft: '2px' }}>{couponError}</div>
                      )}
                    </>
                  )}
                </div>

              </div>
            </div>

            {/* Dark Order Summary + Place Order Card */}
            <div style={{ padding: '14px 14px 8px' }}>
              <div style={{
                background: 'linear-gradient(160deg, #1e1e1e 0%, #141414 100%)',
                borderRadius: '22px',
                padding: '20px 20px 6px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                {/* Subtotal row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>Subtotal</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                {/* GST row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>GST (5%)</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>₹{gstAmt.toLocaleString('en-IN')}</span>
                </div>
                {/* Delivery row */}
                {deliveryFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>Delivery</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>₹{deliveryFee}</span>
                  </div>
                )}
                {/* Discount row */}
                {couponApplied && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: 600 }}>Discount (SPICE10)</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>−₹{discountAmt.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {/* Divider */}
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '6px 0 14px' }} />
                {/* Grand Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <span style={{ fontSize: '17px', fontWeight: 900, color: '#fff' }}>Grand Total</span>
                  <span style={{ fontSize: '20px', fontWeight: 900, color: '#FFB800' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
                </div>
                {/* Place Order button */}
                <button
                  className="checkout-btn"
                  onClick={() => setShowOrderConfirm(true)}
                  style={{
                    width: '100%',
                    background: '#E8321A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '16px',
                    padding: '16px',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    letterSpacing: '0.01em',
                    boxShadow: '0 6px 24px rgba(232,50,26,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '14px',
                  }}
                >
                  Place Order <span style={{ fontSize: '16px' }}>→</span>
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {/* ── ORDERS VIEW ── */}
      {activeNav === 'orders' && (
        <div style={{ animation: 'fadeIn 0.35s ease', paddingBottom: '90px' }}>
          <style>{`
            @keyframes checkDraw {
              0% { stroke-dashoffset: 80; opacity: 0; }
              40% { opacity: 1; }
              100% { stroke-dashoffset: 0; opacity: 1; }
            }
            @keyframes successPop {
              0% { transform: scale(0.6); opacity: 0; }
              60% { transform: scale(1.08); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes progressFill {
              from { width: 0%; }
              to { width: 100%; }
            }
            @keyframes statusBounce {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.15); }
            }
            .waiter-btn { transition: transform 0.2s ease, box-shadow 0.2s ease; }
            .waiter-btn:hover { transform: scale(1.03); box-shadow: 0 8px 24px rgba(0,0,0,0.18) !important; }
            .waiter-btn:active { transform: scale(0.97); }
            .reorder-btn { transition: background 0.2s ease, transform 0.15s ease; }
            .reorder-btn:hover { opacity: 0.88; transform: scale(1.02); }
            .reorder-btn:active { transform: scale(0.97); }
            .copy-id-btn { transition: color 0.15s ease; }
            .copy-id-btn:hover { color: #E8321A !important; }
          `}</style>

          {/* ── VIEWING HISTORY ORDER DETAIL ── */}
          {viewingHistoryOrder && (
            <div style={{ padding: '18px 14px 0', animation: 'fadeIn 0.3s ease' }}>
              {/* Back + Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <button onClick={() => setViewingHistoryOrder(null)} style={{ width: '36px', height: '36px', borderRadius: '18px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.10)', flexShrink: 0 }}>
                  <ArrowLeft size={16} color={theme.color} />
                </button>
                <div style={{ fontSize: '20px', fontWeight: 900, color: theme.color, letterSpacing: '-0.01em' }}>Order Detail</div>
              </div>
              {/* Order card */}
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '20px', padding: '14px 16px', boxShadow: theme.cardShadow, marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {viewingHistoryOrder.items.slice(0, 2).map((item, i) => (
                      <div key={i} style={{ width: '48px', height: '48px', borderRadius: '12px', overflow: 'hidden', background: darkMode ? '#2a2a2a' : '#f0ece8' }}>
                        <img src={item.img} alt={item.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: theme.locationColor, fontWeight: 500, marginBottom: '3px' }}>ORDER ID</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: theme.color }}>#{viewingHistoryOrder.id}</span>
                      <button className="copy-id-btn" onClick={() => navigator.clipboard?.writeText(viewingHistoryOrder.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.locationColor, padding: '2px', display: 'flex', alignItems: 'center' }}>
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                </div>
                {/* Full tracker (all done) */}
                <div>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ position: 'absolute', top: '14px', left: '14px', right: '14px', height: '3px', background: '#E8321A', borderRadius: '2px', zIndex: 0 }} />
                    {['PLACED', 'CONFIRM', 'DELIVERED'].map((label, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 1, flex: 1 }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '14px', background: '#E8321A', border: '2px solid #E8321A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px rgba(232,50,26,0.15)' }}>
                          <CheckCircle size={14} color="#fff" strokeWidth={2.5} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    {['PLACED', 'CONFIRM', 'DELIVERED'].map((label, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '9px', fontWeight: 800, color: theme.color, letterSpacing: '0.08em' }}>{label}</div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Order Details pill */}
              <div style={{ background: 'linear-gradient(135deg, #0f0f0f 0%, #1c1c1c 50%, #0f0f0f 100%)', borderRadius: '16px', padding: '16px 24px', textAlign: 'center', marginBottom: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Order Details</span>
              </div>
              {/* Billing */}
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '20px', overflow: 'hidden', boxShadow: theme.cardShadow, marginBottom: '14px' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.cardBorder}` }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.14em', color: theme.locationColor, textTransform: 'uppercase' }}>Billing Details</span>
                </div>
                {[
                  { label: 'DATE', value: viewingHistoryOrder.date },
                  { label: 'Total Items', value: `${viewingHistoryOrder.itemCount}  ITEMS` },
                  { label: 'Sub total', value: `₹${viewingHistoryOrder.subtotal.toLocaleString('en-IN')}  INR` },
                  { label: 'STATUS', value: 'DELIVERED', highlight: true },
                ].map(({ label, value, highlight }, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${theme.cardBorder}` : 'none' }}>
                    <span style={{ fontSize: '13px', color: theme.locationColor, fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: highlight ? '#22c55e' : theme.color }}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Reorder */}
              <button className="reorder-btn" onClick={() => { setCartItems(viewingHistoryOrder.items.map(i => ({ ...i }))); setViewingHistoryOrder(null); setActiveNav('cart') }} style={{ width: '100%', background: 'linear-gradient(135deg, #1c1c1c, #2a2a2a)', color: '#fff', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '15px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginBottom: '4px' }}>
                ↺  Reorder Same Items
              </button>
            </div>
          )}

          {/* ── MAIN ORDERS VIEW (no history order selected) ── */}
          {!viewingHistoryOrder && (
            <>
          {/* No order state */}
          {!currentOrder && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 24px 24px', gap: '14px' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '36px', background: darkMode ? 'rgba(255,255,255,0.05)' : '#f0ece8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={30} color={darkMode ? '#555' : '#ccc'} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: theme.color }}>No active order</div>
              <div style={{ fontSize: '13px', color: theme.locationColor, textAlign: 'center', lineHeight: 1.6, maxWidth: '220px' }}>Place an order from the cart to track it here</div>
              <button onClick={() => setActiveNav('menu')} style={{ marginTop: '8px', background: '#E8321A', color: '#fff', border: 'none', borderRadius: '14px', padding: '12px 28px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(232,50,26,0.35)' }}>
                Browse Menu
              </button>
            </div>
          )}

          {/* Order page */}
          {currentOrder && (
            <div style={{ padding: '18px 14px 0' }}>

              {/* Back + Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <button onClick={() => setActiveNav('home')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.10)', flexShrink: 0 }}>
                  <ArrowLeft size={16} color={theme.color} />
                </button>
                <div style={{ fontSize: '20px', fontWeight: 900, color: theme.color, letterSpacing: '-0.01em' }}>Your Order</div>
              </div>

              {/* ── ORDER CARD ── */}
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '20px', padding: '14px 16px', boxShadow: theme.cardShadow, marginBottom: '20px' }}>
                {/* Top row: thumbnails + ID + menu btn */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  {/* Food thumbs */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {currentOrder.items.slice(0, 2).map((item, i) => (
                      <div key={i} style={{ width: '48px', height: '48px', borderRadius: '12px', overflow: 'hidden', background: darkMode ? '#2a2a2a' : '#f0ece8' }}>
                        <img src={item.img} alt={item.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }} />
                      </div>
                    ))}
                  </div>
                  {/* Order ID */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: theme.locationColor, fontWeight: 500, marginBottom: '3px' }}>ORDER ID</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: theme.color, letterSpacing: '0.02em' }}>#{currentOrder.id}</span>
                      <button
                        className="copy-id-btn"
                        onClick={() => navigator.clipboard?.writeText(currentOrder.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.locationColor, padding: '2px', display: 'flex', alignItems: 'center' }}
                        title="Copy order ID"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                  {/* Menu button */}
                  <button onClick={() => setActiveNav('menu')} style={{ flexShrink: 0, background: '#E8321A', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 16px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(232,50,26,0.40)' }}>
                    MENU
                  </button>
                </div>

                {/* ── STATUS TRACKER ── */}
                {(() => {
                  const confirmed = orderStatus >= 1
                  const steps = [
                    { label: 'PLACED', done: true },
                    { label: 'CONFIRMED', done: confirmed },
                  ]
                  return (
                    <div>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        {/* Progress track */}
                        <div style={{ position: 'absolute', top: '14px', left: '14px', right: '14px', height: '3px', background: darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', borderRadius: '2px', zIndex: 0 }}>
                          <div style={{ height: '100%', borderRadius: '2px', background: '#E8321A', width: confirmed ? '100%' : '0%', transition: 'width 0.8s ease' }} />
                        </div>
                        {steps.map((step, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 1, flex: 1 }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '14px',
                              background: step.done ? '#E8321A' : (darkMode ? 'rgba(255,255,255,0.10)' : '#e5e0db'),
                              border: `2px solid ${step.done ? '#E8321A' : (darkMode ? 'rgba(255,255,255,0.15)' : '#ddd')}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: step.done ? '0 0 0 4px rgba(232,50,26,0.15)' : 'none',
                              animation: step.done ? 'statusBounce 0.5s ease' : 'none',
                              transition: 'all 0.4s ease',
                            }}>
                              {step.done
                                ? <CheckCircle size={14} color="#fff" strokeWidth={2.5} />
                                : <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: darkMode ? 'rgba(255,255,255,0.25)' : '#ccc' }} />
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        {steps.map((step, i) => (
                          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '9px', fontWeight: step.done ? 800 : 600, color: step.done ? theme.color : theme.locationColor, letterSpacing: '0.08em' }}>
                            {step.label}
                          </div>
                        ))}
                      </div>

                      {/* ── THANK YOU MESSAGE (shown when confirmed) ── */}
                      {confirmed && (
                        <div style={{
                          marginTop: '16px',
                          background: darkMode ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.07)',
                          border: '1px solid rgba(34,197,94,0.25)',
                          borderRadius: '14px',
                          padding: '14px 16px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                        }}>
                          <div style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>🙏</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#22c55e', marginBottom: '4px' }}>Thank you for your order!</div>
                            <div style={{ fontSize: '12px', lineHeight: 1.6, color: theme.locationColor }}>
                              Please wait a moment — your order is being prepared with care and will be with you right on time.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* ── ORDER DETAILS PILL ── */}
              <div style={{ background: 'linear-gradient(135deg, #0f0f0f 0%, #1c1c1c 50%, #0f0f0f 100%)', borderRadius: '16px', padding: '16px 24px', textAlign: 'center', marginBottom: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff', letterSpacing: '0.18em', textTransform: 'uppercase', textShadow: '0 0 20px rgba(255,255,255,0.2)' }}>Order Details</span>
              </div>

              {/* ── BILLING DETAILS CARD ── */}
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '20px', overflow: 'hidden', boxShadow: theme.cardShadow, marginBottom: '14px' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.cardBorder}` }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.14em', color: theme.locationColor, textTransform: 'uppercase' }}>Billing Details</span>
                </div>
                {[
                  { label: 'DATE', value: currentOrder.date },
                  { label: 'Total Items', value: `${currentOrder.itemCount}  ITEMS` },
                  { label: 'Sub total', value: `₹${currentOrder.subtotal.toLocaleString('en-IN')}  INR` },
                  { label: 'STATUS', value: orderStatus >= 1 ? 'CONFIRMED' : 'PLACED', highlight: orderStatus >= 1 },
                ].map(({ label, value, highlight }, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${theme.cardBorder}` : 'none' }}>
                    <span style={{ fontSize: '13px', color: theme.locationColor, fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: highlight ? '#22c55e' : theme.color }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* ── CALL WAITER ── */}
              <div
                className="waiter-btn"
                style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', boxShadow: theme.cardShadow, cursor: 'pointer' }}
              >
                <span style={{ fontSize: '15px', fontWeight: 700, color: theme.color }}>Call Waiter</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '18px', background: darkMode ? 'rgba(255,255,255,0.07)' : '#f5f1ee', border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={16} color={theme.locationColor} />
                  </div>
                  <div style={{ width: '36px', height: '36px', borderRadius: '18px', background: '#1a1a1a', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                    <PhoneCall size={16} color="#fff" />
                  </div>
                </div>
              </div>

              {/* ── NOTES / REORDER ── */}
              <textarea
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                placeholder="Special instructions or notes..."
                rows={4}
                style={{
                  width: '100%', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`,
                  borderRadius: '18px', padding: '16px', fontSize: '13px', color: theme.color,
                  fontFamily: 'inherit', resize: 'none', boxShadow: theme.cardShadow, outline: 'none',
                  marginBottom: '14px', boxSizing: 'border-box', lineHeight: 1.6,
                }}
              />

              {/* Reorder button */}
              <button
                className="reorder-btn"
                onClick={() => {
                  if (currentOrder) {
                    setCartItems(currentOrder.items.map(i => ({ ...i })))
                    setActiveNav('cart')
                  }
                }}
                style={{ width: '100%', background: 'linear-gradient(135deg, #1c1c1c, #2a2a2a)', color: '#fff', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '15px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}
              >
                ↺  Reorder Same Items
              </button>
            </div>
          )}

          {/* ── RECENT ORDERS HISTORY ── */}
          {orderHistory.length > 0 && (
            <div style={{ padding: '28px 14px 8px', animation: 'fadeIn 0.4s ease' }}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: theme.color, letterSpacing: '-0.01em' }}>Recent Orders</span>
                <span style={{ fontSize: '12px', color: theme.locationColor, fontWeight: 500 }}>{orderHistory.length} order{orderHistory.length !== 1 ? 's' : ''}</span>
              </div>
              {/* History list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '20px', overflow: 'hidden', boxShadow: theme.cardShadow }}>
                {orderHistory.map((order, idx) => {
                  const itemNames = order.items.map(i => i.name).join(', ')
                  const truncated = itemNames.length > 38 ? itemNames.slice(0, 36) + '…' : itemNames
                  const isLast = idx === orderHistory.length - 1
                  return (
                    <button
                      key={order.id}
                      onClick={() => setViewingHistoryOrder(order)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '14px 16px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: isLast ? 'none' : `1px solid ${theme.cardBorder}`,
                        textAlign: 'left', width: '100%',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {/* Thumbnail */}
                      <div style={{ width: '64px', height: '64px', borderRadius: '14px', overflow: 'hidden', background: darkMode ? '#2a2a2a' : '#f0ece8', flexShrink: 0, border: `1px solid ${theme.cardBorder}` }}>
                        <img
                          src={order.items[0]?.img}
                          alt={order.items[0]?.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
                        />
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '4px', background: '#22c55e', flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 800, color: theme.color }}>Delivered on {order.date}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: theme.locationColor, fontWeight: 400, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                          {truncated}
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#E8321A' }}>
                          ₹{order.grandTotal.toLocaleString('en-IN')}
                        </div>
                      </div>
                      {/* Chevron */}
                      <ChevronRight size={18} color={theme.locationColor} style={{ flexShrink: 0 }} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* close !viewingHistoryOrder wrapper */}
          </>
          )}
        </div>
      )}

      {/* ── BOOKING VIEW ── */}
      {activeNav === 'booking' && (
        <div style={{ animation: 'fadeIn 0.3s ease', padding: '24px 16px 110px', minHeight: '100vh' }}>
          <style>{`
            .book-input { width: 100%; background: ${darkMode ? 'rgba(255,255,255,0.06)' : '#f5f3f1'}; border: 1.5px solid ${darkMode ? 'rgba(255,255,255,0.10)' : '#e5e0db'}; border-radius: 16px; padding: 15px 16px; font-size: 14px; color: ${darkMode ? '#fff' : '#111'}; font-family: inherit; outline: none; transition: border-color 0.2s ease; box-sizing: border-box; }
            .book-input::placeholder { color: ${darkMode ? 'rgba(255,255,255,0.32)' : '#bbb'}; }
            .book-input:focus { border-color: #E8321A; }
            .book-input-err { border-color: #E8321A !important; }
            .book-input option { background: ${darkMode ? '#1a1a1a' : '#fff'}; color: ${darkMode ? '#fff' : '#111'}; }
            .reserve-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
            .reserve-btn:hover { transform: scale(1.02); box-shadow: 0 10px 32px rgba(232,50,26,0.5) !important; }
            .reserve-btn:active { transform: scale(0.97); }
            .seat-pill { transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease; cursor: pointer; }
          `}</style>

          {bookingSubmitted ? (
            /* ── SUCCESS STATE ── */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: '18px', textAlign: 'center', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '40px', background: 'rgba(232,50,26,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={36} color="#E8321A" />
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: theme.color, letterSpacing: '-0.01em' }}>Table Reserved!</div>
              <div style={{ fontSize: '14px', color: theme.locationColor, lineHeight: 1.7, maxWidth: '260px' }}>
                Your table for <strong style={{ color: theme.color }}>{bookingForm.guests}</strong> on <strong style={{ color: theme.color }}>{bookingForm.date}</strong> at <strong style={{ color: theme.color }}>{bookingForm.time}</strong> has been confirmed.
              </div>
              <div style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '16px', padding: '16px 20px', width: '100%', maxWidth: '320px' }}>
                {[
                  { label: 'Name', value: bookingForm.name },
                  { label: 'Seating', value: bookingForm.seating },
                  { label: 'Occasion', value: bookingForm.occasion },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                    <span style={{ fontSize: '12px', color: theme.locationColor }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: theme.color }}>{value}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { setBookingSubmitted(false); setBookingForm({ name: '', phone: '', email: '', date: '', time: '19:00', guests: 2, occasion: 'Casual Dining', seating: 'Indoor', notes: '' }) }}
                style={{ background: '#E8321A', color: '#fff', border: 'none', borderRadius: '14px', padding: '13px 32px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(232,50,26,0.35)', marginTop: '8px' }}>
                Make Another Booking
              </button>
            </div>
          ) : (
            <>
              {/* Title */}
              <div style={{ marginBottom: '6px', fontSize: '26px', fontWeight: 900, color: theme.color, letterSpacing: '-0.02em' }}>Book a Table</div>
              <div style={{ fontSize: '13px', color: theme.locationColor, marginBottom: '24px', lineHeight: 1.5 }}>Join us for an unforgettable culinary journey.</div>

              {/* Full Name */}
              <div style={{ marginBottom: '12px' }}>
                <input className={`book-input${bookingErrors.name ? ' book-input-err' : ''}`} type="text" placeholder="Full Name" value={bookingForm.name} onChange={e => handleBookingChange('name', e.target.value)} />
                {bookingErrors.name && <div style={{ fontSize: '11px', color: '#E8321A', marginTop: '4px', paddingLeft: '4px' }}>Name is required</div>}
              </div>

              {/* Phone */}
              <div style={{ marginBottom: '12px' }}>
                <input className={`book-input${bookingErrors.phone ? ' book-input-err' : ''}`} type="tel" placeholder="Phone Number" value={bookingForm.phone} onChange={e => handleBookingChange('phone', e.target.value)} />
                {bookingErrors.phone && <div style={{ fontSize: '11px', color: '#E8321A', marginTop: '4px', paddingLeft: '4px' }}>Phone is required</div>}
              </div>

              {/* Email */}
              <div style={{ marginBottom: '16px' }}>
                <input className={`book-input${bookingErrors.email ? ' book-input-err' : ''}`} type="email" placeholder="Email Address" value={bookingForm.email} onChange={e => handleBookingChange('email', e.target.value)} />
                {bookingErrors.email && <div style={{ fontSize: '11px', color: '#E8321A', marginTop: '4px', paddingLeft: '4px' }}>Email is required</div>}
              </div>

              {/* Date + Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: theme.locationColor, letterSpacing: '0.12em', marginBottom: '6px', paddingLeft: '2px' }}>DATE</div>
                  <div style={{ position: 'relative' }}>
                    <input className={`book-input${bookingErrors.date ? ' book-input-err' : ''}`} type="date"
                      value={bookingForm.date}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => handleBookingChange('date', e.target.value)}
                      style={{ paddingLeft: '36px', colorScheme: darkMode ? 'dark' : 'light' }}
                    />
                    <CalendarDays size={15} color={theme.locationColor} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: theme.locationColor, letterSpacing: '0.12em', marginBottom: '6px', paddingLeft: '2px' }}>TIME</div>
                  <div style={{ position: 'relative' }}>
                    <input className="book-input" type="time" value={bookingForm.time} onChange={e => handleBookingChange('time', e.target.value)} style={{ paddingLeft: '36px', colorScheme: darkMode ? 'dark' : 'light' }} />
                    <Clock size={15} color="#E8321A" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>

              {/* Guests */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: theme.locationColor, letterSpacing: '0.12em' }}>NUMBER OF GUESTS</div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: theme.color }}>{bookingForm.guests}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: darkMode ? 'rgba(255,255,255,0.06)' : '#f5f3f1', border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.10)' : '#e5e0db'}`, borderRadius: '16px', overflow: 'hidden' }}>
                  <button onClick={() => handleBookingChange('guests', Math.max(1, bookingForm.guests - 1))} style={{ width: '52px', height: '50px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: theme.color, fontWeight: 300, fontFamily: 'inherit', flexShrink: 0 }}>−</button>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Users size={16} color={theme.locationColor} />
                    <span style={{ fontSize: '16px', fontWeight: 700, color: theme.color }}>{bookingForm.guests}</span>
                  </div>
                  <button onClick={() => handleBookingChange('guests', Math.min(20, bookingForm.guests + 1))} style={{ width: '52px', height: '50px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#E8321A', fontWeight: 300, fontFamily: 'inherit', flexShrink: 0 }}>+</button>
                </div>
              </div>

              {/* Occasion */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: theme.locationColor, letterSpacing: '0.12em', marginBottom: '6px', paddingLeft: '2px' }}>OCCASION</div>
                <div style={{ position: 'relative' }}>
                  <select className="book-input" value={bookingForm.occasion} onChange={e => handleBookingChange('occasion', e.target.value)} style={{ paddingLeft: '36px', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                    {['Casual Dining', 'Birthday Celebration', 'Anniversary', 'Business Dinner', 'Date Night', 'Family Gathering', 'Other'].map(o => <option key={o}>{o}</option>)}
                  </select>
                  <Star size={15} color="#E8321A" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <ChevronRight size={15} color={theme.locationColor} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%) rotate(90deg)', pointerEvents: 'none' }} />
                </div>
              </div>

              {/* Seating Preference */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: theme.locationColor, letterSpacing: '0.12em', marginBottom: '10px' }}>SEATING PREFERENCE</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['Indoor', 'Outdoor', 'Private'].map(s => {
                    const active = bookingForm.seating === s
                    return (
                      <button key={s} className="seat-pill" onClick={() => handleBookingChange('seating', s)}
                        style={{ flex: 1, padding: '11px 8px', borderRadius: '14px', border: `1.5px solid ${active ? '#E8321A' : (darkMode ? 'rgba(255,255,255,0.12)' : '#e0dbd6')}`, background: active ? '#E8321A' : (darkMode ? 'rgba(255,255,255,0.05)' : '#f5f3f1'), color: active ? '#fff' : theme.color, fontSize: '13px', fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Special Requests */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: theme.locationColor, letterSpacing: '0.12em', marginBottom: '6px' }}>SPECIAL REQUESTS</div>
                <textarea className="book-input" rows={4} placeholder="Any allergies or special requirements?" value={bookingForm.notes} onChange={e => handleBookingChange('notes', e.target.value)}
                  style={{ resize: 'none', lineHeight: 1.6 }} />
              </div>

              {/* Submit Button */}
              <button className="reserve-btn" onClick={handleBookingSubmit}
                style={{ width: '100%', background: 'linear-gradient(135deg, #E8321A 0%, #ff6b35 100%)', color: '#fff', border: 'none', borderRadius: '20px', padding: '18px', fontSize: '16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.01em', boxShadow: '0 8px 28px rgba(232,50,26,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                Reserve My Table <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      )}


      {/* ── SUCCESS POPUP OVERLAY ── */}
      {/* ── ORDER CONFIRMATION MODAL ── */}
      {showOrderConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 210,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setShowOrderConfirm(false)}
        >
          <div
            style={{
              background: darkMode ? '#1a1a1a' : '#fff',
              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}`,
              borderRadius: '28px 28px 0 0',
              padding: '28px 24px 36px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 -12px 48px rgba(0,0,0,0.3)',
              animation: 'slideUp 0.3s cubic-bezier(0.34,1.1,0.64,1) both',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', margin: '0 auto 24px' }} />
            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '28px', background: 'rgba(232,50,26,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={26} color="#E8321A" />
              </div>
            </div>
            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '20px', fontWeight: 900, color: theme.color, letterSpacing: '-0.01em', marginBottom: '6px' }}>Confirm your order?</div>
              <div style={{ fontSize: '13px', color: theme.locationColor, lineHeight: 1.6 }}>
                {cartItems.reduce((s, i) => s + i.qty, 0)} item{cartItems.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''} · <span style={{ fontWeight: 700, color: theme.color }}>₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
            {/* Divider */}
            <div style={{ height: '1px', background: darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', margin: '20px 0' }} />
            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowOrderConfirm(false)}
                style={{
                  flex: 1, padding: '14px', borderRadius: '16px',
                  background: darkMode ? 'rgba(255,255,255,0.07)' : '#f2f2f2',
                  border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                  color: theme.color, fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowOrderConfirm(false); handlePlaceOrder() }}
                style={{
                  flex: 2, padding: '14px', borderRadius: '16px',
                  background: '#E8321A', border: 'none',
                  color: '#fff', fontSize: '14px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 20px rgba(232,50,26,0.40)',
                  letterSpacing: '0.01em',
                }}
              >
                Confirm Order ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessPopup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{
            background: 'linear-gradient(160deg, #1a1a1a 0%, #111 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '28px',
            padding: '40px 36px',
            textAlign: 'center',
            maxWidth: '300px',
            width: '85%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            animation: 'successPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            {/* Animated checkmark */}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="33" fill="none" stroke="rgba(34,197,94,0.18)" strokeWidth="4" />
                <circle cx="36" cy="36" r="33" fill="none" stroke="#22c55e" strokeWidth="4"
                  strokeDasharray="207" strokeDashoffset="207"
                  style={{ animation: 'checkDraw 0.6s 0.15s ease forwards', strokeLinecap: 'round' }}
                />
                <polyline points="22,36 32,46 50,28" fill="none" stroke="#22c55e" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="80" strokeDashoffset="80"
                  style={{ animation: 'checkDraw 0.5s 0.5s ease forwards' }}
                />
              </svg>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '8px', letterSpacing: '-0.01em' }}>
              Order Placed! 🎉
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              Preparing your delicious food…
            </div>
          </div>
        </div>
      )}

      <nav style={{
        position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)', maxWidth: '440px', zIndex: 100,
        background: theme.navBg,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '22px',
        boxShadow: darkMode ? '0 8px 28px rgba(0,0,0,0.15)' : '0 8px 28px rgba(0,0,0,0.55)',
        height: '68px',
        padding: '0 16px',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
      }}>
        {[
          { id: 'home', icon: <FaHouse size={22} /> },
          { id: 'menu', icon: <FaUtensils size={20} /> },
          {
            id: 'cart',
            icon: (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <FaCartShopping size={22} />
                {cartCount > 0 && (
                  <span style={{ position: 'absolute', top: '-5px', right: '-7px', width: '15px', height: '15px', borderRadius: '8px', background: '#E8321A', color: '#fff', fontSize: '8px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>
                )}
              </div>
            ),
          },
          { id: 'orders', icon: <FaClipboardList size={21} /> },
          { id: 'booking', icon: <FaStore size={21} /> },
        ].map(({ id, icon }) => {
          const isActive = activeNav === id
          const activeIconColor = darkMode ? '#111' : '#fff'
          const activePillBg = darkMode ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)'
          return (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', background: 'none',
                padding: 0,
                transition: 'transform 0.2s ease',
                transform: isActive ? 'scale(1.12)' : 'scale(1)',
              }}
            >
              <div
                ref={id === 'cart' ? cartIconRef : undefined}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '48px', height: '44px', borderRadius: '14px',
                  background: isActive ? activePillBg : 'transparent',
                  color: isActive ? activeIconColor : theme.navInactive,
                  transition: 'background 0.25s ease, color 0.25s ease',
                  animation: id === 'cart' && cartBounce ? 'cartIconBounce 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
                }}
              >
                {icon}
              </div>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function GridFoodCard({ item, liked, onLike, theme, darkMode, onPress }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const tagColors = { Popular: '#E8321A', Seasonal: '#fbbf24', Vegetarian: '#4ade80', "Chef's Pick": '#a78bfa' }
  return (
    <div
      className="bestseller-card"
      onClick={onPress}
      style={{
        background: theme.bestsellerBg,
        border: `1px solid ${theme.bestsellerBorder}`,
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: theme.cardShadow,
      }}
    >
      {/* Image */}
      <div style={{ height: '100px', overflow: 'hidden', position: 'relative' }}>
        <img
          src={item.img || fallbackImg}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.35s ease' }}
          onError={e => { e.target.src = fallbackImg }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        />
        <button
          onClick={e => { e.stopPropagation(); onLike(e) }}
          style={{ position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px', borderRadius: '12px', background: 'rgba(0,0,0,0.65)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Heart size={10} fill={liked ? '#E8321A' : 'transparent'} color={liked ? '#E8321A' : '#aaa'} />
        </button>
        {(item.tags?.[0]) && (
          <div style={{ position: 'absolute', bottom: '5px', left: '5px', background: `${tagColors[item.tags[0]] || '#E8321A'}ee`, borderRadius: '5px', padding: '2px 5px', fontSize: '8px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
            {item.tags[0]}
          </div>
        )}
      </div>
      {/* Info */}
      <div style={{ padding: '8px 9px 10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: theme.bestsellerName, lineHeight: 1.3, marginBottom: '4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {item.name}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 800, color: '#E8321A' }}>
          ₹{(item.price || 0).toLocaleString('en-IN')}
        </div>
      </div>
    </div>
  )
}

function BestsellerCard({ item, liked, onLike, theme, onPress }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const tagColors = { Popular: '#E8321A', Seasonal: '#fbbf24', Vegetarian: '#4ade80', "Chef's Pick": '#a78bfa' }
  return (
    <div className="bestseller-card" onClick={onPress} style={{ flexShrink: 0, width: '155px', background: theme.bestsellerBg, border: `1px solid ${theme.bestsellerBorder}`, borderRadius: '16px', overflow: 'hidden', cursor: 'pointer', boxShadow: theme.cardShadow }}>
      <div style={{ height: '115px', overflow: 'hidden', position: 'relative' }}>
        <img src={item.img || fallbackImg} alt={item.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.src = fallbackImg }} />
        <button onClick={e => { e.stopPropagation(); onLike() }} style={{ position: 'absolute', top: '7px', right: '7px', width: '26px', height: '26px', borderRadius: '13px', background: 'rgba(0,0,0,0.65)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Heart size={12} fill={liked ? '#E8321A' : 'transparent'} color={liked ? '#E8321A' : '#aaa'} />
        </button>
        {(item.tag || item.tags?.[0]) && (
          <div style={{ position: 'absolute', bottom: '7px', left: '7px', background: tagColors[item.tag || item.tags?.[0]] ? `${tagColors[item.tag || item.tags[0]]}ee` : 'rgba(232,50,26,0.92)', borderRadius: '6px', padding: '2px 7px', fontSize: '9px', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
            {item.tag || item.tags[0]}
          </div>
        )}
      </div>
      <div style={{ padding: '9px 11px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: theme.bestsellerName, lineHeight: 1.3, marginBottom: '5px' }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#E8321A' }}>₹{(item.price || 0).toLocaleString('en-IN')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Star size={9} fill="#FFB800" color="#FFB800" />
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#FFB800' }}>{item.rating || '4.8'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuCard({ item, theme, onAddToCart, cartQty, onPress }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const oldPrice = item.oldPrice || Math.round((item.price || 0) * 1.5)
  return (
    <div className="menu-card" style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', marginBottom: '14px', boxShadow: theme.cardShadow, padding: '10px 10px 0' }}>
      <div onClick={onPress} style={{ position: 'relative', width: '100%', height: '200px', overflow: 'hidden', borderRadius: '12px', cursor: 'pointer' }}>
        <img src={item.img || fallbackImg} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.35s ease' }} onError={e => { e.target.src = fallbackImg }} loading="lazy"
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        />
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.72)', borderRadius: '8px', padding: '4px 10px', fontSize: '10px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
          View Details
        </div>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
          <div style={{ flexShrink: 0, marginTop: '3px', width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${item.veg !== false ? theme.vegDot : theme.nonVegDot}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '4px', background: item.veg !== false ? theme.vegDot : theme.nonVegDot }} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.itemName, lineHeight: 1.35 }}>{item.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#E8321A' }}>₹{(item.price || 0).toLocaleString('en-IN')}</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: theme.priceOld, textDecoration: 'line-through' }}>₹{oldPrice.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: theme.offerColor }}>Best offer applied</div>
          </div>
          <button
            className="view-cart-btn"
            onClick={(e) => onAddToCart && onAddToCart(item, e)}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '9px 16px', borderRadius: '10px', background: cartQty > 0 ? 'rgba(232,50,26,0.10)' : 'transparent', border: `1.5px solid #E8321A`, color: '#E8321A', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {cartQty > 0 ? `In cart (${cartQty})` : <><Plus size={12} strokeWidth={3} /> Add</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: theme.infoRowBg, border: `1px solid ${theme.infoRowBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '10px', color: theme.infoLabel, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: theme.infoValue, marginTop: '1px' }}>{value}</div>
      </div>
    </div>
  )
}

function SocialBtn({ href, icon, brandColor, theme }) {
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  const hoverBg = brandColor ? hexToRgba(brandColor, 0.1) : 'rgba(232,50,26,0.08)'
  const hoverBorder = brandColor ? hexToRgba(brandColor, 0.35) : 'rgba(232,50,26,0.3)'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        width: '42px', height: '42px', borderRadius: '13px',
        background: theme.socialBg,
        border: `1.5px solid ${theme.socialBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: theme.socialColor, textDecoration: 'none',
        transition: 'all 0.2s ease',
        transform: 'scale(1)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = brandColor || '#E8321A'
        e.currentTarget.style.borderColor = hoverBorder
        e.currentTarget.style.background = hoverBg
        e.currentTarget.style.transform = 'scale(1.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = theme.socialColor
        e.currentTarget.style.borderColor = theme.socialBorder
        e.currentTarget.style.background = theme.socialBg
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {icon}
    </a>
  )
}
