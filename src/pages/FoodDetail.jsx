import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Share2, Heart, ShoppingCart, Plus, Minus,
  ChevronDown, ChevronRight, Search, Star, Bell,
  ShoppingBag, Flame
} from 'lucide-react'

const FALLBACK_IMG = '/menu/wagyu-ribeye.png'

const MENU_FALLBACK = {
  starters: [
    { name: 'Truffle Beef Carpaccio', price: 2100, oldPrice: 3150, img: '/menu/truffle-beef-carpaccio.png', description: 'Thin-sliced wagyu with black truffle and aged parmesan', tags: ['Popular'], veg: false, rating: 4.8, ratingCount: 811, weight: '200g', ingredients: 'Wagyu beef, black truffle, aged parmesan, arugula, olive oil', spice: 'Mild' },
    { name: 'Atlantic Oysters', price: 2800, oldPrice: 4200, img: '/menu/atlantic-oysters.png', description: 'Half dozen with mignonette and lemon', tags: ['Seasonal'], veg: false, rating: 4.6, ratingCount: 342, weight: '300g', ingredients: 'Fresh oysters, mignonette sauce, lemon, shallots', spice: 'None' },
    { name: 'Heirloom Burrata', price: 1650, oldPrice: 2475, img: '/menu/heirloom-burrata.png', description: 'Fresh burrata with heirloom tomatoes and basil oil', tags: ['Vegetarian'], veg: true, rating: 4.7, ratingCount: 197, weight: '250g', ingredients: 'Fresh burrata, heirloom tomatoes, basil, extra virgin olive oil', spice: 'None' },
  ],
  mains: [
    { name: 'A5 Wagyu Ribeye', price: 15500, oldPrice: 23250, img: '/menu/wagyu-ribeye.png', description: 'Japanese A5 Wagyu with bone marrow butter', tags: ['Popular'], veg: false, rating: 4.9, ratingCount: 437, weight: '350g', ingredients: 'A5 Wagyu beef, bone marrow, fleur de sel, thyme, garlic butter', spice: 'Mild', outOfStock: false },
    { name: 'Lobster Thermidor', price: 7950, oldPrice: 11925, img: '/menu/lobster-thermidor.png', description: 'Whole Maine lobster in cognac cream sauce', tags: ['Seasonal'], veg: false, rating: 4.7, ratingCount: 194, weight: '500g', ingredients: 'Maine lobster, cognac, cream, gruyère, tarragon, shallots', spice: 'None', outOfStock: false, stock: 3 },
    { name: 'Forest Mushroom Risotto', price: 3500, oldPrice: 5250, img: '/menu/mushroom-risotto.png', description: 'Arborio rice with wild porcini and truffle oil', tags: ['Vegetarian', 'Gluten Free'], veg: true, rating: 4.5, ratingCount: 256, weight: '400g', ingredients: 'Arborio rice, porcini mushrooms, truffle oil, parmesan, white wine, vegetable broth', spice: 'None' },
  ],
  drinks: [
    { name: 'Noir Negroni', price: 1850, oldPrice: 2775, img: '/menu/noir-negroni.png', description: 'Gin, Campari, vermouth with activated charcoal', tags: ['Popular'], veg: true, rating: 4.6, ratingCount: 189, weight: '200ml', ingredients: 'Gin, Campari, sweet vermouth, activated charcoal, orange peel', spice: 'None' },
    { name: 'Smoke & Mirrors', price: 1600, oldPrice: 2400, img: '/menu/noir-negroni.png', description: 'Mezcal, jalapeño, lime, smoked salt rim', tags: [], veg: true, rating: 4.4, ratingCount: 122, weight: '200ml', ingredients: 'Mezcal, fresh jalapeño, lime juice, agave syrup, smoked salt', spice: 'Hot' },
  ],
}

function injectOldPrice(item) {
  return {
    ...item,
    oldPrice: item.oldPrice || Math.round(item.price * 1.5),
    rating: item.rating || 4.3,
    ratingCount: item.ratingCount || Math.floor(Math.random() * 400 + 50),
    weight: item.weight || '200g',
    ingredients: item.ingredients || item.description || '',
    spice: item.spice || 'Medium',
  }
}

function getAllItems(menuData) {
  return [
    ...menuData.starters,
    ...menuData.mains,
    ...menuData.drinks,
  ]
}

function StarRating({ rating, count, color }) {
  const stars = []
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        size={12}
        fill={i <= Math.round(rating) ? color : 'transparent'}
        color={i <= Math.round(rating) ? color : 'rgba(255,255,255,0.25)'}
        strokeWidth={1.5}
      />
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      {stars}
      <span style={{ fontSize: '12px', fontWeight: 700, color, marginLeft: '2px' }}>{rating.toFixed(1)}</span>
      {count && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginLeft: '2px' }}>({count})</span>}
    </div>
  )
}

export default function FoodDetail() {
  const { slug, itemName } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [item, setItem] = useState(location.state?.item ? injectOldPrice(location.state.item) : null)
  const returnTab = location.state?.returnTab || 'menu'
  const [menuData, setMenuData] = useState({ starters: [], mains: [], drinks: [] })
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(!location.state?.item)
  const [liked, setLiked] = useState(false)
  const [qty, setQty] = useState(1)
  const [toast, setToast] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [heartBounce, setHeartBounce] = useState(false)
  const [addBtnScale, setAddBtnScale] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [cartItems, setCartItems] = useState([])
  const [notifyActive, setNotifyActive] = useState(false)
  const [cartBarVisible, setCartBarVisible] = useState(false)
  const [ripple, setRipple] = useState(false)
  const toastTimer = useRef(null)
  const cartBarTimer = useRef(null)

  const themeColor = location.state?.themeColor || restaurant?.primaryColor || '#E8321A'

  useEffect(() => {
    const loadData = () => {
      let menu = MENU_FALLBACK
      let rest = null

      if (slug !== 'demo') {
        const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const found = restaurants.find(r => r.slug === slug || r.id === slug)
        if (found) {
          rest = found
          const saved = localStorage.getItem(`exzibo_menu_${found.id}`)
          if (saved) {
            const parsed = JSON.parse(saved)
            menu = {
              starters: parsed.starters?.length ? parsed.starters.map(injectOldPrice) : MENU_FALLBACK.starters,
              mains: parsed.mains?.length ? parsed.mains.map(injectOldPrice) : MENU_FALLBACK.mains,
              drinks: parsed.drinks?.length ? parsed.drinks.map(injectOldPrice) : MENU_FALLBACK.drinks,
            }
          }
        }
      }

      setMenuData(menu)
      setRestaurant(rest)

      if (!item) {
        const decoded = decodeURIComponent(itemName)
        const allItems = getAllItems(menu)
        const found = allItems.find(i => i.name === decoded)
        if (found) setItem(injectOldPrice(found))
      }

      setTimeout(() => setLoading(false), 500)
    }
    loadData()
  }, [slug, itemName])

  useEffect(() => {
    const cartKey = `exzibo_cart_${slug}`
    const existing = JSON.parse(localStorage.getItem(cartKey) || '[]')
    setCartItems(existing)
    setCartBarVisible(existing.length > 0)
  }, [slug])

  const allMenuItems = getAllItems(menuData)
  const suggestions = allMenuItems.filter(i => i.name !== item?.name).slice(0, 8)

  const isOutOfStock = item?.outOfStock === true
  const stockCount = item?.stock || null
  const isVeg = item?.veg !== false
  const tag = item?.tags?.[0] || null
  const tagColors = {
    Popular: themeColor,
    Seasonal: '#fbbf24',
    Vegetarian: '#4ade80',
    'Gluten Free': '#22c55e',
    "Chef's Pick": '#a78bfa',
  }

  function toggleLike() {
    setLiked(v => !v)
    setHeartBounce(true)
    setTimeout(() => setHeartBounce(false), 400)
  }

  function triggerRipple() {
    setRipple(true)
    setTimeout(() => setRipple(false), 600)
  }

  function handleAddToCart() {
    if (!item || isOutOfStock) return
    triggerRipple()
    const cartKey = `exzibo_cart_${slug}`
    const existing = JSON.parse(localStorage.getItem(cartKey) || '[]')
    const cartItem = {
      id: Date.now(),
      name: item.name,
      price: item.price,
      qty,
      img: item.img || FALLBACK_IMG,
    }
    const idx = existing.findIndex(c => c.name === cartItem.name)
    let updated
    if (idx >= 0) {
      updated = existing.map((c, i) => i === idx ? { ...c, qty: c.qty + qty } : c)
    } else {
      updated = [...existing, cartItem]
    }
    localStorage.setItem(cartKey, JSON.stringify(updated))
    setCartItems(updated)
    setAddBtnScale(true)
    setCartBarVisible(true)
    setTimeout(() => setAddBtnScale(false), 200)
    setToast(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(false), 2500)
  }

  function handleNotifyMe() {
    setNotifyActive(true)
    setTimeout(() => setNotifyActive(false), 2000)
  }

  function handleSuggestionAdd(e, sug) {
    e.stopPropagation()
    const cartKey = `exzibo_cart_${slug}`
    const existing = JSON.parse(localStorage.getItem(cartKey) || '[]')
    const cartItem = { id: Date.now(), name: sug.name, price: sug.price, qty: 1, img: sug.img || FALLBACK_IMG }
    const idx = existing.findIndex(c => c.name === cartItem.name)
    let updated = idx >= 0 ? existing.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c) : [...existing, cartItem]
    localStorage.setItem(cartKey, JSON.stringify(updated))
    setCartItems(updated)
    setCartBarVisible(true)
  }

  function handleSuggestionClick(sug) {
    navigate(`/restaurant/${slug}/food/${encodeURIComponent(sug.name)}`, {
      state: { item: sug, returnTab, themeColor },
      replace: true,
    })
    setItem(injectOldPrice(sug))
    setImgLoaded(false)
    setQty(1)
    setLiked(false)
    setDetailsOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: item?.name, text: item?.description, url: window.location.href }).catch(() => {})
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
    }
  }

  function handleViewCart() {
    navigate(`/restaurant/${slug}`, { state: { activeNav: 'cart' } })
  }

  const cartTotal = cartItems.reduce((s, c) => s + c.price * c.qty, 0)
  const cartCount = cartItems.reduce((s, c) => s + c.qty, 0)
  const cartPreviewImgs = cartItems.slice(0, 3).map(c => c.img)

  const restaurantName = restaurant?.name || (slug === 'demo' ? 'CrimsonLuxe' : slug)
  const restaurantLogo = restaurant?.logo || null

  const spiceColors = { None: '#60a5fa', Mild: '#4ade80', Medium: '#fbbf24', Hot: '#f97316', 'Very Hot': '#ef4444' }
  const spiceColor = spiceColors[item?.spice] || '#fbbf24'

  return (
    <div style={{
      background: '#0F0F0F',
      minHeight: '100vh',
      maxWidth: '480px',
      margin: '0 auto',
      position: 'relative',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      paddingBottom: cartBarVisible ? '110px' : '40px',
      overflowX: 'hidden',
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes zoomIn {
          from { transform: scale(1.1); }
          to   { transform: scale(1); }
        }
        @keyframes heartPop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.55); }
          100% { transform: scale(1); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          0%   { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.92); }
          60%  { opacity: 1; transform: translateX(-50%) translateY(-3px) scale(1.02); }
          100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }
        @keyframes cartBarIn {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rippleAnim {
          0%   { transform: scale(0); opacity: 0.6; }
          100% { transform: scale(4); opacity: 0; }
        }
        @keyframes detailsExpand {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .fd-hero-img { animation: zoomIn 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        .fd-card     { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.05s both; }
        .fd-details  { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.12s both; }
        .fd-brand    { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.18s both; }
        .fd-similar  { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.24s both; }
        .cart-bar    { animation: cartBarIn 0.4s cubic-bezier(0.22,1,0.36,1) both; }

        .glass-btn {
          transition: transform 0.12s ease, background 0.15s ease;
        }
        .glass-btn:active { transform: scale(0.88) !important; }

        .sug-card {
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          cursor: pointer;
        }
        .sug-card:hover  { transform: scale(1.03); box-shadow: 0 8px 28px rgba(0,0,0,0.5) !important; }
        .sug-card:active { transform: scale(0.96); }

        .add-sug-btn {
          transition: transform 0.14s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        .add-sug-btn:active { transform: scale(0.92); }

        .cta-btn {
          transition: transform 0.15s ease, box-shadow 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .cta-btn:hover { transform: scale(1.02); }
        .cta-btn:active { transform: scale(0.97); }

        .details-toggle {
          transition: background 0.15s ease;
          cursor: pointer;
        }
        .details-toggle:hover { background: rgba(255,255,255,0.04) !important; }

        .brand-card {
          transition: transform 0.18s ease, background 0.15s ease;
          cursor: pointer;
        }
        .brand-card:hover  { transform: scale(1.01); }
        .brand-card:active { transform: scale(0.98); }

        .shimmer {
          background-size: 400px 100%;
          animation: shimmer 1.4s infinite linear;
          border-radius: 12px;
        }
      `}</style>

      {/* ── HERO IMAGE SECTION ── */}
      <div style={{ position: 'relative', width: '100%', height: '340px', overflow: 'hidden' }}>
        {(loading || !imgLoaded) && (
          <div className="shimmer" style={{
            position: 'absolute', inset: 0, borderRadius: 0, zIndex: 1,
            background: 'linear-gradient(90deg,#1c1c1c 25%,#2a2a2a 50%,#1c1c1c 75%)',
          }} />
        )}
        {!loading && item && (
          <img
            className="fd-hero-img"
            src={item.img || FALLBACK_IMG}
            alt={item.name}
            onLoad={() => setImgLoaded(true)}
            onError={e => { e.target.src = FALLBACK_IMG; setImgLoaded(true) }}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.5s ease',
            }}
          />
        )}

        {/* Top gradient */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '140px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }} />
        {/* Bottom gradient */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '180px',
          background: 'linear-gradient(to top, rgba(15,15,15,1) 0%, rgba(15,15,15,0.6) 50%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Back button */}
        <button
          className="glass-btn"
          onClick={() => navigate(`/restaurant/${slug}`, { state: { activeNav: returnTab } })}
          style={{
            position: 'absolute', top: '16px', left: '16px', zIndex: 10,
            width: '42px', height: '42px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1.5px solid rgba(255,255,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>

        {/* Right-side icon cluster */}
        <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Wishlist */}
          <button
            className="glass-btn"
            onClick={toggleLike}
            style={{
              width: '42px', height: '42px', borderRadius: '50%',
              background: liked ? `${themeColor}30` : 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: `1.5px solid ${liked ? themeColor + '60' : 'rgba(255,255,255,0.14)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
            }}
          >
            <Heart
              size={17}
              fill={liked ? themeColor : 'transparent'}
              color={liked ? themeColor : '#fff'}
              style={{ animation: heartBounce ? 'heartPop 0.4s ease' : 'none' }}
            />
          </button>
          {/* Search */}
          <button
            className="glass-btn"
            onClick={() => navigate(`/restaurant/${slug}`, { state: { activeNav: returnTab, openSearch: true } })}
            style={{
              width: '42px', height: '42px', borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1.5px solid rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff',
            }}
          >
            <Search size={16} strokeWidth={2.5} />
          </button>
          {/* Share */}
          <button
            className="glass-btn"
            onClick={handleShare}
            style={{
              width: '42px', height: '42px', borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1.5px solid rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff',
            }}
          >
            <Share2 size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── PRODUCT INFO CARD (floating overlay) ── */}
      <div className="fd-card" style={{ margin: '-32px 12px 0', position: 'relative', zIndex: 10 }}>
        <div style={{
          background: '#1A1A1A',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '20px 20px 18px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        }}>
          {/* Rating row */}
          {!loading && item && (
            <div style={{ marginBottom: '10px' }}>
              <StarRating rating={item.rating || 4.5} count={item.ratingCount} color={themeColor} />
            </div>
          )}

          {/* Veg indicator + tag row */}
          {!loading && item && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{
                width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                border: `2px solid ${isVeg ? '#4ade80' : themeColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isVeg ? '#4ade80' : themeColor }} />
              </div>
              {tag && (
                <div style={{
                  background: `${tagColors[tag] || themeColor}22`,
                  border: `1px solid ${tagColors[tag] || themeColor}44`,
                  borderRadius: '20px', padding: '2px 10px',
                  fontSize: '10px', fontWeight: 800, color: tagColors[tag] || themeColor,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {tag === 'Popular' && <Flame size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
                  {tag}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          {loading ? (
            <div className="shimmer" style={{ height: '26px', width: '75%', marginBottom: '8px', background: 'linear-gradient(90deg,#1c1c1c 25%,#2a2a2a 50%,#1c1c1c 75%)' }} />
          ) : (
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff', lineHeight: 1.25, marginBottom: '10px', letterSpacing: '-0.02em' }}>
              {item?.name}
            </div>
          )}

          {/* Price row */}
          {loading ? (
            <div className="shimmer" style={{ height: '20px', width: '40%', background: 'linear-gradient(90deg,#1c1c1c 25%,#2a2a2a 50%,#1c1c1c 75%)' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px', fontWeight: 900, color: themeColor }}>
                ₹{(item?.price || 0).toLocaleString('en-IN')}
              </span>
              {item?.oldPrice && (
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#444', textDecoration: 'line-through' }}>
                  ₹{item.oldPrice.toLocaleString('en-IN')}
                </span>
              )}
              {/* Stock badge */}
              {isOutOfStock ? (
                <div style={{
                  marginLeft: 'auto',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '20px', padding: '3px 10px',
                  fontSize: '10px', fontWeight: 700, color: '#666',
                  letterSpacing: '0.04em',
                }}>
                  Out of stock
                </div>
              ) : stockCount && stockCount <= 5 ? (
                <div style={{
                  marginLeft: 'auto',
                  background: `${themeColor}18`,
                  border: `1px solid ${themeColor}35`,
                  borderRadius: '20px', padding: '3px 10px',
                  fontSize: '10px', fontWeight: 700, color: themeColor,
                  letterSpacing: '0.04em',
                }}>
                  Only {stockCount} left
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ── CTA SECTION ── */}
      {!loading && item && (
        <div style={{ margin: '12px 12px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isOutOfStock ? (
            <button
              onClick={handleNotifyMe}
              className="cta-btn"
              style={{
                flex: 1,
                padding: '15px',
                borderRadius: '16px',
                border: `2px solid ${notifyActive ? themeColor : 'rgba(255,255,255,0.15)'}`,
                background: notifyActive ? `${themeColor}18` : 'transparent',
                color: notifyActive ? themeColor : 'rgba(255,255,255,0.7)',
                fontSize: '14px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                cursor: 'pointer', letterSpacing: '0.01em',
                transition: 'border-color 0.2s, background 0.2s, color 0.2s',
              }}
            >
              <Bell size={16} strokeWidth={2.5} />
              {notifyActive ? 'You\'ll be notified!' : 'Notify Me'}
            </button>
          ) : (
            <>
              {/* Quantity stepper */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.09)',
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  style={{
                    width: '40px', height: '48px', border: 'none',
                    background: 'transparent', color: '#aaa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = '#aaa'}
                >
                  <Minus size={14} strokeWidth={2.5} />
                </button>
                <span style={{ minWidth: '32px', textAlign: 'center', fontSize: '16px', fontWeight: 800, color: '#fff' }}>{qty}</span>
                <button
                  onClick={() => setQty(q => q + 1)}
                  style={{
                    width: '40px', height: '48px', border: 'none',
                    background: themeColor, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    boxShadow: `0 0 16px ${themeColor}60`,
                  }}
                >
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              </div>

              {/* Add to Cart button */}
              <button
                className="cta-btn"
                onClick={handleAddToCart}
                style={{
                  flex: 1,
                  padding: '15px',
                  borderRadius: '16px',
                  border: 'none',
                  background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%)`,
                  color: '#fff',
                  fontSize: '14px', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                  cursor: 'pointer', letterSpacing: '0.01em',
                  boxShadow: `0 6px 24px ${themeColor}50`,
                  transform: addBtnScale ? 'scale(0.97)' : 'scale(1)',
                  transition: 'transform 0.15s ease',
                }}
              >
                {ripple && (
                  <span style={{
                    position: 'absolute', width: '20px', height: '20px',
                    borderRadius: '50%', background: 'rgba(255,255,255,0.35)',
                    animation: 'rippleAnim 0.6s ease-out forwards',
                    pointerEvents: 'none',
                  }} />
                )}
                <ShoppingCart size={15} strokeWidth={2.5} />
                Add to Cart · ₹{((item?.price || 0) * qty).toLocaleString('en-IN')}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── COLLAPSIBLE PRODUCT DETAILS ── */}
      {!loading && item && (
        <div className="fd-details" style={{ margin: '12px 12px 0' }}>
          <div style={{
            background: '#1A1A1A',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '18px',
            overflow: 'hidden',
          }}>
            <div
              className="details-toggle"
              onClick={() => setDetailsOpen(v => !v)}
              style={{
                padding: '16px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'transparent',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: themeColor }}>View product details</span>
              <ChevronDown
                size={16}
                color={themeColor}
                style={{ transition: 'transform 0.3s ease', transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </div>

            {detailsOpen && (
              <div style={{ padding: '0 18px 18px', animation: 'detailsExpand 0.25s ease both' }}>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '16px' }} />

                {/* Description */}
                {item.description && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>Description</div>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{item.description}</p>
                  </div>
                )}

                {/* Ingredients */}
                {item.ingredients && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>Ingredients</div>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{item.ingredients}</p>
                  </div>
                )}

                {/* Spice level */}
                {item.spice && item.spice !== 'None' && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>Spice Level</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <Flame size={13} color={spiceColor} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: spiceColor }}>{item.spice}</span>
                    </div>
                  </div>
                )}

                {/* Tags as chips */}
                {item.tags?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>Tags</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {item.tags.map((tag, i) => (
                        <div key={i} style={{
                          background: `${tagColors[tag] || themeColor}18`,
                          border: `1px solid ${tagColors[tag] || themeColor}35`,
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '11px', fontWeight: 700, color: tagColors[tag] || themeColor,
                        }}>
                          {tag}
                        </div>
                      ))}
                      {isVeg && !item.tags.includes('Vegetarian') && (
                        <div style={{
                          background: 'rgba(74,222,128,0.12)',
                          border: '1px solid rgba(74,222,128,0.28)',
                          borderRadius: '20px', padding: '4px 12px',
                          fontSize: '11px', fontWeight: 700, color: '#4ade80',
                        }}>
                          Vegetarian
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── BRAND / RESTAURANT CARD ── */}
      {!loading && (
        <div className="fd-brand" style={{ margin: '12px 12px 0' }}>
          <div
            className="brand-card"
            onClick={() => navigate(`/restaurant/${slug}`, { state: { activeNav: 'home' } })}
            style={{
              background: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '18px',
              padding: '16px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Logo / avatar */}
              <div style={{
                width: '46px', height: '46px', borderRadius: '14px',
                background: restaurantLogo ? 'transparent' : `${themeColor}22`,
                border: `1.5px solid ${themeColor}30`,
                overflow: 'hidden', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {restaurantLogo ? (
                  <img src={restaurantLogo} alt={restaurantName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '18px', fontWeight: 900, color: themeColor }}>
                    {restaurantName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{restaurantName}</div>
                <div style={{ fontSize: '12px', color: themeColor, fontWeight: 600, marginTop: '2px' }}>Explore all products</div>
              </div>
            </div>
            <ChevronRight size={18} color='#444' />
          </div>
        </div>
      )}

      {/* ── SIMILAR PRODUCTS ── */}
      {suggestions.length > 0 && (
        <div className="fd-similar" style={{ margin: '20px 0 0' }}>
          <div style={{ padding: '0 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Similar products</div>
            <button
              onClick={() => navigate(`/restaurant/${slug}`, { state: { activeNav: returnTab } })}
              style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                background: 'none', border: 'none',
                color: themeColor, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              See all <ChevronRight size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '0 14px 8px', scrollSnapType: 'x mandatory' }}>
            {suggestions.map((sug, i) => {
              const sugVeg = sug.veg !== false
              return (
                <div
                  key={i}
                  className="sug-card"
                  onClick={() => handleSuggestionClick(sug)}
                  style={{
                    flexShrink: 0, width: '152px',
                    background: '#1A1A1A',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '18px', overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    scrollSnapAlign: 'start',
                  }}
                >
                  <div style={{ height: '110px', overflow: 'hidden', position: 'relative' }}>
                    <img
                      src={sug.img || FALLBACK_IMG}
                      alt={sug.name}
                      onError={e => { e.target.src = FALLBACK_IMG }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s ease' }}
                    />
                    {/* veg dot */}
                    <div style={{
                      position: 'absolute', top: '7px', left: '7px',
                      width: '16px', height: '16px', borderRadius: '4px',
                      border: `1.5px solid ${sugVeg ? '#4ade80' : themeColor}`,
                      background: 'rgba(0,0,0,0.65)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: sugVeg ? '#4ade80' : themeColor }} />
                    </div>
                    {/* ADD button */}
                    <button
                      className="add-sug-btn"
                      onClick={e => handleSuggestionAdd(e, sug)}
                      style={{
                        position: 'absolute', bottom: '8px', right: '8px',
                        background: themeColor,
                        border: 'none',
                        borderRadius: '10px', padding: '5px 12px',
                        fontSize: '11px', fontWeight: 800, color: '#fff',
                        cursor: 'pointer', letterSpacing: '0.04em',
                        boxShadow: `0 3px 10px ${themeColor}55`,
                      }}
                    >
                      ADD
                    </button>
                  </div>
                  <div style={{ padding: '10px 10px 12px' }}>
                    {/* Weight */}
                    {sug.weight && (
                      <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, marginBottom: '3px' }}>{sug.weight}</div>
                    )}
                    <div style={{
                      fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.88)',
                      lineHeight: 1.3, marginBottom: '5px',
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {sug.name}
                    </div>
                    {/* Rating */}
                    {sug.rating && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '5px' }}>
                        <Star size={10} fill={themeColor} color={themeColor} />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{sug.rating.toFixed(1)}</span>
                        {sug.ratingCount && <span style={{ fontSize: '10px', color: '#444' }}>({sug.ratingCount})</span>}
                      </div>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: 800, color: themeColor }}>
                      ₹{(sug.price || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── FLOATING CART BAR ── */}
      {cartBarVisible && cartItems.length > 0 && (
        <div
          className="cart-bar"
          onClick={handleViewCart}
          style={{
            position: 'fixed', bottom: '20px', left: '16px', right: '16px',
            zIndex: 200, maxWidth: '448px', margin: '0 auto',
            background: themeColor,
            borderRadius: '18px',
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: `0 8px 32px ${themeColor}60`,
            cursor: 'pointer',
            transition: 'transform 0.18s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Preview images */}
            <div style={{ display: 'flex', marginRight: '2px' }}>
              {cartPreviewImgs.map((img, i) => (
                <div key={i} style={{
                  width: '32px', height: '32px', borderRadius: '10px',
                  border: '2px solid rgba(255,255,255,0.25)',
                  overflow: 'hidden', marginLeft: i > 0 ? '-8px' : 0,
                  background: '#333',
                }}>
                  <img src={img} alt="" onError={e => { e.target.style.display = 'none' }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>View Cart</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                {cartCount} item{cartCount !== 1 ? 's' : ''} · ₹{cartTotal.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '12px', padding: '8px 14px',
          }}>
            <ShoppingBag size={14} color="#fff" strokeWidth={2.5} />
            <ChevronRight size={14} color="#fff" strokeWidth={2.5} />
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: cartBarVisible ? '100px' : '28px',
          left: '50%',
          zIndex: 300,
          background: '#1A1A1A',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '12px 18px',
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          animation: 'toastIn 0.35s cubic-bezier(0.22,1,0.36,1) both',
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'rgba(74,222,128,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '14px' }}>✓</span>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Added to cart!</div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '1px' }}>
              {qty}× {item?.name?.slice(0, 24)}{(item?.name?.length || 0) > 24 ? '…' : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
