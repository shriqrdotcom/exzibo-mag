import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { notifyAnalyticsUpdate } from '../context/AnalyticsContext'
import { getRestaurantBySlug, getMenuCategories, getMenuItems, getPublishedMenuItems, loadMenuFilters } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useMenuSubdomainRedirect } from '../lib/routeConfig'
import { toSlug } from '../lib/slug'
import {
  Star, MapPin, Bell, ShoppingCart, Home,
  UtensilsCrossed, ClipboardList, CalendarDays,
  Heart, ChevronRight, ChevronLeft, ChevronDown,
  Phone, Mail, Flame, Award, Clock, Users, AtSign,
  Share2, MessageCircle, Globe, Leaf, ExternalLink,
  Trash2, Minus, Plus, Tag, CheckCircle, ShoppingBag,
  Copy, PhoneCall, ArrowLeft, MoreVertical,
  SlidersHorizontal, GlassWater, X
} from 'lucide-react'
import { FaInstagram, FaFacebook, FaWhatsapp, FaLinkedinIn, FaYoutube } from 'react-icons/fa'
import { FaXTwitter, FaHouse, FaUtensils, FaCartShopping, FaClipboardList, FaCalendarDays, FaStore } from 'react-icons/fa6'

const QUICK_FILTERS = [
  { id: 'popular',       label: 'Popular',   sub: 'Most ordered by customers',    icon: '🔥' },
  { id: 'offers',        label: 'Offers',    sub: 'Best offers & discounts',       icon: '🏷️' },
  { id: 'newlyAdded',    label: 'New',       sub: 'Recently added dishes',         icon: '🆕' },
  { id: 'veg',           label: 'Veg',       sub: 'Pure vegetarian dishes',        icon: '🥦' },
  { id: 'favourite',     label: 'Favourite', sub: 'Your favourite dishes',         icon: '❤️' },
  { id: 'spicy',         label: 'Spicy',     sub: 'For those who love spicy food', icon: '🌶️' },
  { id: 'newlyLaunched', label: 'New',       sub: 'Newly launched dishes',         icon: '🔵' },
  { id: 'seasonal',      label: 'Seasonal',  sub: 'Dishes for the season',         icon: '🍂' },
]

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

const TAB_ICONS = {
  starters: Star,
  mains:    UtensilsCrossed,
  drinks:   GlassWater,
}

const DRINKS_SUB_FILTERS = [
  { id: 'soft',    label: 'Soft Drinks' },
  { id: 'alcohol', label: 'Alcoholic' },
  { id: 'hot',     label: 'Hot Drinks' },
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

const CUSTOMER_ORDERS_EXPIRY_MS = 12 * 60 * 60 * 1000

function getCustomerOrdersKey(restaurantId) {
  return `exzibo_customer_orders_${restaurantId}`
}

function loadAndFilterCustomerOrders(restaurantId) {
  try {
    const raw = localStorage.getItem(getCustomerOrdersKey(restaurantId))
    if (!raw) return []
    const all = JSON.parse(raw)
    const now = Date.now()
    const valid = all.filter(o => {
      if (o.status === 'cancelled') return false
      if (o.placedAt) return (now - new Date(o.placedAt).getTime()) < CUSTOMER_ORDERS_EXPIRY_MS
      return true
    })
    localStorage.setItem(getCustomerOrdersKey(restaurantId), JSON.stringify(valid))
    return valid
  } catch { return [] }
}

function persistCustomerOrders(restaurantId, orders) {
  try {
    localStorage.setItem(getCustomerOrdersKey(restaurantId), JSON.stringify(orders))
  } catch {}
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
  const { slug, page, tableNumber: tableParam } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const VALID_NAV_PAGES = ['home', 'menu', 'orders', 'booking', 'cart']

  // Table number — always present in new route structure /:slug/:page/:tableNumber.
  // Default to '1' when missing (covers legacy routes or direct dev access).
  const tableNumber = tableParam || '1'

  // Build the canonical path for this page on the menu subdomain:
  //   /{slug}/{page}/{tableNumber}
  const menuSubdomainPath = slug ? `/${slug}/${page || 'home'}/${tableNumber}` : null
  useMenuSubdomainRedirect(menuSubdomainPath)

  // True when served from the menu subdomain (path is /{slug}/...) vs main domain (/restaurant/{slug}/...)
  const isMenuPath = !location.pathname.startsWith('/restaurant/')

  // Navigate to a customer page tab and update the browser URL.
  // On menu.exzibo.online:  /{slug}/{targetPage}/{tableNumber}
  // In dev / DefaultApp:    just update React state (route has no :page segment)
  function navigateToPage(targetPage) {
    setActiveNav(targetPage)
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (isMenuPath && slug) {
      navigate(`/${slug}/${targetPage}/${tableNumber}`, { replace: true })
    }
  }

  const [restaurant, setRestaurant] = useState(null)
  const [aboutData, setAboutData] = useState({ description: '', image: '' })
  const [notFound, setNotFound] = useState(false)
  const [invalidTable, setInvalidTable] = useState(false)
  const [menuTabs, setMenuTabs] = useState(MENU_TABS)
  const [menuData, setMenuData] = useState(() => Object.fromEntries(MENU_TABS.map(t => [t.id, []])))

  // Initial tab: :page URL segment wins, then router state, then 'home'
  const [activeNav, setActiveNav] = useState(() => {
    if (page && VALID_NAV_PAGES.includes(page)) return page
    return location.state?.activeNav || 'home'
  })
  const [activeMenuTab, setActiveMenuTab] = useState('starters')
  const [darkMode, setDarkMode] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [customCarouselImages, setCustomCarouselImages] = useState(null)
  const [liked, setLiked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`exzibo_fav_${slug}`) || '{}') } catch { return {} }
  })
  const [restaurantLiked, setRestaurantLiked] = useState(false)

  function toggleLiked(item) {
    const key = item.id || item.name
    setLiked(prev => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = true
      try { localStorage.setItem(`exzibo_fav_${slug}`, JSON.stringify(next)) } catch {}
      return next
    })
  }
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [showHelpSheet, setShowHelpSheet] = useState(false)
  const [helpDismissing, setHelpDismissing] = useState(false)
  const [cartItems, setCartItems] = useState([])
  const [cartBounce, setCartBounce] = useState(false)
  const [cartBtnXY, setCartBtnXY] = useState(null)
  const cartDragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false })
  const [couponInput, setCouponInput] = useState('')
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [appliedCouponData, setAppliedCouponData] = useState(null)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [couponSectionEnabled, setCouponSectionEnabled] = useState(true)
  const [customerOrders, setCustomerOrders] = useState([])
  const currentOrder = customerOrders[0] ?? null
  const orderHistory = customerOrders.slice(1)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [orderNotes, setOrderNotes] = useState('')
  const [orderStatus, setOrderStatus] = useState(1)
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState(null)
  const [showOrderConfirm, setShowOrderConfirm] = useState(false)
  useEffect(() => { setShowOrderConfirm(false); setShowHelpSheet(false) }, [activeNav])
  const [openingHours, setOpeningHours] = useState(null)
  const [heroBadge, setHeroBadge] = useState('')
  const [heroText, setHeroText] = useState('')

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
    const rid = restaurant?.id || 'default'
    const key = `exzibo_coupon_enabled_${rid}`
    try {
      const v = localStorage.getItem(key)
      setCouponSectionEnabled(v === null ? true : v === 'true')
    } catch { setCouponSectionEnabled(true) }
  }, [restaurant?.id])

  useEffect(() => {
    const rawId = restaurant?.id
    const rid = (!rawId || rawId === 'demo') ? 'default' : rawId
    const key = `exzibo_hours_${rid}`
    const stored = localStorage.getItem(key)
    setOpeningHours(stored ? JSON.parse(stored) : null)

    function onHoursChanged(e) {
      const { restaurantId: changedId, hours } = e.detail || {}
      const matches = changedId === rid || changedId === rawId ||
        (rid === 'default' && (!changedId || changedId === 'default' || changedId === 'demo'))
      if (matches) setOpeningHours(hours)
    }
    window.addEventListener('exzibo-hours-changed', onHoursChanged)
    return () => window.removeEventListener('exzibo-hours-changed', onHoursChanged)
  }, [restaurant?.id])

  useEffect(() => {
    const rawId = restaurant?.id
    const rid = (!rawId || rawId === 'demo') ? 'default' : rawId
    const key = `exzibo_carousel_badge_${rid}`
    setHeroBadge(localStorage.getItem(key) || '')

    function onBadgeChanged(e) {
      const { restaurantId: changedId, badge } = e.detail || {}
      const matches = changedId === rid || changedId === rawId ||
        (rid === 'default' && (!changedId || changedId === 'default' || changedId === 'demo'))
      if (matches) setHeroBadge(badge || '')
    }
    window.addEventListener('exzibo-carousel-badge-changed', onBadgeChanged)
    return () => window.removeEventListener('exzibo-carousel-badge-changed', onBadgeChanged)
  }, [restaurant?.id])

  useEffect(() => {
    const rawId = restaurant?.id
    const rid = (!rawId || rawId === 'demo') ? 'default' : rawId
    const key = `exzibo_carousel_desc_${rid}`
    setHeroText(localStorage.getItem(key) || '')

    function onDescChanged(e) {
      const { restaurantId: changedId, text } = e.detail || {}
      const matches = changedId === rid || changedId === rawId ||
        (rid === 'default' && (!changedId || changedId === 'default' || changedId === 'demo'))
      if (matches) setHeroText(text || '')
    }
    window.addEventListener('exzibo-carousel-desc-changed', onDescChanged)
    return () => window.removeEventListener('exzibo-carousel-desc-changed', onDescChanged)
  }, [restaurant?.id])

  useEffect(() => {
    const cartKey = `exzibo_cart_${slug}`
    localStorage.setItem(cartKey, JSON.stringify(cartItems))
  }, [cartItems, slug])

  useEffect(() => {
    if (showCouponModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showCouponModal])

  useEffect(() => {
    document.body.style.background = darkMode ? '#0a0a0a' : '#f2f2f2'
    document.documentElement.style.background = darkMode ? '#0a0a0a' : '#f2f2f2'
    return () => {
      document.body.style.background = ''
      document.documentElement.style.background = ''
    }
  }, [darkMode])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setDarkMode(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const [dynamicCategories, setDynamicCategories] = useState(DEFAULT_CATEGORY_FILTERS)
  const [filtersEnabled, setFiltersEnabled] = useState({ starters: true, mains: true, drinks: true })
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [vegMode, setVegMode] = useState(false)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [activeQuickFilters, setActiveQuickFilters] = useState([])
  const [drinksDropdownOpen, setDrinksDropdownOpen] = useState(false)
  const [drinksSubFilter, setDrinksSubFilter] = useState('')
  const [scrollY, setScrollY] = useState(0)
  const scrollTickRef = useRef(false)
  const cartIconRef = useRef(null)

  useEffect(() => {
    function onScroll() {
      if (scrollTickRef.current) return
      scrollTickRef.current = true
      requestAnimationFrame(() => {
        setScrollY(Math.max(0, window.scrollY))
        scrollTickRef.current = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const [bookingForm, setBookingForm] = useState({ name: '', phone: '', email: '', date: '', time: '19:00', guests: 2, occasion: 'Casual Dining', seating: 'Indoor', notes: '' })
  const [bookingSubmitted, setBookingSubmitted] = useState(false)
  const [bookingErrors, setBookingErrors] = useState({})
  const [showQuickBookModal, setShowQuickBookModal] = useState(false)
  const [quickBookName, setQuickBookName] = useState('')
  const [quickBookPhone, setQuickBookPhone] = useState('')
  const [quickBookErrors, setQuickBookErrors] = useState({})

  function handleOpenBooking() {
    setQuickBookName('')
    setQuickBookPhone('')
    setQuickBookErrors({})
    setShowQuickBookModal(true)
  }

  function handleQuickBookConfirm() {
    const errs = {}
    if (!quickBookName.trim()) errs.name = 'Required'
    if (!quickBookPhone.trim()) errs.phone = 'Required'
    if (Object.keys(errs).length) { setQuickBookErrors(errs); return }
    setBookingForm(prev => ({ ...prev, name: quickBookName.trim(), phone: quickBookPhone.trim() }))
    setShowQuickBookModal(false)
    navigateToPage('booking')
  }

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
    // Write to localStorage for same-device admin dashboard
    localStorage.setItem(storageKey, JSON.stringify([newBooking, ...existing]))
    notifyAnalyticsUpdate()

    // Also persist to Supabase so admin dashboards on ALL devices see it instantly
    const isSupabaseRestaurant = restaurantId && restaurantId !== 'demo' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)
    if (isSupabaseRestaurant) {
      supabase.from('bookings').insert({
        id:              newBooking.id,
        restaurant_id:   restaurantId,
        customer_name:   newBooking.name,
        customer_phone:  newBooking.phone,
        customer_email:  newBooking.email,
        guests:          newBooking.guests,
        date:            newBooking.date,
        time:            newBooking.time,
        occasion:        newBooking.occasion || null,
        seating:         newBooking.seating  || null,
        notes:           newBooking.notes    || null,
        status:          'pending',
      }).then(({ error }) => {
        if (error) console.warn('[Booking] Supabase insert skipped (localStorage backup active):', error.message)
        else console.log('[Booking] Persisted to Supabase:', newBooking.id)
      })
    }

    setBookingSubmitted(true)
  }

  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0)
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0)
  const deliveryFee = subtotal > 500 ? 0 : 40
  const gstAmt = +(subtotal * 0.05).toFixed(2)
  const discountAmt = (() => {
    if (!couponApplied || !appliedCouponData) return 0
    if (appliedCouponData.discountType === 'Fixed Amount') {
      return Math.min(+appliedCouponData.discountPct, subtotal)
    }
    return +(subtotal * +appliedCouponData.discountPct / 100).toFixed(2)
  })()
  const grandTotal = +(subtotal + gstAmt - discountAmt).toFixed(2)

  function updateQty(id, delta) {
    setCartItems(prev => {
      const item = prev.find(i => i.id === id)
      if (item && item.qty === 1 && delta === -1) {
        return prev.filter(i => i.id !== id)
      }
      return prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    })
  }
  function removeItem(id) {
    setCartItems(prev => prev.filter(item => item.id !== id))
  }
  function handleApplyCoupon() {
    if (couponApplied) return
    const restaurantId = restaurant?.id || slug || 'demo'
    const inputCode = couponInput.trim().toUpperCase()

    // Helper: validate and apply a normalised coupon object
    const tryCoupon = (couponObj) => {
      if (!couponObj || !couponObj.code) return false
      if (couponObj.code.toUpperCase() !== inputCode) return false
      // active flag (old format has it; new format treats all as active unless expired)
      if (couponObj.active === false) {
        setCouponError('This coupon is currently inactive')
        return true // code matched, error set
      }
      if (couponObj.expireDate) {
        const expiry = new Date(couponObj.expireDate)
        expiry.setHours(23, 59, 59, 999)
        if (new Date() > expiry) {
          setCouponError('This coupon has expired')
          return true
        }
      }
      const minOrder = parseFloat(couponObj.minimumOrderValue) || 0
      if (minOrder > 0 && subtotal < minOrder) {
        setCouponError(`This coupon is applicable on orders above ₹${minOrder} only.`)
        return true
      }
      setAppliedCouponData(couponObj)
      setCouponApplied(true)
      setCouponError('')
      setTimeout(() => setShowCouponModal(false), 1500)
      return true
    }

    // 1. Check old single-coupon format (AdminCouponManagement)
    const oldStored = localStorage.getItem(`exzibo_admin_coupon_${restaurantId}`)
    if (oldStored) {
      const saved = JSON.parse(oldStored)
      if (tryCoupon(saved)) return
    }

    // 2. Check new coupon list format — restaurant-specific key
    const tryListKey = (key) => {
      try {
        const list = JSON.parse(localStorage.getItem(key) || '[]')
        if (!Array.isArray(list)) return false
        for (const c of list) {
          // Normalise: new format uses discountAmount, old validator expects discountPct
          const normalised = { ...c, discountPct: c.discountPct ?? c.discountAmount, active: c.active !== false }
          if (tryCoupon(normalised)) return true
        }
      } catch { /* ignore */ }
      return false
    }

    if (tryListKey(`exzibo_coupons_${restaurantId}`)) return
    // 3. Also check global admin template coupons (key 'default')
    if (tryListKey('exzibo_coupons_default')) return

    setCouponError('Invalid coupon code')
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
    const orderId = String(Math.floor(100000000 + Math.random() * 900000000))
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const restaurantId = restaurant?.id || slug || 'demo'
    // Use table number from URL param/query string; fall back to random if not present
    const tableNum = tableNumber || String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')
    const orderItems = cartItems.map(i => ({ name: i.name, qty: i.qty, price: i.price }))

    const customerOrder = {
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
      status: 'pending',
      placedAt: new Date().toISOString(),
      _restaurantId: restaurantId,
    }
    setCustomerOrders(prev => {
      const next = [customerOrder, ...prev]
      persistCustomerOrders(restaurantId, next)
      return next
    })
    setOrderStatus(0)
    setOrderNotes('')
    setViewingHistoryOrder(null)
    setShowSuccessPopup(true)
    setCartItems([])
    setCouponApplied(false)
    setCouponInput('')

    // Write to localStorage for same-device admin dashboard
    const adminOrder = {
      id: orderId,
      table: tableNum,
      status: 'pending',
      customerName: '',
      phone: '',
      location: '',
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      grandTotal,
      items: orderItems,
    }
    const ordersKey = `exzibo_orders_${restaurantId}`
    const existing = JSON.parse(localStorage.getItem(ordersKey) || '[]')
    localStorage.setItem(ordersKey, JSON.stringify([adminOrder, ...existing]))
    notifyAnalyticsUpdate()

    // Also persist to Supabase so admin dashboards on ALL devices see it instantly
    const isSupabaseRestaurant = restaurantId && restaurantId !== 'demo' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)
    if (isSupabaseRestaurant) {
      supabase.from('orders').insert({
        id:            orderId,
        restaurant_id: restaurantId,
        table_number:  tableNum,
        items:         orderItems,
        status:        'pending',
        total:         grandTotal,
      }).then(({ error }) => {
        if (error) console.warn('[Order] Supabase insert skipped (localStorage backup active):', error.message)
        else console.log('[Order] Persisted to Supabase:', orderId)
      })
    }

    setTimeout(() => {
      setShowSuccessPopup(false)
      navigateToPage('orders')
    }, 2500)
  }

  function handleCancelOrder(orderId) {
    const restaurantId = restaurant?.id || slug || 'demo'
    setCustomerOrders(prev => {
      const next = prev.filter(o => o.id !== orderId)
      persistCustomerOrders(restaurantId, next)
      return next
    })
    if (viewingHistoryOrder?.id === orderId) setViewingHistoryOrder(null)
    const adminOrdersKey = `exzibo_orders_${restaurantId}`
    try {
      const adminOrders = JSON.parse(localStorage.getItem(adminOrdersKey) || '[]')
      const updated = adminOrders.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o)
      localStorage.setItem(adminOrdersKey, JSON.stringify(updated))
      notifyAnalyticsUpdate()
    } catch {}
  }

  const theme = buildTheme(darkMode)

  useEffect(() => {
    if (slug === 'demo') {
      const savedDemoLogo = localStorage.getItem('exzibo_logo_default') || ''
      const savedDemoName = localStorage.getItem('exzibo_name_default') || 'La Maison Noire'
      const demoConfig = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
      setRestaurant({
        id: 'demo', slug: 'demo',
        name: savedDemoName,
        location: demoConfig.location || 'Cyber City, Gurugram',
        description: 'An uncompromising culinary experience rooted in craft, quality, and atmosphere. Every dish is a conversation between heritage and innovation.',
        chefInfo: 'Chef Marcus Aurélius, trained in Paris and Tokyo, brings 20 years of Michelin-star experience to every plate.',
        rating: '4.9',
        phone: demoConfig.phone || '+91 98765 43210',
        email: demoConfig.email || '',
        tables: '24',
        images: FALLBACK_IMAGES,
        logo: savedDemoLogo,
        socialLinks: { instagram: '', facebook: '', twitter: '', website: '', linkedin: '', youtube: '' },
      })
      const demoTabs = loadMenuTabs('demo')
      setMenuTabs(demoTabs)
      setMenuData(loadMenuFromStorage('demo', demoTabs) || MENU_FALLBACK)
      setDynamicCategories(loadFiltersFromStorage('demo'))
      try { const fe = localStorage.getItem('exzibo_filters_enabled_demo'); if (fe) setFiltersEnabled(JSON.parse(fe)) } catch {}
      setActiveMenuTab(demoTabs[0]?.id || 'starters')
      const demoOrders = loadAndFilterCustomerOrders('demo')
      setCustomerOrders(demoOrders)
      return
    }
    // ── Try localStorage first for an instant initial render ─────────────────
    // Do NOT return early — always fall through to the Supabase fetch below so
    // the menu is never stale (addItem writes to Supabase but not always to the
    // localStorage menu cache, so the cache can lag behind the DB).
    const localRestaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = localRestaurants.find(r => r.slug === slug || r.id === slug)
    if (found) {
      const tabs = loadMenuTabs(found.id)
      setMenuTabs(tabs)
      setRestaurant(found)
      setMenuData(loadMenuFromStorage(found.id, tabs) || Object.fromEntries(tabs.map(t => [t.id, []])))
      setDynamicCategories(loadFiltersFromStorage(found.id))
      try { const fe = localStorage.getItem(`exzibo_filters_enabled_${found.id}`); if (fe) setFiltersEnabled(JSON.parse(fe)) } catch {}
      setActiveMenuTab(tabs[0]?.id || 'starters')
      setCustomerOrders(loadAndFilterCustomerOrders(found.id))
      // intentionally no return — fall through to Supabase fetch below
    }

    // ── Fetch from Supabase (always, to keep menu data fresh) ─────────────
    // • If the restaurant was already set from localStorage: update restaurant
    //   info silently and overwrite menuData with the live Supabase menu.
    // • If the restaurant was NOT in localStorage: this is the only data source.
    let cancelled = false
    async function fetchFromSupabase() {
      try {
        const dbRow = await getRestaurantBySlug(slug)
        if (cancelled) return
        // Only show 404 when we have no local fallback to display
        if (!dbRow) { if (!found) setNotFound(true); return }

        const r = {
          id:              dbRow.id,
          slug:            dbRow.slug,
          uid:             dbRow.uid,
          name:            dbRow.name,
          description:     dbRow.description     || '',
          location:        dbRow.location        || '',
          phone:           dbRow.phone           || '',
          rating:          dbRow.rating          || '',
          tables:          dbRow.tables          || '',
          images:          dbRow.images          || [],
          logo:            dbRow.logo            || '',
          social_links:    dbRow.social_links    || {},
          socialLinks:     dbRow.social_links    || {},
          chef_info:       dbRow.chef_info       || '',
          chefInfo:        dbRow.chef_info       || '',
          servant_info:    dbRow.servant_info    || '',
          servantInfo:     dbRow.servant_info    || '',
          additional_info: dbRow.additional_info || '',
          table_numbers:   dbRow.table_numbers   || [],
          plan:            dbRow.plan,
          status:          dbRow.status,
        }
        setRestaurant(r)
        setCustomerOrders(loadAndFilterCustomerOrders(r.id))

        // Load sub-category filters from Supabase (global_settings table).
        // Production-safe and cross-device — no schema migration required.
        // Takes priority over localStorage so "Save Changes" in admin is
        // immediately reflected on any device, including Vercel deployments.
        loadMenuFilters(r.id).then(saved => {
          if (!saved || cancelled) return
          if (saved.filters && typeof saved.filters === 'object' && Object.keys(saved.filters).length > 0) {
            setDynamicCategories(saved.filters)
            try { localStorage.setItem(`exzibo_menu_filters_${r.id}`, JSON.stringify(saved.filters)) } catch {}
          }
          if (saved.filtersEnabled && typeof saved.filtersEnabled === 'object' && Object.keys(saved.filtersEnabled).length > 0) {
            setFiltersEnabled(saved.filtersEnabled)
            try { localStorage.setItem(`exzibo_filters_enabled_${r.id}`, JSON.stringify(saved.filtersEnabled)) } catch {}
          }
        }).catch(() => {})

        // Load menu from Supabase — public page shows only published items
        const [cats, items] = await Promise.all([
          getMenuCategories(r.id),
          getPublishedMenuItems(r.id),
        ])
        if (cancelled) return

        if (cats && cats.length > 0) {
          const tabs = cats.map(c => ({ id: c.id, label: c.name.toUpperCase() }))
          setMenuTabs(tabs)
          setActiveMenuTab(tabs[0]?.id)
          const menuObj = Object.fromEntries(tabs.map(t => [t.id, []]))
          // Build a layout fallback map from localStorage (covers case where DB column is missing)
          const localLayoutMap = (() => {
            try {
              const stored = JSON.parse(localStorage.getItem(`exzibo_layout_map`) || '{}')
              return stored
            } catch { return {} }
          })()
          if (items) {
            items.forEach(it => {
              const key = it.category_id
              if (key && menuObj[key] !== undefined) {
                const shape = it.image_shape || localLayoutMap[it.id] || 'vertical'
                menuObj[key].push(normalizeItem({
                  id: it.id, dbId: it.id,
                  name: it.name,
                  description: it.description || '',
                  desc: it.description || '',
                  price: parseFloat(it.price) || 0,
                  img: it.image || null,
                  veg: it.veg !== false,
                  available: it.available !== false,
                  tags: it.tags || [],
                  addOns: it.add_ons || [],
                  image_shape: shape,
                  imageShape: shape,
                }))
              }
            })
          }
          setMenuData(menuObj)
        }
      } catch (e) {
        // Only show a hard 404 when we have no local fallback to show the user
        if (!cancelled && !found) {
          console.error('[RestaurantWebsite] Supabase fetch error:', e)
          setNotFound(true)
        } else if (!cancelled) {
          console.warn('[RestaurantWebsite] Supabase fetch failed (showing local data):', e.message)
        }
      }
    }
    fetchFromSupabase()
    return () => { cancelled = true }
  }, [slug])

  // ── Realtime: live menu updates → public page reflects instantly ──────────
  useEffect(() => {
    const rid = restaurant?.id
    // Only subscribe for Supabase-backed restaurants (UUID format)
    if (!rid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rid)) return

    async function refetchMenu() {
      try {
        const [cats, menuItems] = await Promise.all([
          getMenuCategories(rid),
          getPublishedMenuItems(rid),
        ])
        if (!cats?.length) return
        const tabs = cats.map(c => ({ id: c.id, label: c.name.toUpperCase() }))
        setMenuTabs(tabs)
        const menuObj = Object.fromEntries(tabs.map(t => [t.id, []]))
        const localLayoutMap = (() => {
          try { return JSON.parse(localStorage.getItem('exzibo_layout_map') || '{}') } catch { return {} }
        })()
        if (menuItems) {
          menuItems.forEach(it => {
            const key = it.category_id
            if (key && menuObj[key] !== undefined) {
              const shape = it.image_shape || localLayoutMap[it.id] || 'vertical'
              menuObj[key].push(normalizeItem({
                id: it.id, dbId: it.id,
                name: it.name,
                description: it.description || '',
                desc: it.description || '',
                price: parseFloat(it.price) || 0,
                img: it.image || null,
                veg: it.veg !== false,
                available: it.available !== false,
                tags: it.tags || [],
                addOns: it.add_ons || [],
                image_shape: shape,
                imageShape: shape,
              }))
            }
          })
        }
        setMenuData(menuObj)
      } catch (e) {
        console.warn('[rt-menu] Refetch failed:', e.message)
      }
    }

    const channel = supabase
      .channel(`rt-menu-${rid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'menu_categories', filter: `restaurant_id=eq.${rid}` },
        refetchMenu
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${rid}` },
        refetchMenu
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('[rt] menu subscribed:', rid)
      })

    // Broadcast channel — receives instant push notifications from dashboard
    // when menu items are added, edited, or deleted (bypasses realtime RLS limits
    // that can block DELETE events when REPLICA IDENTITY FULL is not set).
    const broadcastCh = supabase
      .channel(`menu-updates-${rid}`, { config: { broadcast: { ack: false } } })
      .on('broadcast', { event: 'menu-refresh' }, () => refetchMenu())
      .subscribe()

    // Fallback poll — refetch every 20 s
    const poll = setInterval(refetchMenu, 20_000)

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(broadcastCh)
      clearInterval(poll)
    }
  }, [restaurant?.id])

  // ── Realtime: order status updates → customer page reflects instantly ────
  // Uses BOTH a direct broadcast channel (instant, no RLS dependency) and
  // postgres_changes (fallback DB-level subscription). The broadcast fires
  // the moment admin confirms at dashboard.exzibo.online, so the customer at
  // menu.exzibo.online sees it without any polling delay or RLS issues.
  useEffect(() => {
    const rid = restaurant?.id
    if (!rid || rid === 'demo' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rid)) return

    function applyStatusUpdate(orderId, status) {
      if (!orderId || !status) return
      const oid = String(orderId)
      setCustomerOrders(prev => {
        let changed = false
        const next = prev.map(co => {
          if (co.id !== oid) return co
          if (co.status === status) return co
          changed = true
          return { ...co, status }
        })
        if (changed) {
          persistCustomerOrders(rid, next)
          if (status === 'confirmed' || status === 'preparing' || status === 'ready' || status === 'completed') setOrderStatus(1)
          else if (status === 'cancelled' || status === 'rejected') setOrderStatus(-1)
        }
        return changed ? next : prev
      })
    }

    const channel = supabase
      .channel(`order-updates-${rid}`, { config: { broadcast: { ack: false } } })
      // ── Primary: direct broadcast from admin dashboard (cross-origin, instant) ──
      .on('broadcast', { event: 'order_status_changed' }, ({ payload }) => {
        const { orderId, status } = payload || {}
        console.log('[order-broadcast] status update received:', orderId, status)
        applyStatusUpdate(orderId, status)
      })
      // ── Fallback: postgres_changes (requires public_read_orders RLS policy) ──
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` },
        (payload) => {
          const { id: orderId, status } = payload.new || {}
          applyStatusUpdate(orderId, status)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('[rt] order-updates subscribed:', rid)
      })

    return () => { supabase.removeChannel(channel) }
  }, [restaurant?.id])

  // ── Polling fallback: fetch order status from Supabase every 15 s ────────
  // Works even when Supabase Realtime is not configured — the customer page
  // simply re-reads the order row directly and updates its state.
  //
  // Smart-merge guard: never regress a status that has already moved forward.
  // The broadcast from the admin fires instantly; the DB PATCH may still be
  // in-flight when the poll runs. Allowing the poll to overwrite "confirmed"
  // with a stale "pending" causes the visible flicker the user reports.
  //
  // Status progression: pending → confirmed → preparing → ready → completed
  //   cancelled / rejected are terminal in their own track.
  // Rule: if local is already past "pending", ignore a DB result of "pending".
  useEffect(() => {
    const orderId     = currentOrder?.id
    const restaurantId = currentOrder?._restaurantId || restaurant?.id
    const isRealRestaurant = restaurantId && restaurantId !== 'demo' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)
    if (!orderId || !isRealRestaurant) return

    // Statuses that represent forward progress beyond "placed/pending"
    const FORWARD = new Set(['confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'rejected'])

    async function pollStatus() {
      try {
        const { data } = await supabase
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .maybeSingle()
        if (!data) return
        const dbStatus = data.status
        setCustomerOrders(prev => {
          let changed = false
          const next = prev.map(co => {
            if (co.id !== orderId) return co
            // Never let the poll regress a forward status back to pending —
            // this is the DB lagging behind the optimistic broadcast update.
            if (FORWARD.has(co.status) && dbStatus === 'pending') return co
            if (co.status === dbStatus) return co
            changed = true
            return { ...co, status: dbStatus }
          })
          if (changed) persistCustomerOrders(restaurantId, next)
          return changed ? next : prev
        })
        if (dbStatus === 'confirmed' || dbStatus === 'preparing' || dbStatus === 'ready' || dbStatus === 'completed') setOrderStatus(1)
        else if (dbStatus === 'cancelled' || dbStatus === 'rejected') setOrderStatus(-1)
        // Don't call setOrderStatus(0) on a stale "pending" — keep whatever is shown
      } catch {}
    }

    pollStatus()
    const timer = setInterval(pollStatus, 15_000)
    return () => clearInterval(timer)
  }, [currentOrder?.id, restaurant?.id])

  // Load & live-sync about data (description + image) from admin panel
  useEffect(() => {
    const id = restaurant?.id || (slug === 'demo' ? 'demo' : null)
    if (!id) return
    const key = `exzibo_about_${id}`
    const load = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || '{}')
        setAboutData({ description: stored.description || '', image: stored.image || '' })
      } catch {}
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [restaurant?.id, slug])

  useEffect(() => {
    if (!currentOrder) return
    const restaurantId = currentOrder._restaurantId || restaurant?.id || slug || 'demo'
    const ordersKey = `exzibo_orders_${restaurantId}`

    function syncOrderStatus() {
      try {
        const adminOrders = JSON.parse(localStorage.getItem(ordersKey) || '[]')
        setCustomerOrders(prev => {
          if (prev.length === 0) return prev
          let changed = false
          const updated = prev.map(co => {
            const admin = adminOrders.find(o => o.id === co.id)
            if (!admin) return co
            const newStatus = admin.status
            if (newStatus !== co.status) { changed = true; return { ...co, status: newStatus } }
            return co
          })
          if (changed) persistCustomerOrders(restaurantId, updated)
          const firstAdmin = adminOrders.find(o => o.id === (updated[0]?.id))
          if (firstAdmin) {
            const ADVANCED = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'rejected']
            const currentStatus = updated[0]?.status
            if (firstAdmin.status === 'confirmed' || firstAdmin.status === 'preparing' || firstAdmin.status === 'ready' || firstAdmin.status === 'completed') setOrderStatus(1)
            else if (firstAdmin.status === 'cancelled' || firstAdmin.status === 'rejected') setOrderStatus(-1)
            else if (!ADVANCED.includes(currentStatus)) setOrderStatus(0)
          }
          return changed ? updated : prev
        })
      } catch {}
    }

    syncOrderStatus()
    window.addEventListener('storage', syncOrderStatus)
    window.addEventListener('exzibo-data-changed', syncOrderStatus)
    return () => {
      window.removeEventListener('storage', syncOrderStatus)
      window.removeEventListener('exzibo-data-changed', syncOrderStatus)
    }
  }, [currentOrder?.id, restaurant?.id, slug])

  useEffect(() => {
    function onLogoChanged(e) {
      const { restaurantId: changedId, logo } = e.detail || {}
      setRestaurant(prev => {
        if (!prev) return prev
        const isDemoMatch = (changedId === 'default' && (prev.id === 'demo' || prev.slug === 'demo'))
        const isDirectMatch = changedId === prev.id || changedId === prev.slug
        if (isDemoMatch || isDirectMatch) return { ...prev, logo: logo || '' }
        return prev
      })
    }
    function onNameChanged(e) {
      const { restaurantId: changedId, name } = e.detail || {}
      setRestaurant(prev => {
        if (!prev) return prev
        const isDemoMatch = (changedId === 'default' && (prev.id === 'demo' || prev.slug === 'demo'))
        const isDirectMatch = changedId === prev.id || changedId === prev.slug
        if (isDemoMatch || isDirectMatch) return { ...prev, name: name || prev.name }
        return prev
      })
    }
    function onContactChanged(e) {
      const { restaurantId: changedId, phone, email } = e.detail || {}
      setRestaurant(prev => {
        if (!prev) return prev
        const isDemoMatch = (changedId === 'default' && (prev.id === 'demo' || prev.slug === 'demo'))
        const isDirectMatch = changedId === prev.id || changedId === prev.slug
        if (isDemoMatch || isDirectMatch) return { ...prev, phone: phone ?? prev.phone, email: email ?? prev.email }
        return prev
      })
    }
    function onLocationChanged(e) {
      const { restaurantId: changedId, location } = e.detail || {}
      setRestaurant(prev => {
        if (!prev) return prev
        const isDemoMatch = (changedId === 'default' && (prev.id === 'demo' || prev.slug === 'demo'))
        const isDirectMatch = changedId === prev.id || changedId === prev.slug
        if (isDemoMatch || isDirectMatch) return { ...prev, location: location ?? prev.location }
        return prev
      })
    }
    window.addEventListener('exzibo-logo-changed', onLogoChanged)
    window.addEventListener('exzibo-name-changed', onNameChanged)
    window.addEventListener('exzibo-contact-changed', onContactChanged)
    window.addEventListener('exzibo-location-changed', onLocationChanged)
    return () => {
      window.removeEventListener('exzibo-logo-changed', onLogoChanged)
      window.removeEventListener('exzibo-name-changed', onNameChanged)
      window.removeEventListener('exzibo-contact-changed', onContactChanged)
      window.removeEventListener('exzibo-location-changed', onLocationChanged)
    }
  }, [])

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
    if (!restaurant) return
    const rid = restaurant.id || slug || 'default'
    const loadCustom = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(`exzibo_carousel_${rid}`) || 'null')
        const fallback = JSON.parse(localStorage.getItem('exzibo_carousel_default') || 'null')
        const imgs = (Array.isArray(stored) && stored.length ? stored : null)
          || (Array.isArray(fallback) && fallback.length ? fallback : null)
        setCustomCarouselImages(imgs)
      } catch { setCustomCarouselImages(null) }
    }
    loadCustom()
    const handler = e => {
      const d = e.detail
      if (d?.restaurantId === rid || d?.restaurantId === 'default') {
        setCustomCarouselImages(Array.isArray(d.images) && d.images.length ? d.images : null)
      }
    }
    window.addEventListener('exzibo-carousel-changed', handler)
    return () => window.removeEventListener('exzibo-carousel-changed', handler)
  }, [restaurant])

  const carouselImages = (customCarouselImages?.length ? customCarouselImages : null)
    || (restaurant?.images?.length ? restaurant.images : FALLBACK_IMAGES)

  useEffect(() => {
    if (carouselImages.length <= 1) return
    const interval = setInterval(() => setCarouselIdx(i => (i + 1) % carouselImages.length), 4000)
    return () => clearInterval(interval)
  }, [carouselImages])

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

  const qfTest = (item, fid) => {
    switch (fid) {
      case 'popular':       return item.tags?.some(t => t.toLowerCase() === 'popular')
      case 'offers':        return item.oldPrice && Number(item.oldPrice) > Number(item.price)
      case 'newlyAdded':    return item.isNew || item.tags?.some(t => t.toLowerCase() === 'new')
      case 'veg':           return item.veg === true
      case 'favourite':     return !!(liked[item.id] || liked[item.name])
      case 'spicy':         return item.tags?.some(t => t.toLowerCase() === 'spicy')
      case 'newlyLaunched': return item.tags?.some(t => t.toLowerCase() === 'new')
      case 'seasonal':      return item.tags?.some(t => t.toLowerCase() === 'seasonal')
      default:              return true
    }
  }

  const panelFilteredItems = activeQuickFilters.length === 0
    ? activeMenuItems
    : activeMenuItems.filter(item => activeQuickFilters.every(fid => qfTest(item, fid)))

  const filterCount = activeQuickFilters.length

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
    navigateToPage('cart')
  }

  useEffect(() => {
    if (!restaurant || slug === 'demo' || !tableParam) return
    const tableNums = restaurant.table_numbers
    if (!Array.isArray(tableNums) || tableNums.length === 0) return
    const tn = parseInt(tableParam, 10)
    if (!Number.isFinite(tn) || !tableNums.map(String).includes(String(tn))) {
      setInvalidTable(true)
    }
  }, [restaurant, tableParam, slug])

  if (invalidTable) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: "'Inter', sans-serif", padding: '24px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.3)', color: '#e8321a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', padding: '5px 14px', borderRadius: '100px', marginBottom: '28px', textTransform: 'uppercase' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#e8321a', display: 'inline-block', animation: 'tblPulse 1.4s ease-in-out infinite' }} />
          Table Validation Failed
        </div>
        <div style={{ fontSize: '88px', fontWeight: 900, color: '#1c1c1c', lineHeight: 1, letterSpacing: '-0.04em' }}>404</div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: '10px 0 10px', letterSpacing: '0.02em' }}>Invalid Table Number</div>
        <div style={{ fontSize: '14px', color: '#555', lineHeight: 1.65, maxWidth: '300px' }}>
          Table <strong style={{ color: '#888' }}>#{tableParam}</strong> does not exist for this restaurant.<br />
          Please scan the QR code at your table.
        </div>
        <div style={{ width: '40px', height: '2px', background: 'rgba(232,50,26,0.4)', margin: '28px auto' }} />
        <div style={{ fontSize: '12px', color: '#333', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Exzibo · Secure Table Access</div>
        <style>{`@keyframes tblPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      </div>
    )
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
        .filter-bar-btn:hover { filter: brightness(0.92); }
        .filter-bar-btn:active { transform: scale(0.95); }
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
        @keyframes confirmScaleIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        .reveal { animation: slideUp 0.45s ease both; }
        .reveal-1 { animation-delay: 0ms; }
        .reveal-2 { animation-delay: 80ms; }
        .reveal-3 { animation-delay: 160ms; }
        .reveal-4 { animation-delay: 240ms; }
        .float-search-dark::placeholder { color: rgba(255,255,255,0.4); }
        .float-search-light::placeholder { color: rgba(0,0,0,0.38); }
        .float-search-dark:focus { outline: none; }
        .float-search-light:focus { outline: none; }
        @keyframes headerFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ══════════════════════════════════════════════════════
          FLOATING HEADER — transparent over hero, shrinks on scroll
          ══════════════════════════════════════════════════════ */}
      {(() => {
        const COLLAPSE_DIST = 72
        const isHome = activeNav === 'home'
        // bgProgress drives background opacity — always 1 on non-home tabs (solid dark bg)
        const bgProgress = isHome ? Math.min(1, Math.max(0, scrollY / COLLAPSE_DIST)) : 1
        // rowProgress drives logo/name row collapse — NEVER collapses on non-home tabs
        const rowProgress = isHome ? bgProgress : 0
        const isCollapsed = bgProgress >= 1 && isHome
        const themeColor = restaurant?.primaryColor || '#E8321A'
        const bgAlpha = darkMode
          ? 0.96 * bgProgress
          : (bgProgress < 0.5 ? 0 : (bgProgress - 0.5) * 2 * 0.97)
        const headerBg = !isHome
          ? (darkMode ? 'rgba(10,10,10,0.97)' : 'rgba(255,255,255,0.97)')
          : bgProgress < 0.05
            ? 'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.18) 72%, rgba(0,0,0,0) 100%)'
            : darkMode
              ? `rgba(10,10,10,${bgAlpha.toFixed(2)})`
              : `rgba(255,255,255,${bgAlpha.toFixed(2)})`
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            maxWidth: '480px',
            zIndex: 100,
            background: activeNav === 'menu' ? 'rgba(10,10,10,0.98)' : headerBg,
            backdropFilter: bgProgress > 0.3 ? `blur(${(bgProgress * 20).toFixed(1)}px)` : 'none',
            WebkitBackdropFilter: bgProgress > 0.3 ? `blur(${(bgProgress * 20).toFixed(1)}px)` : 'none',
            boxShadow: activeNav === 'menu'
              ? '0 8px 28px rgba(0,0,0,0.50)'
              : bgProgress > 0.8 ? `0 2px 24px rgba(0,0,0,${(0.22 * bgProgress).toFixed(2)})` : 'none',
            borderBottomLeftRadius: activeNav === 'menu' ? '28px' : 0,
            borderBottomRightRadius: activeNav === 'menu' ? '28px' : 0,
            overflow: activeNav === 'menu' ? 'hidden' : 'visible',
          }}>

            {/* ── Row 1: Logo + Name + Location (scroll-linked collapse) ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              paddingTop: activeNav === 'menu' ? 0 : `${Math.round(10 * (1 - rowProgress))}px`,
              paddingBottom: 0,
              paddingLeft: '16px',
              paddingRight: '16px',
              maxHeight: activeNav === 'menu' ? 0 : `${Math.round(62 * (1 - rowProgress))}px`,
              opacity: activeNav === 'menu' ? 0 : Math.max(0, 1 - rowProgress * 1.4),
              overflow: 'hidden',
              transform: `translateY(${Math.round(-10 * rowProgress)}px)`,
              willChange: 'transform, opacity, max-height',
              pointerEvents: (activeNav === 'menu' || rowProgress > 0.85) ? 'none' : 'auto',
            }}>
              {/* Restaurant logo — white circular badge */}
              <div style={{ flexShrink: 0, width: '40px', height: '40px' }}>
                {restaurant.logo ? (
                  <img
                    src={restaurant.logo}
                    alt={restaurant.name}
                    style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid rgba(255,255,255,0.88)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.40)',
                      display: 'block',
                      background: '#fff',
                    }}
                  />
                ) : (
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: '#ffffff',
                    border: '2px solid rgba(255,255,255,0.88)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.40)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '15px', fontWeight: 900, color: '#1a1a1a',
                    letterSpacing: '-0.03em',
                  }}>
                    {(restaurant.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Name + location stack */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '16px', fontWeight: 800, color: '#ffffff',
                  letterSpacing: '-0.01em', lineHeight: 1.2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textTransform: 'uppercase',
                }}>
                  {restaurant.name}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '3px',
                  marginTop: '2px',
                }}>
                  <MapPin size={11} color={themeColor} style={{ flexShrink: 0 }} />
                  <div style={{
                    fontSize: '11px', color: 'rgba(255,255,255,0.65)', fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {restaurant.location || 'Fine Dining'}
                  </div>
                </div>
              </div>

              {/* ── Heart + 3-dot icons ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                {/* Heart / Love button */}
                <button
                  onClick={() => {
                    setActiveQuickFilters(prev =>
                      prev.includes('favourite') ? prev : [...prev, 'favourite']
                    )
                    navigateToPage('menu')
                  }}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'rgba(30,30,30,0.85)',
                    border: '1.5px solid rgba(255,255,255,0.28)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                    transition: 'transform 0.15s ease, background 0.2s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = 'rgba(50,50,50,0.9)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(30,30,30,0.85)' }}
                >
                  <Heart size={15} color='#ffffff' fill='none' strokeWidth={2} />
                </button>

                {/* Three-dot vertical menu — dropdown is rendered as a fixed portal below */}
                <button
                  onClick={() => setShowHeaderMenu(v => !v)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'rgba(30,30,30,0.85)',
                    border: '1.5px solid rgba(255,255,255,0.28)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                    transition: 'transform 0.15s ease, background 0.2s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = 'rgba(50,50,50,0.9)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(30,30,30,0.85)' }}
                >
                  <MoreVertical size={15} color="rgba(255,255,255,0.90)" />
                </button>
              </div>
            </div>

            {/* ── Row 2: Search bar + Veg toggle (always visible) ── */}
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'center',
              padding: activeNav === 'menu'
                ? '14px 16px 10px'
                : `8px 16px ${Math.round(10 - 3 * rowProgress)}px`,
            }}>
              {/* Search input — compact white pill */}
              <div style={{ flex: 1, position: 'relative' }}>
                {/* Search icon */}
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(0,0,0,0.38)"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                >
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  className="float-search-light"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder='Search dishes, drinks...'
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: 'none',
                    borderRadius: '50px',
                    padding: '9px 34px 9px 38px',
                    fontSize: '13px',
                    color: '#111',
                    fontFamily: 'inherit',
                    fontWeight: 400,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.50)',
                    transition: 'box-shadow 0.2s ease',
                  }}
                />
                {/* Clear × */}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(0,0,0,0.10)',
                      border: 'none', borderRadius: '50%',
                      width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(0,0,0,0.5)',
                      cursor: 'pointer', fontSize: '12px', lineHeight: 1,
                    }}
                  >×</button>
                )}
              </div>

              {/* VEG toggle */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <span style={{
                  fontSize: '9px', fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase',
                  color: isCollapsed
                    ? (darkMode ? 'rgba(255,255,255,0.60)' : 'rgba(0,0,0,0.50)')
                    : 'rgba(255,255,255,0.90)',
                  transition: 'color 0.3s ease',
                }}>VEG</span>
                <button
                  onClick={() => setVegMode(v => !v)}
                  style={{
                    width: '40px', height: '23px', borderRadius: '12px',
                    background: vegMode ? '#22c55e' : (darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'),
                    border: vegMode ? 'none' : '1.5px solid rgba(255,255,255,0.40)',
                    cursor: 'pointer', position: 'relative',
                    transition: 'background 0.28s ease, border-color 0.28s ease',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '3px',
                    left: vegMode ? 'calc(100% - 19px)' : '3px',
                    width: '15px', height: '15px', borderRadius: '8px',
                    background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.30)',
                    transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </button>
              </div>
            </div>

            {/* ── Row 3: Premium visual category cards (menu page only) ── */}
            {activeNav === 'menu' && (() => {
              const CATEGORY_DEFAULT_IMAGES = {
                starters:   'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300&q=80',
                starter:    'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300&q=80',
                appetizer:  'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300&q=80',
                mains:      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=300&q=80',
                main:       'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=300&q=80',
                maincourse: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=300&q=80',
                rice:       'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=300&q=80',
                curry:      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=300&q=80',
                drinks:     'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300&q=80',
                drink:      'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300&q=80',
                juice:      'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300&q=80',
                soda:       'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300&q=80',
                beverages:  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&q=80',
                beverage:   'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&q=80',
                coffee:     'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&q=80',
                hot:        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&q=80',
                desserts:   'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=300&q=80',
                dessert:    'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=300&q=80',
                sweets:     'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=300&q=80',
                combos:     'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80',
                combo:      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80',
                meals:      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80',
                thali:      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80',
              }
              const FALLBACK_IMG = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80'

              return (
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  padding: '6px 16px 14px',
                  alignItems: 'flex-start',
                }}>
                  {menuTabs.map(tab => {
                    const isActive = activeMenuTab === tab.id
                    const firstImage = (visibleMenuData[tab.id] || []).find(item => item.image)?.image
                    const labelKey = (tab.label || '').toLowerCase().replace(/[\s_-]/g, '')
                    const defaultImg =
                      CATEGORY_DEFAULT_IMAGES[tab.id] ||
                      CATEGORY_DEFAULT_IMAGES[labelKey] ||
                      Object.entries(CATEGORY_DEFAULT_IMAGES).find(([k]) => labelKey.includes(k))?.[1] ||
                      FALLBACK_IMG
                    const imgSrc = firstImage || defaultImg
                    const shortLabel = tab.label === 'MAIN COURSE' ? 'MAIN' : tab.label

                    return (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveMenuTab(tab.id); setActiveCategory('all') }}
                        style={{
                          flexShrink: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          minWidth: '82px',
                          transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.07)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        {/* White rounded square card with food image */}
                        <div style={{
                          width: '82px',
                          height: '82px',
                          borderRadius: '22px',
                          background: '#ffffff',
                          border: isActive
                            ? `2.5px solid ${themeColor}`
                            : '2.5px solid rgba(255,255,255,0.12)',
                          boxShadow: isActive
                            ? `0 6px 20px rgba(0,0,0,0.35), 0 0 0 4px ${themeColor}30`
                            : '0 4px 14px rgba(0,0,0,0.30)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'border-color 0.22s ease, box-shadow 0.22s ease',
                          flexShrink: 0,
                          overflow: 'hidden',
                          padding: '6px',
                        }}>
                          <img
                            src={imgSrc}
                            alt={shortLabel}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              borderRadius: '14px',
                              display: 'block',
                            }}
                            onError={e => {
                              if (e.target.src !== defaultImg) e.target.src = defaultImg
                            }}
                          />
                        </div>

                        {/* Category name below card */}
                        <span style={{
                          fontSize: '10px',
                          fontWeight: isActive ? 900 : 700,
                          color: isActive ? '#ffffff' : 'rgba(255,255,255,0.52)',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          lineHeight: 1,
                          transition: 'color 0.2s ease',
                        }}>
                          {shortLabel}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* ── HEADER SPACER — pushes content below fixed header on non-home tabs ── */}
      {activeNav !== 'home' && <div style={{ height: activeNav === 'menu' ? '185px' : '120px' }} />}


      {/* ── SUB-CATEGORY BAR: Filter button + premium category selector ── */}
      {activeNav === 'menu' && (
        <div style={{ padding: '6px 16px 8px' }}>
          <div style={{
            display: 'flex',
            gap: '16px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            alignItems: 'center',
          }}>

            {/* Filter button — vertically centered, same height as inactive items */}
            <div style={{
              flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '4px',
              position: 'relative',
            }}>
              <button
                onClick={() => setFilterPanelOpen(true)}
                style={{
                  width: '44px', height: '44px',
                  borderRadius: '50%',
                  border: filterCount > 0
                    ? `2px solid ${restaurant?.primaryColor || '#FF3B30'}`
                    : `1.5px solid ${darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'}`,
                  background: filterCount > 0
                    ? (darkMode ? 'rgba(255,59,48,0.15)' : 'rgba(255,59,48,0.07)')
                    : (darkMode ? 'rgba(255,255,255,0.06)' : '#f5f5f5'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <SlidersHorizontal
                  size={16}
                  color={filterCount > 0
                    ? (restaurant?.primaryColor || '#FF3B30')
                    : (darkMode ? 'rgba(255,255,255,0.6)' : '#555')}
                />
              </button>
              <span style={{
                fontSize: '11px', fontWeight: 500,
                color: darkMode ? 'rgba(255,255,255,0.6)' : '#555',
                whiteSpace: 'nowrap',
              }}>Filter</span>
              {filterCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-3px', right: '-3px',
                  width: '17px', height: '17px', borderRadius: '50%',
                  background: '#FF3B30', color: '#fff',
                  fontSize: '10px', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}>{filterCount}</span>
              )}
            </div>

            {/* Category items */}
            {tabCategories.map(cat => {
              const isActive = activeCategory === cat.id
              const imgEl = cat.image ? (
                <img
                  src={cat.image}
                  alt={cat.label}
                  style={{
                    width: isActive ? '62px' : '58px',
                    height: isActive ? '62px' : '58px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    display: 'block',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div style={{
                  width: isActive ? '62px' : '58px',
                  height: isActive ? '62px' : '58px',
                  borderRadius: '50%',
                  background: darkMode ? 'rgba(255,255,255,0.10)' : '#efefef',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isActive ? '28px' : '26px',
                  lineHeight: 1,
                  flexShrink: 0,
                }}>
                  {cat.emoji || '🍽️'}
                </div>
              )

              if (isActive) {
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    style={{
                      flexShrink: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center',
                      gap: '5px',
                      width: '80px',
                      minWidth: '70px',
                      maxWidth: '85px',
                      minHeight: '90px',
                      maxHeight: '110px',
                      height: 'auto',
                      paddingTop: '7px',
                      paddingBottom: '7px',
                      background: '#FFFFFF',
                      border: '2px solid #FF3B30',
                      borderRadius: '44px',
                      boxShadow: '0 2px 8px rgba(255,59,48,0.14)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      boxSizing: 'border-box',
                    }}
                  >
                    {imgEl}
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#FF3B30',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      wordBreak: 'break-word',
                      maxWidth: '72px',
                    }}>
                      {cat.label}
                    </span>
                  </button>
                )
              }

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    width: '76px',
                    background: 'none',
                    border: 'none',
                    padding: '4px 0',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {imgEl}
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: darkMode ? 'rgba(255,255,255,0.80)' : '#222222',
                    textAlign: 'center',
                    lineHeight: 1.25,
                    wordBreak: 'break-word',
                    maxWidth: '76px',
                  }}>
                    {cat.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Active filter badges row */}
          {(filterCount > 0 || drinksSubFilter) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              paddingTop: '10px', flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: '12px', color: darkMode ? 'rgba(255,255,255,0.45)' : '#888',
                fontWeight: 500,
              }}>
                Showing {panelFilteredItems.length} item{panelFilteredItems.length !== 1 ? 's' : ''}
              </span>
              {drinksSubFilter && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                  borderRadius: '20px', padding: '2px 8px 2px 10px',
                  fontSize: '11px', fontWeight: 600,
                  color: darkMode ? 'rgba(255,255,255,0.8)' : '#1a1a1a',
                }}>
                  {DRINKS_SUB_FILTERS.find(s => s.id === drinksSubFilter)?.label}
                  <button
                    onClick={() => setDrinksSubFilter('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'inherit' }}
                  ><X size={11} /></button>
                </span>
              )}
              {activeQuickFilters.map(fid => {
                const qf = QUICK_FILTERS.find(f => f.id === fid)
                return qf ? (
                  <span key={fid} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                    borderRadius: '20px', padding: '2px 8px 2px 10px',
                    fontSize: '11px', fontWeight: 600,
                    color: darkMode ? 'rgba(255,255,255,0.8)' : '#1a1a1a',
                  }}>
                    {qf.icon} {qf.label}
                    <button
                      onClick={() => setActiveQuickFilters(prev => prev.filter(f => f !== fid))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'inherit' }}
                    ><X size={11} /></button>
                  </span>
                ) : null
              })}
            </div>
          )}
        </div>
      )}

      {/* ── FILTER PANEL MODAL ── */}
      {filterPanelOpen && (
        <div
          onClick={() => setFilterPanelOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '310px',
              maxHeight: '70vh',
              background: darkMode ? '#1c1c1c' : '#fff',
              borderRadius: '16px',
              margin: '0 0 0 16px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: darkMode ? '0 8px 40px rgba(0,0,0,0.6)' : '0 8px 40px rgba(0,0,0,0.22)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 10px', flexShrink: 0 }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: darkMode ? '#fff' : '#1a1a1a', letterSpacing: '-0.02em' }}>Filters</div>
              <button
                onClick={() => setFilterPanelOpen(false)}
                style={{ background: darkMode ? 'rgba(255,255,255,0.1)' : '#f2f2f2', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: darkMode ? '#fff' : '#333', flexShrink: 0 }}
              ><X size={15} /></button>
            </div>

            <div style={{ fontSize: '12px', color: darkMode ? 'rgba(255,255,255,0.4)' : '#999', padding: '0 18px 10px', fontWeight: 500, flexShrink: 0 }}>Show dishes that are</div>

            {/* Filter rows — scrollable */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {QUICK_FILTERS.map((qf, idx) => {
                const isOn = activeQuickFilters.includes(qf.id)
                const rowBg = isOn
                  ? 'rgba(232,50,26,0.12)'
                  : (darkMode ? '#1c1c1c' : '#fff')
                return (
                  <div
                    key={qf.id}
                    onClick={() => setActiveQuickFilters(prev => isOn ? prev.filter(f => f !== qf.id) : [...prev, qf.id])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '13px 18px',
                      borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.07)' : '#f4f4f4'}`,
                      cursor: 'pointer',
                      background: rowBg,
                      transition: 'background 0.15s',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0, width: '28px', textAlign: 'center' }}>{qf.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: darkMode ? '#fff' : '#1a1a1a', lineHeight: 1.3 }}>{qf.label}</div>
                      <div style={{ fontSize: '12px', color: darkMode ? 'rgba(255,255,255,0.45)' : '#999', marginTop: '2px', lineHeight: 1.4 }}>{qf.sub}</div>
                    </div>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                      border: isOn ? 'none' : `1.5px solid ${darkMode ? 'rgba(255,255,255,0.25)' : '#d0d0d0'}`,
                      background: isOn ? '#E8321A' : (darkMode ? 'rgba(255,255,255,0.06)' : '#fff'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {isOn && (
                        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                          <path d="M1 3.5L4 6.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 18px', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.07)' : '#f0f0f0'}`, background: darkMode ? '#1c1c1c' : '#fff', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: darkMode ? 'rgba(255,255,255,0.5)' : '#666', fontWeight: 500 }}>
                  {activeQuickFilters.length} filter{activeQuickFilters.length !== 1 ? 's' : ''} selected
                </span>
                {activeQuickFilters.length > 0 && (
                  <button
                    onClick={() => setActiveQuickFilters([])}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#E8321A', padding: 0, fontFamily: 'inherit' }}
                  >Clear all</button>
                )}
              </div>
              <button
                onClick={() => setFilterPanelOpen(false)}
                style={{
                  width: '100%', padding: '13px',
                  borderRadius: '10px', border: 'none',
                  background: '#E8321A', color: '#fff',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(232,50,26,0.3)',
                }}
              >Apply Filters</button>
            </div>
          </div>
        </div>
      )}


      {/* ── SEARCH RESULTS OVERLAY ── */}
      {searchFilteredAll && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: theme.pageBg,
          zIndex: 40, overflowY: 'auto', paddingBottom: '100px',
          paddingTop: '76px',
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
              <div key={i}
                onClick={() => navigate(
                  isMenuPath
                    ? `/${slug}/item/${toSlug(item.name)}/${tableNumber}`
                    : `/restaurant/${slug}/food/${encodeURIComponent(item.name)}`,
                  { state: { item, returnTab: activeNav, darkMode, themeColor: restaurant?.primaryColor || '#E8321A' } }
                )}
                style={{
                display: 'flex', gap: '12px', alignItems: 'center',
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '16px',
                padding: '12px',
                boxShadow: theme.cardShadow,
                cursor: 'pointer',
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
                      onClick={(e) => { e.stopPropagation(); addToCart(item, e) }}
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

          {/* Hero Carousel — starts at y:0, floating header overlays the top */}
          <section className="reveal reveal-1" style={{ position: 'relative', height: '300px', overflow: 'hidden', margin: '0' }}>
            <div style={{ position: 'relative', height: '100%', borderRadius: '0 0 20px 20px', overflow: 'hidden' }}>
              {carouselImages.map((src, i) => (
                <div key={i} style={{ position: 'absolute', inset: 0, backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: i === carouselIdx ? 1 : 0, transition: 'opacity 1s ease' }} />
              ))}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.65) 100%)', borderRadius: '20px' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '18px' }}>
                {heroBadge && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(232,50,26,0.9)', borderRadius: '8px', padding: '4px 10px', marginBottom: '8px', width: 'fit-content' }}>
                    <Flame size={10} color="#fff" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{heroBadge}</span>
                  </div>
                )}
                {heroText && (
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: '6px', textShadow: '0 2px 12px rgba(0,0,0,0.8)', whiteSpace: 'pre-line' }}>
                    {heroText}
                  </div>
                )}
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
              onClick={() => handleOpenBooking()}
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
              onClick={() => navigateToPage('menu')}
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
              <button onClick={() => navigateToPage('menu')} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', color: '#E8321A', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                  onClick={() => navigate(
                    isMenuPath
                      ? `/${slug}/item/${toSlug(item.name)}/${tableNumber}`
                      : `/restaurant/${slug}/food/${encodeURIComponent(item.name)}`,
                    { state: { item, returnTab: activeNav, darkMode, themeColor: restaurant?.primaryColor || '#E8321A' } }
                  )}
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

            {/* About hero image — admin-uploaded takes priority, then carousel fallback */}
            {(aboutData.image || carouselImages.length > 1) && (
              <div style={{ height: '155px', borderRadius: '16px', overflow: 'hidden', marginBottom: '12px', position: 'relative' }}>
                {aboutData.image ? (
                  <img src={aboutData.image} alt="About" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ height: '100%', backgroundImage: `url(${carouselImages[1] || carouselImages[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                )}
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
                  if (!openingHours) return null
                  const { openH, openM, openAmPm, closeH, closeM, closeAmPm } = openingHours
                  const fmtT = (h, m, ap) => `${h}:${String(m).padStart(2, '0')} ${ap}`
                  const toMins = (h, m, ap) => {
                    let h24 = h % 12
                    if (ap === 'PM') h24 += 12
                    return h24 * 60 + m
                  }
                  const now = new Date()
                  const nowMins = now.getHours() * 60 + now.getMinutes()
                  const openMins = toMins(openH, openM, openAmPm)
                  const closeMins = toMins(closeH, closeM, closeAmPm)
                  const isOpen = openMins <= closeMins
                    ? nowMins >= openMins && nowMins < closeMins
                    : nowMins >= openMins || nowMins < closeMins
                  return (
                    <InfoRow
                      icon={<Clock size={14} color={isOpen ? '#4ade80' : '#E8321A'} />}
                      label="Opening Hours"
                      value={`${fmtT(openH, openM, openAmPm)} – ${fmtT(closeH, closeM, closeAmPm)} · ${isOpen ? 'Open Now' : 'Closed'}`}
                      theme={theme}
                    />
                  )
                })()}
                {restaurant.phone && (
                  <InfoRow icon={<Phone size={14} color="#60a5fa" />} label="Reservations" value={restaurant.phone} theme={theme} />
                )}
                {restaurant.email && (
                  <InfoRow icon={<Mail size={14} color="#a78bfa" />} label="Email" value={restaurant.email} theme={theme} />
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
            {(() => {
              const sl = restaurant.socialLinks || {}
              const has = key => sl[key] && sl[key].trim() && sl[key].trim() !== '#'
              const anyLink = ['facebook','instagram','twitter','linkedin','youtube','website','whatsapp'].some(has)
              if (!anyLink) return null
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
                  {has('facebook')  && <SocialBtn href={sl.facebook}  icon={<FaFacebook  size={19} />} brandColor="#1877F2" theme={theme} />}
                  {has('instagram') && <SocialBtn href={sl.instagram} icon={<FaInstagram size={19} />} brandColor="#E1306C" theme={theme} />}
                  {has('twitter')   && <SocialBtn href={sl.twitter}   icon={<FaXTwitter  size={18} />} brandColor="#000000" theme={theme} />}
                  {has('linkedin')  && <SocialBtn href={sl.linkedin}  icon={<FaLinkedinIn size={18} />} brandColor="#0A66C2" theme={theme} />}
                  {has('youtube')   && <SocialBtn href={sl.youtube}   icon={<FaYoutube   size={19} />} brandColor="#FF0000" theme={theme} />}
                  {has('website')   && <SocialBtn href={sl.website}   icon={<Globe       size={18} />} brandColor="#0EA5E9" theme={theme} />}
                  {has('whatsapp')  && <SocialBtn href={sl.whatsapp}  icon={<FaWhatsapp  size={19} />} brandColor="#25D366" theme={theme} />}
                </div>
              )
            })()}
            {restaurant.googleReview && restaurant.googleReview.trim() ? (
              <a
                href={restaurant.googleReview.trim()}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50px', padding: '10px 20px', textDecoration: 'none', letterSpacing: '0.04em' }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" style={{ flexShrink: 0 }}>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}>Leave us a Google Review</span>
              </a>
            ) : null}
            <div style={{ marginTop: '18px', fontSize: '10px', color: theme.footerLocation, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Powered by EXZIBO</div>
          </footer>
        </div>
      )}

      {/* ── MENU VIEW ── */}
      {activeNav === 'menu' && (
        <div style={{ animation: 'fadeIn 0.3s ease', paddingBottom: cartCount > 0 ? '130px' : '100px', transition: 'padding-bottom 0.3s ease' }}>

          {/* Menu Cards */}
          <div style={{ padding: '4px 14px 8px' }}>
            {panelFilteredItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: theme.tabInactiveColor, fontSize: '13px' }}>No items in this category yet</div>
            )}
            {panelFilteredItems.map((item, i) => {
              const inCart = cartItems.find(c => c.name === item.name)
              return (
                <MenuCard
                  key={`${activeMenuTab}-${i}`}
                  item={item}
                  theme={theme}
                  onAddToCart={addToCart}
                  cartQty={inCart ? inCart.qty : 0}
                  liked={!!(liked[item.id] || liked[item.name])}
                  onLike={() => toggleLiked(item)}
                  onPress={() => navigate(
                    isMenuPath
                      ? `/${slug}/item/${toSlug(item.name)}/${tableNumber}`
                      : `/restaurant/${slug}/food/${encodeURIComponent(item.name)}`,
                    { state: { item, returnTab: activeNav, darkMode, themeColor: restaurant?.primaryColor || '#E8321A' } }
                  )}
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
                onClick={() => navigateToPage('menu')}
                style={{ marginTop: '8px', background: '#E8321A', color: '#fff', border: 'none', borderRadius: '14px', padding: '12px 28px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(232,50,26,0.35)' }}
              >
                Browse Menu
              </button>
            </div>
          )}

          {/* Cart items */}
          {cartItems.length > 0 && (
            <div style={{ margin: '8px 14px 0', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              {cartItems.map((item, idx) => {
                const unitPrice = item.price
                const originalPrice = item.oldPrice || Math.round(unitPrice * 1.28)
                return (
                  <div key={item.id}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '16px', gap: '14px' }}>
                      {/* Food image */}
                      <div style={{ flexShrink: 0, width: '80px', height: '80px', borderRadius: '12px', overflow: 'hidden', background: '#f5f5f5' }}>
                        <img
                          src={item.img}
                          alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
                        />
                      </div>

                      {/* Middle info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>{item.name}</div>
                        {item.description && (
                          <div style={{ fontSize: '13px', color: '#888', marginTop: '3px' }}>{item.description}</div>
                        )}
                      </div>

                      {/* Right: green stepper + prices */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                        {/* Dark green pill stepper */}
                        <div style={{ display: 'flex', alignItems: 'center', background: '#2e7d32', borderRadius: '24px', height: '40px', padding: '0 8px', gap: '4px' }}>
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', lineHeight: 1, cursor: 'pointer', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: 0 }}
                          >−</button>
                          <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px', minWidth: '22px', textAlign: 'center' }}>{item.qty}</span>
                          <button
                            onClick={() => updateQty(item.id, 1)}
                            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', lineHeight: 1, cursor: 'pointer', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: 0 }}
                          >+</button>
                        </div>
                        {/* Prices */}
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                          <span style={{ fontSize: '13px', color: '#aaa', textDecoration: 'line-through' }}>₹{(originalPrice * item.qty).toLocaleString('en-IN')}</span>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a' }}>₹{(unitPrice * item.qty).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                    {idx < cartItems.length - 1 && (
                      <div style={{ height: '1px', background: '#f0f0f0', margin: '0 16px' }} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Price Details + Place Order */}
          {cartItems.length > 0 && (
            <>
            {/* Price Details card */}
            <div style={{ padding: '8px 14px 0' }}>
              <div style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '18px 18px 14px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginBottom: '16px' }}>Price Details</div>

                {/* Total MRP */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '13px' }}>
                  <span style={{ fontSize: '14px', color: '#444', fontWeight: 400 }}>Total MRP</span>
                  <span style={{ fontSize: '14px', color: '#1a1a1a', fontWeight: 500 }}>₹{subtotal.toLocaleString('en-IN')}</span>
                </div>

                {/* Coupon Discount */}
                {couponSectionEnabled && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '13px' }}>
                    <span style={{ fontSize: '14px', color: '#444', fontWeight: 400 }}>Coupon Discount</span>
                    {couponApplied ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', color: '#22c55e', fontWeight: 600 }}>− ₹{discountAmt.toLocaleString('en-IN')}</span>
                        <button
                          onClick={() => { setCouponApplied(false); setCouponInput(''); setAppliedCouponData(null) }}
                          style={{ background: 'none', border: 'none', color: '#999', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: '0', textDecoration: 'underline' }}
                        >Remove</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setCouponError(''); setShowCouponModal(true) }}
                        style={{ background: 'none', border: 'none', color: '#e91e8c', fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: '0' }}
                      >Apply Coupon</button>
                    )}
                  </div>
                )}

                {/* GST */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '13px' }}>
                  <span style={{ fontSize: '14px', color: '#444', fontWeight: 400 }}>GST (5%)</span>
                  <span style={{ fontSize: '14px', color: '#1a1a1a', fontWeight: 500 }}>₹{gstAmt.toLocaleString('en-IN')}</span>
                </div>

                {/* Dashed divider */}
                <div style={{ borderTop: '1.5px dashed #ddd', margin: '4px 0 16px' }} />

                {/* Total Amount */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#1a1a1a' }}>Total Amount</span>
                  <span style={{ fontSize: '17px', fontWeight: 900, color: '#1a1a1a' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Place Order button */}
            <div style={{ padding: '14px 14px 8px' }}>
              <button
                className="checkout-btn"
                onClick={() => setShowOrderConfirm(true)}
                style={{
                  width: '100%',
                  background: '#e53935',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '16px',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  letterSpacing: '0.01em',
                  boxShadow: '0 6px 20px rgba(229,57,53,0.40)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                Place Order <span style={{ fontSize: '16px' }}>→</span>
              </button>
            </div>

            {/* Coupon Modal */}
            {showCouponModal && (
              <>
                <style>{`@keyframes couponFadeIn { from { opacity: 0; transform: translate(-50%, -48%); } to { opacity: 1; transform: translate(-50%, -50%); } }`}</style>
                {/* Overlay */}
                <div
                  onClick={() => { setShowCouponModal(false); setCouponError('') }}
                  style={{
                    position: 'fixed',
                    top: 0, left: 0,
                    width: '100%', height: '100%',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    zIndex: 999,
                  }}
                />
                {/* Centered modal */}
                <div style={{
                  position: 'fixed',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 1000,
                  width: '85%',
                  maxWidth: '400px',
                  background: '#fff',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  animation: 'couponFadeIn 0.2s ease both',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <span style={{ fontSize: '17px', fontWeight: 800, color: '#1a1a1a' }}>Apply Coupon</span>
                    <button
                      onClick={() => { setShowCouponModal(false); setCouponError('') }}
                      style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', color: '#555', fontWeight: 700 }}
                    >✕</button>
                  </div>

                  {/* Input + button */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                      placeholder="Enter coupon code"
                      autoFocus
                      style={{
                        flex: 1,
                        border: `1.5px solid ${couponError ? '#e53935' : '#ddd'}`,
                        borderRadius: '12px',
                        padding: '13px 14px',
                        fontSize: '14px',
                        color: '#1a1a1a',
                        outline: 'none',
                        fontFamily: 'inherit',
                        letterSpacing: '0.05em',
                        fontWeight: 600,
                        background: '#fafafa',
                        transition: 'border-color 0.2s',
                      }}
                    />
                    <button
                      onClick={handleApplyCoupon}
                      style={{ background: '#e53935', color: '#fff', border: 'none', borderRadius: '12px', padding: '13px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(229,57,53,0.30)' }}
                    >Apply</button>
                  </div>

                  {/* Error message */}
                  {couponError && !couponApplied && (
                    <div style={{ fontSize: '12px', color: '#e53935', marginTop: '8px', fontWeight: 600 }}>{couponError}</div>
                  )}

                  {/* Success message */}
                  {couponApplied && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', background: 'rgba(34,197,94,0.08)', border: '1.5px solid rgba(34,197,94,0.25)', borderRadius: '10px', padding: '10px 14px' }}>
                      <CheckCircle size={16} color="#22c55e" />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>
                        {appliedCouponData
                          ? `${appliedCouponData.code} applied — ${appliedCouponData.discountType === 'Fixed Amount' ? `₹${appliedCouponData.discountPct} off!` : `${appliedCouponData.discountPct}% off!`}`
                          : 'Coupon applied!'}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
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
                  { label: 'Grand Total', value: `₹${viewingHistoryOrder.grandTotal.toLocaleString('en-IN')}  INR` },
                  { label: 'STATUS', value: 'DELIVERED', highlight: true },
                ].map(({ label, value, highlight }, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${theme.cardBorder}` : 'none' }}>
                    <span style={{ fontSize: '13px', color: theme.locationColor, fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: highlight ? '#22c55e' : theme.color }}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Reorder */}
              <button className="reorder-btn" onClick={() => { setCartItems(viewingHistoryOrder.items.map(i => ({ ...i }))); setViewingHistoryOrder(null); navigateToPage('cart') }} style={{ width: '100%', background: 'linear-gradient(135deg, #1c1c1c, #2a2a2a)', color: '#fff', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '15px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginBottom: '10px' }}>
                ↺  Reorder Same Items
              </button>
              {/* Cancel this order */}
              <button
                onClick={() => handleCancelOrder(viewingHistoryOrder.id)}
                style={{ width: '100%', background: 'none', color: '#E8321A', border: '1.5px solid rgba(232,50,26,0.35)', borderRadius: '16px', padding: '13px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', transition: 'background 0.2s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,50,26,0.07)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Cancel Order
              </button>
            </div>
          )}

          {/* ── MAIN ORDERS VIEW (no history order selected) ── */}
          {!viewingHistoryOrder && (
            <>
          {/* No order state */}
          {customerOrders.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 24px 24px', gap: '14px' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '36px', background: darkMode ? 'rgba(255,255,255,0.05)' : '#f0ece8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={30} color={darkMode ? '#555' : '#ccc'} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: theme.color }}>No active orders.</div>
              <div style={{ fontSize: '13px', color: theme.locationColor, textAlign: 'center', lineHeight: 1.6, maxWidth: '220px' }}>Place an order from the cart to track it here</div>
              <button onClick={() => navigateToPage('menu')} style={{ marginTop: '8px', background: '#E8321A', color: '#fff', border: 'none', borderRadius: '14px', padding: '12px 28px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(232,50,26,0.35)' }}>
                Browse Menu
              </button>
            </div>
          )}

          {/* Order page */}
          {currentOrder && (
            <div style={{ padding: '18px 14px 0' }}>

              {/* Back + Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <button onClick={() => navigateToPage('home')} style={{ width: '36px', height: '36px', borderRadius: '18px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.10)', flexShrink: 0 }}>
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
                  <button onClick={() => navigateToPage('menu')} style={{ flexShrink: 0, background: '#E8321A', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 16px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(232,50,26,0.40)' }}>
                    MENU
                  </button>
                </div>

                {/* ── STATUS TRACKER ── */}
                {(() => {
                  const st = currentOrder?.status || 'pending'
                  const isNegative = st === 'cancelled' || st === 'rejected'

                  // Full progression steps for positive path
                  const PROGRESSION = ['pending', 'confirmed', 'preparing', 'ready', 'completed']
                  const currentIdx = PROGRESSION.indexOf(st)

                  // Build step list — only PLACED + CONFIRMED shown to customer
                  let steps
                  if (isNegative) {
                    steps = [
                      { label: 'PLACED', done: true },
                      { label: st === 'rejected' ? 'REJECTED' : 'CANCELLED', done: true, red: true },
                    ]
                  } else {
                    const isConfirmed = currentIdx >= 1
                    steps = [
                      { label: 'PLACED',    done: true },
                      { label: 'CONFIRMED', done: isConfirmed },
                    ]
                  }

                  // Progress bar fill % — 0% until confirmed, 100% once confirmed or beyond
                  const isConfirmedOrBeyond = currentIdx >= 1
                  const fillPct = isNegative ? 100 : isConfirmedOrBeyond ? 100 : 0

                  // Status message config
                  const msgMap = {
                    pending:   { icon: '⏳', color: '#FFA000', title: 'Order Received!',           body: "We've received your request and are waiting for the restaurant to confirm. This usually only takes a moment." },
                    confirmed: { icon: '✅', color: '#22c55e', title: 'Order Confirmed!',           body: 'Great news! Your order has been confirmed and will start preparing soon.' },
                    preparing: { icon: '🍳', color: '#3B82F6', title: 'Being Prepared!',            body: 'The kitchen is working on your order right now. Hang tight!' },
                    ready:     { icon: '🔔', color: '#8B5CF6', title: 'Order Ready!',              body: 'Your order is ready! Please collect it or your server will bring it to you shortly.' },
                    completed: { icon: '🎉', color: '#22c55e', title: 'Order Completed!',           body: 'Thank you for dining with us. We hope you enjoyed your meal!' },
                    cancelled: { icon: '❌', color: '#ef4444', title: 'Order Cancelled',            body: 'Your order has been cancelled by the restaurant. Please contact staff if you need assistance.' },
                    rejected:  { icon: '❌', color: '#ef4444', title: 'Order Could Not Be Placed',  body: 'Unfortunately your order was not accepted. Please speak to a staff member or try again.' },
                  }
                  const msg = msgMap[st] || msgMap.pending

                  return (
                    <div>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        {/* Progress track */}
                        <div style={{ position: 'absolute', top: '14px', left: '14px', right: '14px', height: '3px', background: darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', borderRadius: '2px', zIndex: 0 }}>
                          <div style={{ height: '100%', borderRadius: '2px', background: isNegative ? '#ef4444' : '#E8321A', width: `${fillPct}%`, transition: 'width 0.8s ease' }} />
                        </div>
                        {steps.map((step, i) => {
                          const dotColor = step.red ? '#ef4444' : '#E8321A'
                          return (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 1, flex: 1 }}>
                              <div style={{
                                width: '28px', height: '28px', borderRadius: '14px',
                                background: step.done ? dotColor : (darkMode ? 'rgba(255,255,255,0.10)' : '#e5e0db'),
                                border: `2px solid ${step.done ? dotColor : (darkMode ? 'rgba(255,255,255,0.15)' : '#ddd')}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: step.done ? `0 0 0 4px ${step.red ? 'rgba(239,68,68,0.15)' : 'rgba(232,50,26,0.15)'}` : 'none',
                                animation: step.done ? 'statusBounce 0.5s ease' : 'none',
                                transition: 'all 0.4s ease',
                              }}>
                                {step.done
                                  ? <CheckCircle size={14} color="#fff" strokeWidth={2.5} />
                                  : <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: darkMode ? 'rgba(255,255,255,0.25)' : '#ccc' }} />
                                }
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        {steps.map((step, i) => (
                          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '9px', fontWeight: step.done ? 800 : 600, color: step.done ? (step.red ? '#ef4444' : theme.color) : theme.locationColor, letterSpacing: '0.08em' }}>
                            {step.label}
                          </div>
                        ))}
                      </div>

                      {/* ── STATUS MESSAGE ── */}
                      <div style={{
                        marginTop: '16px',
                        background: darkMode ? `${msg.color}14` : `${msg.color}12`,
                        border: `1px solid ${msg.color}4D`,
                        borderRadius: '14px',
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                      }}>
                        <div style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>{msg.icon}</div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: msg.color, marginBottom: '4px' }}>{msg.title}</div>
                          <div style={{ fontSize: '12px', lineHeight: 1.6, color: theme.locationColor }}>{msg.body}</div>
                        </div>
                      </div>
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
                  { label: 'Grand Total', value: `₹${currentOrder.grandTotal.toLocaleString('en-IN')}  INR` },
                  { label: 'STATUS', value: (currentOrder?.status || 'pending').toUpperCase(), highlight: orderStatus >= 1, red: orderStatus === -1 },
                ].map(({ label, value, highlight, red }, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${theme.cardBorder}` : 'none' }}>
                    <span style={{ fontSize: '13px', color: theme.locationColor, fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: red ? '#ef4444' : highlight ? '#22c55e' : theme.color }}>{value}</span>
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
                    navigateToPage('cart')
                  }
                }}
                style={{ width: '100%', background: 'linear-gradient(135deg, #1c1c1c, #2a2a2a)', color: '#fff', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '15px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginBottom: '10px' }}
              >
                ↺  Reorder Same Items
              </button>
              {/* Cancel Order button */}
              <button
                onClick={() => currentOrder && handleCancelOrder(currentOrder.id)}
                style={{ width: '100%', background: 'none', color: '#E8321A', border: '1.5px solid rgba(232,50,26,0.35)', borderRadius: '16px', padding: '13px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', transition: 'background 0.2s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,50,26,0.07)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                Cancel Order
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
                    <div
                      key={order.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '14px 16px',
                        borderBottom: isLast ? 'none' : `1px solid ${theme.cardBorder}`,
                      }}
                    >
                      {/* Clickable row */}
                      <button
                        onClick={() => setViewingHistoryOrder(order)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '14px',
                          flex: 1, minWidth: 0,
                          background: 'none', border: 'none', cursor: 'pointer',
                          textAlign: 'left', padding: 0,
                        }}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: theme.color }}>Placed on {order.date}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: theme.locationColor, fontWeight: 400, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                            {truncated}
                          </div>
                          <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 700, color: '#E8321A' }}>
                            ₹{order.grandTotal.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <ChevronRight size={18} color={theme.locationColor} style={{ flexShrink: 0 }} />
                      </button>
                      {/* Cancel button */}
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        title="Cancel this order"
                        style={{ flexShrink: 0, background: 'none', border: '1.5px solid rgba(232,50,26,0.30)', borderRadius: '10px', padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: '#E8321A', cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,50,26,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        Cancel
                      </button>
                    </div>
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
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.18s ease',
          }}
          onClick={() => setShowOrderConfirm(false)}
        >
          <div
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '85%', maxWidth: '360px',
              background: darkMode ? '#1E1E1E' : '#FFFFFF',
              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}`,
              borderRadius: '20px',
              padding: '28px 24px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              animation: 'confirmScaleIn 0.18s ease-out both',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
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
                  flex: 1, height: '48px', borderRadius: '12px',
                  background: 'transparent',
                  border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'}`,
                  color: theme.color, fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowOrderConfirm(false); handlePlaceOrder() }}
                style={{
                  flex: 2, height: '48px', borderRadius: '12px',
                  background: '#E63B2E', border: 'none',
                  color: '#fff', fontSize: '14px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 20px rgba(232,50,26,0.38)',
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

      {/* ── THREE-DOT DROPDOWN (fixed portal — avoids overflow:hidden clipping) ── */}
      {showHeaderMenu && (
        <>
          <style>{`
            @keyframes exzMenuFade {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          `}</style>
          {/* Tap-outside backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1200 }}
            onClick={() => setShowHeaderMenu(false)}
          />
          {/* Menu card */}
          <div style={{
            position: 'fixed',
            top: '54px',
            right: '12px',
            zIndex: 1201,
            background: '#181818',
            borderRadius: '14px',
            width: '152px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.07)',
            overflow: 'hidden',
            animation: 'exzMenuFade 150ms ease-out forwards',
          }}>
            {/* Rate Us */}
            <button
              onClick={() => {
                setShowHeaderMenu(false)
                const name = restaurant?.name || ''
                const placeId = restaurant?.google_place_id
                if (placeId) {
                  window.open(`https://search.google.com/local/writereview?placeid=${placeId}`, '_blank')
                } else {
                  window.open(`https://www.google.com/search?q=${encodeURIComponent(name + ' reviews')}`, '_blank')
                }
              }}
              style={{
                width: '100%',
                padding: '14px 18px',
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.92)',
                fontSize: '15px', fontWeight: 400,
                letterSpacing: '0',
                textAlign: 'left', cursor: 'pointer',
                display: 'block',
                lineHeight: 1.2,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              Rate Us
            </button>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />
            {/* Help */}
            <button
              onClick={() => {
                setShowHeaderMenu(false)
                setShowHelpSheet(true)
              }}
              style={{
                width: '100%',
                padding: '14px 18px',
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.92)',
                fontSize: '15px', fontWeight: 400,
                letterSpacing: '0',
                textAlign: 'left', cursor: 'pointer',
                display: 'block',
                lineHeight: 1.2,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              Help
            </button>
          </div>
        </>
      )}

      {/* ── HELP BOTTOM SHEET ── */}
      {showHelpSheet && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowHelpSheet(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            }}
          />
          {/* Sheet */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            zIndex: 1001,
            background: darkMode ? '#1E1E1E' : '#fff',
            borderRadius: '20px 20px 0 0',
            paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
            animation: 'helpSheetUp 250ms ease-out both',
          }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '4px' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#CCCCCC' }} />
            </div>

            {/* Content */}
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{
                fontSize: '18px', fontWeight: 700,
                color: darkMode ? '#fff' : '#111',
                textAlign: 'center', marginBottom: '8px',
              }}>
                Need Help?
              </div>
              <div style={{
                fontSize: '13px', color: darkMode ? 'rgba(255,255,255,0.5)' : '#888',
                textAlign: 'center', marginBottom: '24px',
              }}>
                Choose how you'd like to reach us
              </div>

              {/* Email Us */}
              <a
                href={`mailto:${restaurant?.email || 'support@exzibo.com'}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', height: '52px', borderRadius: '12px',
                  background: 'transparent',
                  border: '2px solid #2E7D32',
                  color: '#2E7D32', fontSize: '15px', fontWeight: 600,
                  textDecoration: 'none', marginBottom: '12px',
                  gap: '8px',
                }}
                onClick={() => setShowHelpSheet(false)}
              >
                ✉ Email Us
              </a>

              {/* Call Us */}
              <a
                href={`tel:${restaurant?.phone || ''}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', height: '52px', borderRadius: '12px',
                  background: '#2E7D32',
                  color: '#fff', fontSize: '15px', fontWeight: 600,
                  textDecoration: 'none',
                  gap: '8px',
                  opacity: restaurant?.phone ? 1 : 0.5,
                  pointerEvents: restaurant?.phone ? 'auto' : 'none',
                }}
                onClick={() => setShowHelpSheet(false)}
              >
                📞 Call Us
              </a>
            </div>
          </div>

          <style>{`
            @keyframes helpSheetUp {
              from { transform: translateY(100%); }
              to   { transform: translateY(0); }
            }
          `}</style>
        </>
      )}

      {/* ── FLOATING CART SUMMARY BAR ── */}
      {cartCount > 0 && activeNav !== 'cart' && (
        <div style={{
          position: 'fixed',
          bottom: '88px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '440px',
          zIndex: 90,
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          gap: '8px',
        }}>
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#111',
            whiteSpace: 'nowrap',
          }}>
            {cartCount} {cartCount === 1 ? 'item' : 'items'} | ₹{subtotal.toLocaleString('en-IN')}
          </span>
          <button
            onClick={() => navigateToPage('cart')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#111111',
              border: 'none',
              borderRadius: '10px',
              padding: '9px 18px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ShoppingCart size={16} color="#fff" strokeWidth={2.5} />
            <span style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '0.01em',
            }}>View Cart</span>
          </button>
        </div>
      )}

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 1100,
        background: darkMode ? '#1A1A1A' : '#FFFFFF',
        borderRadius: '12px 12px 0 0',
        borderTop: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
        height: '56px',
        padding: `6px 0 env(safe-area-inset-bottom)`,
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        transition: 'background 0.3s ease',
      }}>
        {[
          { id: 'home', icon: <FaHouse size={22} /> },
          { id: 'menu', icon: <FaUtensils size={22} /> },
          {
            id: 'cart',
            icon: (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <FaCartShopping size={22} />
                {cartCount > 0 && (
                  <span style={{ position: 'absolute', top: '-5px', right: '-7px', width: '16px', height: '16px', borderRadius: '8px', background: '#E8321A', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>
                )}
              </div>
            ),
          },
          { id: 'orders', icon: <FaClipboardList size={22} /> },
          { id: 'booking', icon: <FaStore size={22} /> },
        ].map(({ id, icon }) => {
          const isActive = activeNav === id
          const activeIconColor = darkMode ? '#FFFFFF' : '#1A1A1A'
          const activePillBg = darkMode ? '#3A3A3A' : '#F0F0F0'
          return (
            <button
              key={id}
              onClick={() => {
                if (id === 'booking') { handleOpenBooking() }
                else { setShowQuickBookModal(false); navigateToPage(id) }
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', background: 'none',
                padding: 0, flex: 1,
              }}
            >
              <div
                ref={id === 'cart' ? cartIconRef : undefined}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '44px', height: '36px', borderRadius: '10px',
                  background: isActive ? activePillBg : 'transparent',
                  color: isActive ? activeIconColor : '#9E9E9E',
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

      {/* ── QUICK BOOK MODAL ── */}
      {showQuickBookModal && (
        <div
          onClick={() => setShowQuickBookModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1050,
            background: '#f2f2f2',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            overflowY: 'auto',
          }}
        >
          <style>{`
            .qb-input {
              width: 100%;
              background: #ebebeb;
              border: none;
              border-radius: 18px;
              padding: 17px 20px;
              font-size: 15px;
              color: #333;
              font-family: inherit;
              outline: none;
              box-sizing: border-box;
              box-shadow: 5px 5px 12px rgba(0,0,0,0.09), -4px -4px 10px rgba(255,255,255,0.90);
              appearance: none;
            }
            .qb-input::placeholder { color: #bbb; font-size: 14px; }
            .qb-input:focus { box-shadow: 5px 5px 12px rgba(0,0,0,0.11), -4px -4px 10px rgba(255,255,255,0.92), inset 0 0 0 1.5px rgba(41,121,255,0.30); }
            .qb-input-err { box-shadow: 5px 5px 12px rgba(0,0,0,0.09), -4px -4px 10px rgba(255,255,255,0.90), inset 0 0 0 1.5px rgba(232,50,26,0.50) !important; }
          `}</style>

          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '390px', padding: '0 22px 100px', boxSizing: 'border-box' }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '32px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(0,0,0,0.16)' }} />
            </div>

            {/* ── Stacked card area ── */}
            <div style={{ position: 'relative', marginBottom: '30px' }}>

              {/* Rear card: brown/tan, tilted, peeking right */}
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '14px',
                right: '-18px',
                bottom: '-8px',
                background: 'linear-gradient(145deg, #c4a98a, #a8896a)',
                borderRadius: '28px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
                transform: 'rotate(4deg)',
                zIndex: 0,
              }} />

              {/* Main white card */}
              <div style={{
                position: 'relative', zIndex: 1,
                background: '#fff',
                borderRadius: '24px',
                overflow: 'visible',
                boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
              }}>
                {/* Image section */}
                <div style={{ width: '100%', height: '230px', overflow: 'hidden', borderRadius: '24px 24px 0 0', position: 'relative' }}>
                  <img
                    src={
                      (customCarouselImages && customCarouselImages.length > 0)
                        ? customCarouselImages[0]
                        : restaurant?.logo || '/menu/wagyu-ribeye.png'
                    }
                    alt={restaurant?.name || 'Restaurant'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                    onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
                  />
                </div>

                {/* Info panel: floating white box overlapping image bottom */}
                <div style={{
                  margin: '0 14px',
                  marginTop: '-28px',
                  position: 'relative', zIndex: 2,
                  background: '#fff',
                  borderRadius: '20px',
                  padding: '18px 18px 20px',
                  boxShadow: '0 6px 28px rgba(0,0,0,0.12)',
                  marginBottom: '14px',
                }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#111', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {restaurant?.name || 'Restaurant'}
                  </div>
                  <div style={{ height: '1px', background: '#ededed', margin: '12px 0' }} />
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '10px', lineHeight: 1.5 }}>
                    {[restaurant?.place, restaurant?.description ? restaurant.description.split(/\s+/).slice(0, 3).join(' ') : null, 'Table booking']
                      .filter(Boolean).join(' • ')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#E8321A', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#E8321A' }}>Flat 50% off on pre-booking</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Neumorphic inputs ── */}
            <div style={{ width: '88%', margin: '0 auto' }}>
              <div style={{ marginBottom: '16px' }}>
                <input
                  className={`qb-input${quickBookErrors.name ? ' qb-input-err' : ''}`}
                  type="text"
                  placeholder="Full Name"
                  value={quickBookName}
                  onChange={e => { setQuickBookName(e.target.value); setQuickBookErrors(p => ({ ...p, name: '' })) }}
                />
                {quickBookErrors.name && (
                  <div style={{ fontSize: '11px', color: '#E8321A', marginTop: '5px', paddingLeft: '4px' }}>Name is required</div>
                )}
              </div>

              <div style={{ marginBottom: '28px' }}>
                <input
                  className={`qb-input${quickBookErrors.phone ? ' qb-input-err' : ''}`}
                  type="tel"
                  placeholder="Phone Number"
                  value={quickBookPhone}
                  onChange={e => { setQuickBookPhone(e.target.value); setQuickBookErrors(p => ({ ...p, phone: '' })) }}
                />
                {quickBookErrors.phone && (
                  <div style={{ fontSize: '11px', color: '#E8321A', marginTop: '5px', paddingLeft: '4px' }}>Phone is required</div>
                )}
              </div>

              {/* ── Buttons ── */}
              <div style={{ display: 'flex', gap: '18px' }}>
                <button
                  onClick={() => setShowQuickBookModal(false)}
                  style={{
                    flex: 1, padding: '18px 0', borderRadius: '20px',
                    background: '#fff',
                    border: '1.5px solid #2979ff',
                    color: '#2979ff', fontSize: '14px', fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                    letterSpacing: '0.07em',
                    boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleQuickBookConfirm}
                  style={{
                    flex: 1, padding: '18px 0', borderRadius: '20px',
                    background: '#2979ff',
                    border: 'none',
                    color: '#fff', fontSize: '14px', fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                    letterSpacing: '0.07em',
                    boxShadow: '0 8px 24px rgba(41,121,255,0.45)',
                  }}
                >
                  BOOK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

const MENU_TAG_COLORS = {
  Popular:       { color: '#B45309', border: '#FDE68A' },
  'Gluten Free': { color: '#1D4ED8', border: '#93C5FD' },
  Vegetarian:    { color: '#16a34a', border: '#86efac' },
  Seasonal:      { color: '#7c3aed', border: '#c4b5fd' },
}

function MenuCard({ item, theme, onAddToCart, cartQty, onPress, liked, onLike }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const oldPrice = item.oldPrice || Math.round((item.price || 0) * 1.5)
  const isHorizontal = item.imageShape === 'horizontal' || item.image_shape === 'horizontal'

  if (isHorizontal) {
    return (
      <div
        className="menu-card"
        onClick={onPress}
        style={{
          display: 'flex',
          background: theme.cardBg,
          border: `1.5px solid ${theme.cardBorder}`,
          borderRadius: '18px',
          overflow: 'hidden',
          marginBottom: '14px',
          boxShadow: theme.cardShadow,
          cursor: 'pointer',
          minHeight: '210px',
        }}
      >
        {/* Left — image ~55% width, full height */}
        <div style={{ width: '55%', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          <img
            src={item.img || fallbackImg}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.35s ease' }}
            onError={e => { e.target.src = fallbackImg }}
            loading="lazy"
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          />
        </div>

        {/* Right — info panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 14px 14px', minWidth: 0 }}>

          {/* Heart + Share — top right */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginBottom: '8px' }}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onLike && onLike() }}
              style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: liked ? 'rgba(232,50,26,0.12)' : theme.cardBg,
                border: `1px solid ${liked ? '#E8321A' : theme.cardBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0, flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            >
              <Heart size={13} fill={liked ? '#E8321A' : 'none'} color={liked ? '#E8321A' : theme.itemName} />
            </button>
            <button
              type="button"
              onClick={e => e.stopPropagation()}
              style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: theme.cardBg,
                border: `1px solid ${theme.cardBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0, flexShrink: 0,
              }}
            >
              <Share2 size={13} color={theme.itemName} />
            </button>
          </div>

          {/* VEG badge + item name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
              background: item.veg !== false ? '#16a34a' : '#dc2626',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '7px', fontWeight: 900, color: '#fff', letterSpacing: '0.03em', textAlign: 'center', lineHeight: 1.1 }}>
                {item.veg !== false ? 'VEG' : 'NON\nVEG'}
              </span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: theme.itemName, lineHeight: 1.2, wordBreak: 'break-word' }}>
              {item.name}
            </div>
          </div>

          {/* Description */}
          {(item.description || item.desc) && (
            <div style={{
              fontSize: '11px', color: '#94A3B8', lineHeight: 1.55, marginBottom: '8px',
              display: '-webkit-box', WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {item.description || item.desc}
            </div>
          )}

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
              {item.tags.map(tag => {
                const tc = MENU_TAG_COLORS[tag] || { color: '#64748b', border: '#e2e8f0' }
                return (
                  <span key={tag} style={{
                    padding: '3px 9px', borderRadius: '20px',
                    border: `1.5px solid ${tc.border}`,
                    color: tc.color,
                    fontSize: '10px', fontWeight: 700,
                    background: 'transparent', letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}>
                    {tag}
                  </span>
                )
              })}
            </div>
          )}

          {/* Spacer pushes price row to bottom */}
          <div style={{ flex: 1 }} />

          {/* Price + ADD TO CART */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#E8321A' }}>
                  ₹{(item.price || 0).toLocaleString('en-IN')}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.priceOld, textDecoration: 'line-through' }}>
                  ₹{oldPrice.toLocaleString('en-IN')}
                </span>
              </div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: theme.offerColor, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                Best offer applied
              </div>
            </div>
            <button
              className="view-cart-btn"
              onClick={e => { e.stopPropagation(); onAddToCart && onAddToCart(item, e) }}
              style={{
                padding: '9px 12px', borderRadius: '10px',
                background: cartQty > 0 ? 'rgba(232,50,26,0.10)' : 'transparent',
                border: `1.5px solid #E8321A`,
                color: '#E8321A',
                fontSize: '11px', fontWeight: 800,
                cursor: 'pointer', whiteSpace: 'nowrap',
                letterSpacing: '0.05em', flexShrink: 0,
              }}
            >
              {cartQty > 0 ? `In cart (${cartQty})` : 'ADD TO CART'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Default vertical card (column: image on top, content below) ─────────
  return (
    <div
      className="menu-card"
      onClick={onPress}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: theme.cardBg,
        border: `1.5px solid ${theme.cardBorder}`,
        borderRadius: '18px',
        overflow: 'hidden',
        marginBottom: '14px',
        boxShadow: theme.cardShadow,
        cursor: 'pointer',
      }}
    >
      {/* Top — full-width image */}
      <div style={{ position: 'relative', width: '100%', height: '200px', flexShrink: 0, overflow: 'hidden' }}>
        <img
          src={item.img || fallbackImg}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.35s ease' }}
          onError={e => { e.target.src = fallbackImg }}
          loading="lazy"
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        />
        {/* Veg/Non-veg dot overlay */}
        <div style={{
          position: 'absolute', top: '10px', left: '10px',
          width: '20px', height: '20px', borderRadius: '4px',
          border: `2px solid ${item.veg !== false ? '#16a34a' : '#dc2626'}`,
          background: theme.cardBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '9px', height: '9px', borderRadius: '50%',
            background: item.veg !== false ? '#16a34a' : '#dc2626',
          }} />
        </div>
        {/* Heart button overlay — top right */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onLike && onLike() }}
          style={{
            position: 'absolute', top: '8px', right: '8px',
            width: '30px', height: '30px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            border: liked ? '1.5px solid #E8321A' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 0,
            transition: 'all 0.2s ease',
          }}
        >
          <Heart size={14} fill={liked ? '#E8321A' : 'none'} color={liked ? '#E8321A' : '#fff'} />
        </button>
      </div>

      {/* Bottom — content */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 14px 14px', flex: 1 }}>

        {/* Item name */}
        <div style={{
          fontSize: '15px', fontWeight: 800, color: theme.itemName,
          lineHeight: 1.3, marginBottom: '6px', wordBreak: 'break-word',
        }}>
          {item.name}
        </div>

        {/* Description */}
        {(item.description || item.desc) && (
          <div style={{
            fontSize: '11px', color: '#94A3B8', lineHeight: 1.6, marginBottom: '8px',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.description || item.desc}
          </div>
        )}

        {/* Tags */}
        {item.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
            {item.tags.map(tag => {
              const tc = MENU_TAG_COLORS[tag] || { color: '#64748b', border: '#e2e8f0' }
              return (
                <span key={tag} style={{
                  padding: '3px 9px', borderRadius: '20px',
                  border: `1.5px solid ${tc.border}`,
                  color: tc.color,
                  fontSize: '10px', fontWeight: 700,
                  background: 'transparent', letterSpacing: '0.03em',
                  whiteSpace: 'nowrap',
                }}>
                  {tag}
                </span>
              )
            })}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Price row + ADD TO CART */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#E8321A' }}>
                ₹{(item.price || 0).toLocaleString('en-IN')}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: theme.priceOld, textDecoration: 'line-through' }}>
                ₹{oldPrice.toLocaleString('en-IN')}
              </span>
            </div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: theme.offerColor, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Best offer applied
            </div>
          </div>
          <button
            className="view-cart-btn"
            onClick={e => { e.stopPropagation(); onAddToCart && onAddToCart(item, e) }}
            style={{
              padding: '9px 14px', borderRadius: '10px',
              background: cartQty > 0 ? 'rgba(232,50,26,0.10)' : 'transparent',
              border: `1.5px solid #E8321A`,
              color: '#E8321A',
              fontSize: '11px', fontWeight: 800,
              cursor: 'pointer', whiteSpace: 'nowrap',
              letterSpacing: '0.05em', flexShrink: 0,
            }}
          >
            {cartQty > 0 ? `In cart (${cartQty})` : 'ADD TO CART'}
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
