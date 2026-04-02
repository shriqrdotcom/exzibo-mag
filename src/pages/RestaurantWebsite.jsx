import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Star, MapPin, Bell, ShoppingCart, Home,
  UtensilsCrossed, ClipboardList, CalendarDays,
  Heart, Moon, Sun, ChevronRight
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

const TABS = [
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
    tabInactiveBg: dark ? 'rgba(255,255,255,0.06)' : '#f0f0f0',
    tabInactiveColor: dark ? '#888' : '#888',
    itemName: dark ? '#f0f0f0' : '#111',
    priceNew: dark ? '#f0f0f0' : '#111',
    priceOld: dark ? '#555' : '#aaa',
    offerColor: dark ? '#4ade80' : '#1a7a4a',
    viewCartBg: dark ? 'transparent' : 'transparent',
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
    ratingBg: dark ? 'rgba(255,184,0,0.12)' : 'rgba(255,184,0,0.12)',
    ratingBorder: dark ? 'rgba(255,184,0,0.25)' : 'rgba(255,184,0,0.3)',
    bellBg: dark ? 'rgba(255,255,255,0.07)' : '#f0f0f0',
    bellBorder: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    bellColor: dark ? '#888' : '#888',
    cartDot: '#E8321A',
    imgOverlay: dark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.04)',
  }
}

export default function RestaurantWebsite() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [menuData, setMenuData] = useState({ starters: [], mains: [], drinks: [] })
  const [activeTab, setActiveTab] = useState('starters')
  const [darkMode, setDarkMode] = useState(false)
  const [activeNav, setActiveNav] = useState('menu')
  const [cartCount] = useState(2)

  const theme = buildTheme(darkMode)

  useEffect(() => {
    if (slug === 'demo') {
      setRestaurant({
        id: 'demo', slug: 'demo',
        name: 'La Maison Noire',
        location: 'Cyber City, Gurugram',
        rating: '4.9',
        phone: '+91 98765 43210',
        tables: '24',
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

  function injectOldPrice(item) {
    return { ...item, oldPrice: item.oldPrice || Math.round(item.price * 1.5) }
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: '#f2f2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0', fontFamily: "'Inter', sans-serif", padding: '24px' }}>
        <div style={{ fontSize: '80px', fontWeight: 900, color: 'rgba(0,0,0,0.06)', lineHeight: 1 }}>404</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: '#111', marginTop: '-8px', marginBottom: '8px' }}>Restaurant not found</div>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '32px', textAlign: 'center', maxWidth: '280px', lineHeight: 1.6 }}>
          No restaurant matches this URL.
        </div>
        <a href="/restaurant/demo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E8321A', borderRadius: '12px', padding: '14px 28px', color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
          View Demo Restaurant
        </a>
        <a href="/" style={{ textAlign: 'center', fontSize: '12px', color: '#aaa', textDecoration: 'none', paddingTop: '12px', fontWeight: 600 }}>← Back to Home</a>
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

  const activeItems = menuData[activeTab] || []

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
        .menu-card { animation: fadeUp 0.35s ease both; }
        .menu-card:nth-child(1) { animation-delay: 0ms; }
        .menu-card:nth-child(2) { animation-delay: 60ms; }
        .menu-card:nth-child(3) { animation-delay: 120ms; }
        .menu-card:nth-child(4) { animation-delay: 180ms; }
        .menu-card:nth-child(5) { animation-delay: 240ms; }
        .view-cart-btn { transition: background 0.2s ease, transform 0.15s ease; }
        .view-cart-btn:hover { background: rgba(46,204,113,0.08) !important; }
        .view-cart-btn:active { transform: scale(0.96); }
        .tab-pill { transition: background 0.2s ease, color 0.2s ease; }
        .toggle-btn { transition: background 0.2s ease, transform 0.15s ease; }
        .toggle-btn:active { transform: scale(0.9); }
      `}</style>

      {/* ── ADMIN BACK BAR ── */}
      {slug !== 'demo' && (
        <div style={{
          background: 'rgba(232,50,26,0.07)', borderBottom: '1px solid rgba(232,50,26,0.15)',
          padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
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
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${theme.headerBorder}`,
        padding: '12px 18px',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: location + name */}
          <div>
            <div style={{ fontSize: '10px', color: theme.locationColor, fontWeight: 500, letterSpacing: '0.04em', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <MapPin size={9} color="#E8321A" />
              {restaurant.location || 'Fine Dining'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: theme.color, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {restaurant.name}
            </div>
          </div>

          {/* Right: rating + toggle + bell */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {restaurant.rating && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: theme.ratingBg, border: `1px solid ${theme.ratingBorder}`,
                borderRadius: '20px', padding: '4px 10px',
              }}>
                <Star size={11} fill="#FFB800" color="#FFB800" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFB800' }}>{restaurant.rating}</span>
              </div>
            )}

            {/* Theme toggle */}
            <button
              className="toggle-btn"
              onClick={() => setDarkMode(d => !d)}
              title={darkMode ? 'Light mode' : 'Dark mode'}
              style={{
                width: '34px', height: '34px', borderRadius: '10px',
                background: theme.toggleBg, border: `1px solid ${theme.toggleBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {darkMode ? <Sun size={15} color="#FFB800" /> : <Moon size={15} color="#888" />}
            </button>

            {/* Bell */}
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: theme.bellBg, border: `1px solid ${theme.bellBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Bell size={15} color={theme.bellColor} />
            </div>
          </div>
        </div>
      </header>

      {/* ── CATEGORY TABS ── */}
      <div style={{
        position: 'sticky', top: '64px', zIndex: 40,
        padding: '12px 16px',
        background: theme.pageBg,
        transition: 'background 0.3s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          background: theme.tabBarBg,
          borderRadius: '18px',
          boxShadow: theme.tabBarShadow,
          padding: '6px',
        }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                className="tab-pill"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: '14px',
                  border: 'none',
                  background: active ? '#E8321A' : 'transparent',
                  color: active ? '#fff' : theme.tabInactiveColor,
                  fontSize: '11px', fontWeight: 800,
                  cursor: 'pointer', letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  boxShadow: active ? '0 4px 14px rgba(232,50,26,0.35)' : 'none',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── MENU CARDS ── */}
      <div style={{ padding: '16px 16px 8px' }}>
        {activeItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: theme.tabInactiveColor, fontSize: '13px' }}>
            No items in this category yet
          </div>
        )}
        {activeItems.map((item, i) => (
          <MenuCard key={`${activeTab}-${i}`} item={item} theme={theme} />
        ))}
      </div>

      {/* ── BOTTOM BANNER ── */}
      <div style={{ padding: '24px 20px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          fontSize: '52px', fontWeight: 900, lineHeight: 1.1,
          color: theme.bannerText,
          letterSpacing: '-0.02em',
          userSelect: 'none',
        }}>
          Explore the menus, taste the city
        </div>
        <div style={{
          position: 'absolute', right: '28px', top: '28px',
          opacity: 0.75,
        }}>
          <Heart size={36} fill={theme.bannerHeart} color={theme.bannerHeart} />
        </div>
      </div>

      {/* Brand line */}
      <div style={{ padding: '0 20px 24px', fontSize: '11px', fontWeight: 700, color: theme.brandText, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Exzibo
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px', zIndex: 100,
        background: theme.navBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${theme.navBorder}`,
        padding: '10px 8px env(safe-area-inset-bottom, 10px)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}>
        {[
          { id: 'home', icon: <Home size={22} />, label: 'Home', action: () => navigate('/') },
          { id: 'menu', icon: <UtensilsCrossed size={22} />, label: 'Menu', action: null },
          {
            id: 'cart', label: 'Cart', action: null,
            icon: (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <ShoppingCart size={22} />
                {cartCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '-5px', right: '-6px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    background: '#E8321A', color: '#fff',
                    fontSize: '8px', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{cartCount}</span>
                )}
              </div>
            ),
          },
          { id: 'orders', icon: <ClipboardList size={22} />, label: 'Order', action: null },
          { id: 'booking', icon: <CalendarDays size={22} />, label: 'Book', action: null },
        ].map(({ id, icon, label, action }) => (
          <button
            key={id}
            onClick={() => { setActiveNav(id); action && action() }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeNav === id ? '#E8321A' : theme.navInactive,
              padding: '4px 12px',
              transition: 'color 0.2s ease',
            }}
          >
            {icon}
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function MenuCard({ item, theme }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const oldPrice = item.oldPrice || Math.round((item.price || 0) * 1.5)

  return (
    <div className="menu-card" style={{
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '18px',
      overflow: 'hidden',
      marginBottom: '14px',
      boxShadow: theme.cardShadow,
    }}>
      {/* Food image */}
      <div style={{ position: 'relative', width: '100%', height: '200px', overflow: 'hidden' }}>
        <img
          src={item.img || fallbackImg}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.src = fallbackImg }}
          loading="lazy"
        />
        <div style={{ position: 'absolute', inset: 0, background: theme.imgOverlay }} />
      </div>

      {/* Card body */}
      <div style={{ padding: '14px 16px 16px' }}>
        {/* Veg / Non-veg indicator + Name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
          <div style={{
            flexShrink: 0, marginTop: '3px',
            width: '14px', height: '14px', borderRadius: '3px',
            border: `1.5px solid ${item.veg !== false ? theme.vegDot : theme.nonVegDot}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: item.veg !== false ? theme.vegDot : theme.nonVegDot,
            }} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: theme.itemName, lineHeight: 1.35 }}>
            1 x {item.name}
          </div>
        </div>

        {/* Price row + View cart button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: theme.priceNew }}>
                ₹{(item.price || 0).toLocaleString('en-IN')}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: theme.priceOld, textDecoration: 'line-through' }}>
                ₹{(oldPrice).toLocaleString('en-IN')}
              </span>
            </div>
            {/* Offer text */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: theme.offerColor }}>
              Best offer applied
            </div>
          </div>

          {/* View cart button */}
          <button
            className="view-cart-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '9px 16px', borderRadius: '10px',
              background: theme.viewCartBg,
              border: `1.5px solid ${theme.viewCartBorder}`,
              color: theme.viewCartColor,
              fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            View cart <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
