import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Star, MapPin, Bell, ShoppingCart, Home,
  UtensilsCrossed, ClipboardList, CalendarDays,
  Heart, Moon, Sun, ChevronRight, ChevronLeft,
  Phone, Flame, Award, Clock, Users, AtSign,
  Share2, MessageCircle, Globe, Leaf, ExternalLink,
  Trash2, Minus, Plus, Tag, CheckCircle, ShoppingBag,
  Copy, PhoneCall, ArrowLeft
} from 'lucide-react'

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

function buildTheme(dark) {
  return {
    pageBg: dark ? '#0f0f0f' : '#f2f2f2',
    headerBg: dark ? 'rgba(15,15,15,0.95)' : 'rgba(255,255,255,0.97)',
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
    navBg: dark ? 'rgba(15,15,15,0.97)' : '#fff',
    navBorder: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    navInactive: dark ? '#444' : '#bbb',
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

function injectOldPrice(item) {
  return { ...item, oldPrice: item.oldPrice || Math.round(item.price * 1.5) }
}

export default function RestaurantWebsite() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [menuData, setMenuData] = useState({ starters: [], mains: [], drinks: [] })
  const [activeNav, setActiveNav] = useState('home')
  const [activeMenuTab, setActiveMenuTab] = useState('starters')
  const [darkMode, setDarkMode] = useState(false)
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [liked, setLiked] = useState({})
  const [cartItems, setCartItems] = useState([
    { id: 1, name: 'Hara Bhara Kebab', price: 249, qty: 1, img: '/menu/heirloom-burrata.png' },
    { id: 2, name: 'Dahi Puri', price: 179, qty: 1, img: '/menu/mushroom-risotto.png' },
  ])
  const [couponInput, setCouponInput] = useState('')
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [currentOrder, setCurrentOrder] = useState(null)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [orderNotes, setOrderNotes] = useState('')
  const [orderStatus, setOrderStatus] = useState(1)
  const [orderHistory, setOrderHistory] = useState([
    {
      id: '847291038',
      items: [
        { id: 1, name: 'Truffle Beef Carpaccio', price: 2100, qty: 1, img: '/menu/truffle-beef-carpaccio.png' },
        { id: 2, name: 'Atlantic Oysters', price: 2800, qty: 1, img: '/menu/atlantic-oysters.png' },
      ],
      subtotal: 4900, gstAmt: 245, deliveryFee: 0, discountAmt: 0, grandTotal: 5145,
      itemCount: 2, date: '28/03/2026', couponApplied: false, status: 'DELIVERED',
    },
    {
      id: '563841927',
      items: [
        { id: 3, name: 'A5 Wagyu Ribeye', price: 15500, qty: 1, img: '/menu/wagyu-ribeye.png' },
      ],
      subtotal: 15500, gstAmt: 775, deliveryFee: 0, discountAmt: 0, grandTotal: 16275,
      itemCount: 1, date: '22/03/2026', couponApplied: false, status: 'DELIVERED',
    },
    {
      id: '291047583',
      items: [
        { id: 5, name: 'Forest Mushroom Risotto', price: 3500, qty: 1, img: '/menu/mushroom-risotto.png' },
        { id: 6, name: 'Noir Negroni', price: 1850, qty: 1, img: '/menu/noir-negroni.png' },
      ],
      subtotal: 5350, gstAmt: 268, deliveryFee: 0, discountAmt: 0, grandTotal: 5618,
      itemCount: 2, date: '15/03/2026', couponApplied: false, status: 'DELIVERED',
    },
  ])
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState(null)
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
  function addToCart(item) {
    setCartItems(prev => {
      const existing = prev.find(c => c.name === item.name)
      if (existing) return prev.map(c => c.name === item.name ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { id: Date.now(), name: item.name, price: item.price, qty: 1, img: item.img || '/menu/wagyu-ribeye.png' }]
    })
  }

  function handlePlaceOrder() {
    if (cartItems.length === 0) return
    if (currentOrder) {
      setOrderHistory(prev => [{ ...currentOrder, status: orderStatus >= 2 ? 'DELIVERED' : 'CONFIRMED' }, ...prev])
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
      status: 'CONFIRMED',
    }
    setCurrentOrder(order)
    setOrderStatus(1)
    setOrderNotes('')
    setViewingHistoryOrder(null)
    setShowSuccessPopup(true)
    setCartItems([])
    setCouponApplied(false)
    setCouponInput('')
    setTimeout(() => {
      setShowSuccessPopup(false)
      setActiveNav('orders')
    }, 2500)
    setTimeout(() => setOrderStatus(2), 8000)
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
      setMenuData(MENU_FALLBACK)
      return
    }
    const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = restaurants.find(r => r.slug === slug || r.id === slug)
    if (found) {
      setRestaurant(found)
      const saved = localStorage.getItem(`exzibo_menu_${found.id}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        setMenuData({
          starters: parsed.starters?.length ? parsed.starters.map(injectOldPrice) : MENU_FALLBACK.starters,
          mains: parsed.mains?.length ? parsed.mains.map(injectOldPrice) : MENU_FALLBACK.mains,
          drinks: parsed.drinks?.length ? parsed.drinks.map(injectOldPrice) : MENU_FALLBACK.drinks,
        })
      } else {
        setMenuData(MENU_FALLBACK)
      }
    } else {
      setNotFound(true)
    }
  }, [slug])

  useEffect(() => {
    const images = restaurant?.images?.length ? restaurant.images : FALLBACK_IMAGES
    if (images.length <= 1) return
    const interval = setInterval(() => setCarouselIdx(i => (i + 1) % images.length), 4000)
    return () => clearInterval(interval)
  }, [restaurant])

  const carouselImages = restaurant?.images?.length ? restaurant.images : FALLBACK_IMAGES
  const allItems = [...menuData.starters, ...menuData.mains, ...menuData.drinks]
  const tagged = allItems.filter(m => m.tags?.some(t => ['Popular', 'Seasonal', "Chef's Pick"].includes(t)))
  const bestsellers = (tagged.length > 0 ? tagged : allItems).slice(0, 6)
  const activeMenuItems = menuData[activeMenuTab] || []

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
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(232,50,26,0.2)', borderTopColor: '#E8321A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ color: '#aaa', fontSize: '13px' }}>Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
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
      `}</style>

      {/* ── ADMIN BACK BAR ── */}
      {slug !== 'demo' && (
        <div style={{ background: theme.adminBg, borderBottom: `1px solid ${theme.adminBorder}`, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate('/restaurants')} style={{ background: 'none', border: 'none', color: '#E8321A', fontSize: '11px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em' }}>
            ← MY RESTAURANTS
          </button>
          <span style={{ fontSize: '10px', color: '#aaa', letterSpacing: '0.04em' }}>ADMIN PREVIEW</span>
        </div>
      )}

      {/* ── STICKY HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: theme.headerBg,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${theme.headerBorder}`,
        padding: '12px 18px',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', color: theme.locationColor, fontWeight: 500, letterSpacing: '0.04em', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <MapPin size={9} color="#E8321A" />
              {restaurant.location || 'Fine Dining'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: theme.color, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {restaurant.name}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {restaurant.rating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: theme.ratingBg, border: `1px solid ${theme.ratingBorder}`, borderRadius: '20px', padding: '4px 10px' }}>
                <Star size={11} fill="#FFB800" color="#FFB800" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFB800' }}>{restaurant.rating}</span>
              </div>
            )}
            <button className="toggle-btn" onClick={() => setDarkMode(d => !d)} title={darkMode ? 'Light mode' : 'Dark mode'} style={{ width: '34px', height: '34px', borderRadius: '10px', background: theme.toggleBg, border: `1px solid ${theme.toggleBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {darkMode ? <Sun size={15} color="#FFB800" /> : <Moon size={15} color="#888" />}
            </button>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: theme.bellBg, border: `1px solid ${theme.bellBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Bell size={15} color={theme.bellColor} />
            </div>
          </div>
        </div>
      </header>

      {/* ── HOME VIEW ── */}
      {activeNav === 'home' && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>

          {/* Hero Carousel */}
          <section style={{ position: 'relative', height: '240px', overflow: 'hidden', margin: '14px 14px 0' }}>
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
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: '5px', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
                  An Unforgettable<br />Culinary Experience
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
                  {(restaurant.description || '').slice(0, 60)}{(restaurant.description?.length || 0) > 60 ? '…' : ''}
                </div>
              </div>
              {carouselImages.length > 1 && (
                <>
                  <button onClick={() => setCarouselIdx(i => (i - 1 + carouselImages.length) % carouselImages.length)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}>
                    <ChevronLeft size={15} />
                  </button>
                  <button onClick={() => setCarouselIdx(i => (i + 1) % carouselImages.length)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}>
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

          {/* Action Buttons */}
          <section style={{ padding: '14px 14px 0', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setActiveNav('menu')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#E8321A', border: 'none', borderRadius: '14px', padding: '14px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(232,50,26,0.4)' }}
            >
              <UtensilsCrossed size={16} /> View Menu
            </button>
            {restaurant.phone ? (
              <a href={`tel:${restaurant.phone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: theme.btnSecBg, border: `1px solid ${theme.btnSecBorder}`, borderRadius: '14px', padding: '14px', color: theme.btnSecColor, fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                <Phone size={16} /> Call Staff
              </a>
            ) : (
              <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: theme.btnSecBg, border: `1px solid ${theme.btnSecBorder}`, borderRadius: '14px', padding: '14px', color: theme.btnSecColor, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                <Users size={16} /> About Us
              </button>
            )}
          </section>

          {/* Quick Stats */}
          <section style={{ padding: '14px 14px 0' }}>
            <div style={{ display: 'flex', background: theme.statsBg, border: `1px solid ${theme.statsBorder}`, borderRadius: '16px', padding: '14px 16px', boxShadow: theme.cardShadow }}>
              {[
                { icon: <Award size={16} color="#FFB800" />, label: restaurant.rating ? `${restaurant.rating} Rating` : 'Top Rated', sub: 'Google Reviews' },
                { icon: <Clock size={16} color="#60a5fa" />, label: '12pm – 11pm', sub: 'Open Today' },
                { icon: <UtensilsCrossed size={16} color="#4ade80" />, label: restaurant.tables ? `${restaurant.tables} Tables` : 'Fine Dining', sub: 'Capacity' },
              ].map((stat, i) => (
                <React.Fragment key={i}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    {stat.icon}
                    <div style={{ fontSize: '11px', fontWeight: 700, color: theme.statsValue, textAlign: 'center', lineHeight: 1.2 }}>{stat.label}</div>
                    <div style={{ fontSize: '9px', color: theme.statsLabel, textAlign: 'center' }}>{stat.sub}</div>
                  </div>
                  {i < 2 && <div style={{ width: '1px', background: theme.statsDivider }} />}
                </React.Fragment>
              ))}
            </div>
          </section>

          {/* Best Sellers */}
          <section style={{ padding: '20px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px 12px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: theme.sectionTitle, letterSpacing: '-0.01em' }}>Best Sellers</div>
                <div style={{ fontSize: '11px', color: theme.sectionSub, marginTop: '2px' }}>Crowd favourites, every time</div>
              </div>
              <button onClick={() => setActiveNav('menu')} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', color: '#E8321A', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                View all <ChevronRight size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '0 18px 4px', scrollbarWidth: 'none' }}>
              {bestsellers.map((item, i) => (
                <BestsellerCard key={i} item={item} liked={liked[i]} onLike={() => setLiked(l => ({ ...l, [i]: !l[i] }))} theme={theme} />
              ))}
            </div>
          </section>

          {/* ── OUR STORY ── */}
          <section style={{ padding: '24px 14px 0' }}>
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
            <div style={{ background: theme.aboutCardBg, border: `1px solid ${theme.aboutCardBorder}`, borderRadius: '16px', padding: '18px', marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#E8321A', textTransform: 'uppercase', marginBottom: '10px' }}>The Philosophy</div>
              <p style={{ fontSize: '14px', lineHeight: 1.75, color: theme.aboutText }}>
                {restaurant.description || 'An uncompromising culinary experience rooted in craft, quality, and atmosphere. Every dish is a conversation between heritage and innovation, served in a setting that commands reverence.'}
              </p>
              {restaurant.additionalInfo && (
                <p style={{ fontSize: '12px', lineHeight: 1.7, color: theme.aboutSub, marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.aboutSubBorder}` }}>
                  {restaurant.additionalInfo}
                </p>
              )}
            </div>

            {/* Quick Info */}
            <div style={{ background: theme.statsBg, border: `1px solid ${theme.statsBorder}`, borderRadius: '16px', padding: '18px', marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', color: theme.infoLabel, textTransform: 'uppercase', marginBottom: '14px' }}>Quick Info</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {restaurant.location && (
                  <InfoRow icon={<MapPin size={14} color="#E8321A" />} label="Location" value={restaurant.location} theme={theme} />
                )}
                {restaurant.tables && (
                  <InfoRow icon={<UtensilsCrossed size={14} color="#4ade80" />} label="Capacity" value={`${restaurant.tables} Tables`} theme={theme} />
                )}
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
            {(restaurant.socialLinks?.instagram || restaurant.socialLinks?.facebook || restaurant.socialLinks?.twitter || restaurant.socialLinks?.website) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '18px' }}>
                {restaurant.socialLinks?.instagram && <SocialBtn href={restaurant.socialLinks.instagram} icon={<AtSign size={17} />} theme={theme} />}
                {restaurant.socialLinks?.facebook && <SocialBtn href={restaurant.socialLinks.facebook} icon={<Share2 size={17} />} theme={theme} />}
                {restaurant.socialLinks?.twitter && <SocialBtn href={restaurant.socialLinks.twitter} icon={<MessageCircle size={17} />} theme={theme} />}
                {restaurant.socialLinks?.website && <SocialBtn href={restaurant.socialLinks.website} icon={<Globe size={17} />} theme={theme} />}
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
        <div style={{ animation: 'fadeIn 0.3s ease' }}>

          {/* Category Tabs */}
          <div style={{ position: 'sticky', top: '64px', zIndex: 40, padding: '12px 14px', background: theme.pageBg, transition: 'background 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: theme.tabBarBg, borderRadius: '18px', boxShadow: theme.tabBarShadow, padding: '6px' }}>
              {MENU_TABS.map(tab => {
                const active = activeMenuTab === tab.id
                return (
                  <button key={tab.id} className="tab-pill" onClick={() => setActiveMenuTab(tab.id)} style={{ flex: 1, padding: '10px 8px', borderRadius: '14px', border: 'none', background: active ? '#E8321A' : 'transparent', color: active ? '#fff' : theme.tabInactiveColor, fontSize: '11px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.05em', whiteSpace: 'nowrap', textAlign: 'center', boxShadow: active ? '0 4px 14px rgba(232,50,26,0.35)' : 'none' }}>
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

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

      {/* ── FLOATING VIEW CART (menu view) ── */}
      {activeNav === 'menu' && cartCount > 0 && (
        <div style={{
          position: 'fixed', bottom: '78px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 80, pointerEvents: 'none', width: '100%', maxWidth: '480px', padding: '0 14px',
        }}>
          <button
            onClick={() => setActiveNav('cart')}
            style={{
              pointerEvents: 'all', width: '100%', background: '#111', color: '#fff', border: 'none',
              borderRadius: '16px', padding: '14px 20px', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
            }}
          >
            <span style={{ background: '#E8321A', borderRadius: '7px', padding: '3px 9px', fontSize: '12px', fontWeight: 800 }}>{cartCount}</span>
            <span>View Cart</span>
            <span style={{ color: '#E8321A', fontWeight: 800 }}>₹{subtotal.toLocaleString('en-IN')}</span>
          </button>
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
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: darkMode ? 'rgba(255,255,255,0.05)' : '#f0ece8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  onClick={handlePlaceOrder}
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
                {deliveryFee === 0 && subtotal > 0 && (
                  <div style={{ textAlign: 'center', fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', paddingBottom: '4px' }}>
                    <CheckCircle size={11} /> Free delivery applied on this order
                  </div>
                )}
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
                <button onClick={() => setViewingHistoryOrder(null)} style={{ width: '36px', height: '36px', borderRadius: '50%', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.10)', flexShrink: 0 }}>
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
                        <img src={item.img} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }} />
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
                  <div style={{ flexShrink: 0, background: '#22c55e', color: '#fff', borderRadius: '10px', padding: '8px 14px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', fontFamily: 'inherit' }}>
                    DELIVERED
                  </div>
                </div>
                {/* Full tracker (all done) */}
                <div>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ position: 'absolute', top: '14px', left: '14px', right: '14px', height: '3px', background: '#E8321A', borderRadius: '2px', zIndex: 0 }} />
                    {['PLACED', 'CONFIRM', 'DELIVERED'].map((label, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 1, flex: 1 }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#E8321A', border: '2px solid #E8321A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px rgba(232,50,26,0.15)' }}>
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
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: darkMode ? 'rgba(255,255,255,0.05)' : '#f0ece8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                <button onClick={() => setActiveNav('home')} style={{ width: '36px', height: '36px', borderRadius: '50%', background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.10)', flexShrink: 0 }}>
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
                        <img src={item.img} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }} />
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
                  const steps = [
                    { label: 'PLACED', done: true },
                    { label: 'CONFIRM', done: orderStatus >= 1 },
                    { label: 'DELIVERED', done: orderStatus >= 2 },
                  ]
                  return (
                    <div>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        {/* Progress track */}
                        <div style={{ position: 'absolute', top: '14px', left: '14px', right: '14px', height: '3px', background: darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)', borderRadius: '2px', zIndex: 0 }}>
                          <div style={{ height: '100%', borderRadius: '2px', background: '#E8321A', width: orderStatus === 0 ? '0%' : orderStatus === 1 ? '50%' : '100%', transition: 'width 0.8s ease' }} />
                        </div>
                        {steps.map((step, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 1, flex: 1 }}>
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: step.done ? '#E8321A' : (darkMode ? 'rgba(255,255,255,0.10)' : '#e5e0db'),
                              border: `2px solid ${step.done ? '#E8321A' : (darkMode ? 'rgba(255,255,255,0.15)' : '#ddd')}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: step.done ? '0 0 0 4px rgba(232,50,26,0.15)' : 'none',
                              animation: step.done ? 'statusBounce 0.5s ease' : 'none',
                              transition: 'all 0.4s ease',
                            }}>
                              {step.done
                                ? <CheckCircle size={14} color="#fff" strokeWidth={2.5} />
                                : <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: darkMode ? 'rgba(255,255,255,0.25)' : '#ccc' }} />
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
                  { label: 'STATUS', value: orderStatus >= 2 ? 'DELIVERED' : 'CONFIRMED', highlight: true },
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
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: darkMode ? 'rgba(255,255,255,0.07)' : '#f5f1ee', border: `1px solid ${theme.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={16} color={theme.locationColor} />
                  </div>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
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
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
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
        <div style={{ animation: 'fadeIn 0.3s ease', padding: '22px 18px' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: theme.color, marginBottom: '20px', letterSpacing: '-0.01em' }}>Reserve a Table</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: '12px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: darkMode ? 'rgba(255,255,255,0.05)' : '#f0ece8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={28} color={darkMode ? '#555' : '#ccc'} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: theme.color }}>Coming soon</div>
            <div style={{ fontSize: '13px', color: theme.locationColor, textAlign: 'center', lineHeight: 1.6 }}>Online table reservations will be available soon</div>
            {restaurant.phone && (
              <a href={`tel:${restaurant.phone}`} style={{ marginTop: '8px', background: '#E8321A', color: '#fff', borderRadius: '14px', padding: '12px 28px', fontSize: '13px', fontWeight: 700, textDecoration: 'none', boxShadow: '0 6px 20px rgba(232,50,26,0.35)' }}>
                Call to Reserve
              </a>
            )}
          </div>
        </div>
      )}


      {/* ── SUCCESS POPUP OVERLAY ── */}
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
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px', zIndex: 100,
        background: theme.navBg,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${theme.navBorder}`,
        padding: '10px 8px env(safe-area-inset-bottom, 10px)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}>
        {[
          { id: 'home', icon: <Home size={22} />, label: 'Home' },
          { id: 'menu', icon: <UtensilsCrossed size={22} />, label: 'Menu' },
          {
            id: 'cart', label: 'Cart',
            icon: (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <ShoppingCart size={22} />
                {cartCount > 0 && (
                  <span style={{ position: 'absolute', top: '-5px', right: '-6px', width: '14px', height: '14px', borderRadius: '50%', background: '#E8321A', color: '#fff', fontSize: '8px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>
                )}
              </div>
            ),
          },
          { id: 'orders', icon: <ClipboardList size={22} />, label: 'Order' },
          { id: 'booking', icon: <CalendarDays size={22} />, label: 'Book' },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveNav(id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', border: 'none', cursor: 'pointer', color: activeNav === id ? '#E8321A' : theme.navInactive, padding: '6px 14px', borderRadius: '12px', background: activeNav === id ? (darkMode ? 'rgba(232,50,26,0.14)' : 'rgba(0,0,0,0.07)') : 'none', transition: 'color 0.2s ease, background 0.2s ease' }}
          >
            {icon}
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function BestsellerCard({ item, liked, onLike, theme }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const tagColors = { Popular: '#E8321A', Seasonal: '#fbbf24', Vegetarian: '#4ade80', "Chef's Pick": '#a78bfa' }
  return (
    <div className="food-card" style={{ flexShrink: 0, width: '155px', background: theme.bestsellerBg, border: `1px solid ${theme.bestsellerBorder}`, borderRadius: '16px', overflow: 'hidden', cursor: 'pointer', boxShadow: theme.cardShadow }}>
      <div style={{ height: '115px', overflow: 'hidden', position: 'relative' }}>
        <img src={item.img || fallbackImg} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.src = fallbackImg }} />
        <button onClick={e => { e.stopPropagation(); onLike() }} style={{ position: 'absolute', top: '7px', right: '7px', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Heart size={12} fill={liked ? '#E8321A' : 'transparent'} color={liked ? '#E8321A' : '#aaa'} />
        </button>
        {(item.tag || item.tags?.[0]) && (
          <div style={{ position: 'absolute', bottom: '7px', left: '7px', background: tagColors[item.tag || item.tags?.[0]] ? `${tagColors[item.tag || item.tags[0]]}dd` : 'rgba(232,50,26,0.88)', backdropFilter: 'blur(6px)', borderRadius: '6px', padding: '2px 7px', fontSize: '9px', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
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

function MenuCard({ item, theme, onAddToCart, cartQty }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const oldPrice = item.oldPrice || Math.round((item.price || 0) * 1.5)
  return (
    <div className="menu-card" style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, borderRadius: '18px', marginBottom: '14px', boxShadow: theme.cardShadow, padding: '10px 10px 0' }}>
      <div style={{ position: 'relative', width: '100%', height: '200px', overflow: 'hidden', borderRadius: '12px' }}>
        <img src={item.img || fallbackImg} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.src = fallbackImg }} loading="lazy" />
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
          <div style={{ flexShrink: 0, marginTop: '3px', width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${item.veg !== false ? theme.vegDot : theme.nonVegDot}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: item.veg !== false ? theme.vegDot : theme.nonVegDot }} />
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
            onClick={() => onAddToCart && onAddToCart(item)}
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

function SocialBtn({ href, icon, theme }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ width: '38px', height: '38px', borderRadius: '11px', background: theme.socialBg, border: `1px solid ${theme.socialBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.socialColor, textDecoration: 'none', transition: 'all 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.color = '#E8321A'; e.currentTarget.style.borderColor = 'rgba(232,50,26,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.color = theme.socialColor; e.currentTarget.style.borderColor = theme.socialBorder }}
    >
      {icon}
    </a>
  )
}
