import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Share2, Heart, Star, ShoppingBag, Plus, Minus,
  CheckCircle, Leaf, Flame, ChevronRight
} from 'lucide-react'

const FALLBACK_IMG = '/menu/wagyu-ribeye.png'

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

const ADD_ONS = [
  { id: 'cheese', label: 'Extra Cheese', price: 50 },
  { id: 'naan', label: 'Butter Naan', price: 40 },
  { id: 'drink', label: 'Cold Drink', price: 60 },
  { id: 'sauce', label: 'Special Sauce', price: 30 },
]

function injectOldPrice(item) {
  return { ...item, oldPrice: item.oldPrice || Math.round(item.price * 1.5) }
}

function getAllItems(menuData) {
  return [
    ...menuData.starters,
    ...menuData.mains,
    ...menuData.drinks,
  ]
}

function buildDescBullets(item) {
  const bullets = []
  if (item.description) bullets.push(item.description)
  if (item.veg !== false) bullets.push("Vegetarian friendly")
  else bullets.push("Chef's recommendation")
  if (item.tags?.includes('Gluten Free')) bullets.push('Gluten free')
  else bullets.push('Spice level: Medium')
  if (item.tags?.includes('Seasonal')) bullets.push('Seasonal special')
  else if (item.tags?.includes('Popular')) bullets.push('Most ordered this week')
  return bullets.slice(0, 4)
}

export default function FoodDetail() {
  const { slug, itemName } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [item, setItem] = useState(location.state?.item || null)
  const [menuData, setMenuData] = useState({ starters: [], mains: [], drinks: [] })
  const [loading, setLoading] = useState(!location.state?.item)
  const [liked, setLiked] = useState(false)
  const [qty, setQty] = useState(1)
  const [selectedAddOns, setSelectedAddOns] = useState({})
  const [toast, setToast] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [heartBounce, setHeartBounce] = useState(false)
  const [addBtnScale, setAddBtnScale] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const toastTimer = useRef(null)

  useEffect(() => {
    const loadData = () => {
      let allItems = []
      let menu = MENU_FALLBACK

      if (slug === 'demo') {
        menu = MENU_FALLBACK
      } else {
        const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const found = restaurants.find(r => r.slug === slug || r.id === slug)
        if (found) {
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
      allItems = getAllItems(menu)

      if (!item) {
        const decoded = decodeURIComponent(itemName)
        const found = allItems.find(i => i.name === decoded)
        if (found) setItem(injectOldPrice(found))
      }

      setTimeout(() => setLoading(false), 600)
    }
    loadData()
  }, [slug, itemName])

  const allMenuItems = getAllItems(menuData)
  const suggestions = allMenuItems.filter(i => i.name !== item?.name).slice(0, 6)

  const addOnTotal = ADD_ONS.filter(a => selectedAddOns[a.id]).reduce((s, a) => s + a.price, 0)
  const unitPrice = (item?.price || 0) + addOnTotal
  const total = unitPrice * qty

  function toggleAddOn(id) {
    setSelectedAddOns(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleLike() {
    setLiked(v => !v)
    setHeartBounce(true)
    setTimeout(() => setHeartBounce(false), 400)
  }

  function handleAddToCart() {
    if (!item) return
    const cartKey = `exzibo_cart_${slug}`
    const existing = JSON.parse(localStorage.getItem(cartKey) || '[]')
    const cartItem = {
      id: Date.now(),
      name: item.name + (Object.keys(selectedAddOns).filter(k => selectedAddOns[k]).length > 0
        ? ' (+' + ADD_ONS.filter(a => selectedAddOns[a.id]).map(a => a.label).join(', ') + ')'
        : ''),
      price: unitPrice,
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
    setAddBtnScale(true)
    setTimeout(() => setAddBtnScale(false), 200)
    setToast(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(false), 2500)
  }

  function handleSuggestionClick(suggested) {
    navigate(`/restaurant/${slug}/food/${encodeURIComponent(suggested.name)}`, {
      state: { item: suggested },
      replace: true,
    })
    setItem(suggested)
    setImgLoaded(false)
    setQty(1)
    setSelectedAddOns({})
    setLiked(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: item?.name, text: item?.description, url: window.location.href }).catch(() => {})
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
    }
  }

  const bullets = item ? buildDescBullets(item) : []
  const isVeg = item?.veg !== false
  const tag = item?.tags?.[0] || null
  const tagColors = { Popular: '#E8321A', Seasonal: '#fbbf24', Vegetarian: '#4ade80', 'Gluten Free': '#22c55e', "Chef's Pick": '#a78bfa' }

  return (
    <div style={{
      background: '#0f0f0f',
      minHeight: '100vh',
      maxWidth: '480px',
      margin: '0 auto',
      position: 'relative',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      paddingBottom: '100px',
      overflowX: 'hidden',
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes zoomIn {
          from { transform: scale(1.08); }
          to   { transform: scale(1); }
        }
        @keyframes toastIn {
          0%   { opacity: 0; transform: translateY(16px) scale(0.92); }
          60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes heartPop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.45); }
          100% { transform: scale(1); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .fd-page { animation: fadeSlideUp 0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .fd-hero-img { animation: zoomIn 0.6s cubic-bezier(0.22,1,0.36,1) both; }
        .fd-card { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
        .fd-addon-card { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.18s both; }
        .fd-suggestions { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) 0.24s both; }
        .add-btn { transition: transform 0.15s ease, box-shadow 0.2s ease; }
        .add-btn:hover { box-shadow: 0 10px 32px rgba(232,50,26,0.55) !important; transform: scale(1.03); }
        .add-btn:active { transform: scale(0.97); }
        .back-btn { transition: background 0.15s ease, transform 0.12s ease; }
        .back-btn:active { transform: scale(0.92); }
        .addon-row { transition: background 0.15s ease; }
        .addon-row:hover { background: rgba(255,255,255,0.04); }
        .sug-card { transition: transform 0.18s ease; cursor: pointer; }
        .sug-card:active { transform: scale(0.96); }
        .shimmer {
          background: linear-gradient(90deg, #1c1c1c 25%, #2a2a2a 50%, #1c1c1c 75%);
          background-size: 400px 100%;
          animation: shimmer 1.4s infinite linear;
          border-radius: 12px;
        }
      `}</style>

      {/* ── HERO IMAGE SECTION ── */}
      <div style={{ position: 'relative', width: '100%', height: '320px', overflow: 'hidden' }}>
        {/* Skeleton while loading */}
        {(loading || !imgLoaded) && (
          <div className="shimmer" style={{ position: 'absolute', inset: 0, borderRadius: 0, zIndex: 1 }} />
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
              opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.4s ease',
            }}
          />
        )}
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)',
        }} />
        {/* ── BACK BUTTON — top-left of image ── */}
        <button
          className="back-btn"
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: '14px', left: '14px', zIndex: 10,
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.50)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1.5px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>
        {/* ── FAVOURITE BUTTON — top-right of image ── */}
        <button
          onClick={toggleLike}
          style={{
            position: 'absolute', top: '14px', right: '14px', zIndex: 10,
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.50)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: `1.5px solid ${liked ? 'rgba(232,50,26,0.45)' : 'rgba(255,255,255,0.15)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'border-color 0.2s ease',
          }}
        >
          <Heart
            size={17}
            fill={liked ? '#E8321A' : 'transparent'}
            color={liked ? '#E8321A' : '#fff'}
            style={{ animation: heartBounce ? 'heartPop 0.4s ease' : 'none' }}
          />
        </button>
        {/* ── SHARE BUTTON — bottom-right of image ── */}
        <button
          onClick={handleShare}
          style={{
            position: 'absolute', bottom: '18px', right: '14px', zIndex: 10,
            width: '38px', height: '38px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.50)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1.5px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Share2 size={16} color="#fff" />
        </button>
        {/* Bottom-left overlay text */}
        {!loading && item && (
          <div style={{ position: 'absolute', bottom: '18px', left: '18px', right: '70px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {/* Veg/non-veg indicator */}
              <div style={{
                width: '16px', height: '16px', borderRadius: '3px',
                border: `2px solid ${isVeg ? '#4ade80' : '#E8321A'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isVeg ? '#4ade80' : '#E8321A' }} />
              </div>
              {tag && (
                <div style={{
                  background: tagColors[tag] ? `${tagColors[tag]}cc` : 'rgba(232,50,26,0.85)',
                  backdropFilter: 'blur(6px)',
                  borderRadius: '6px', padding: '2px 8px',
                  fontSize: '10px', fontWeight: 800, color: '#fff', letterSpacing: '0.05em',
                }}>
                  {tag}
                </div>
              )}
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#fff', lineHeight: 1.2, textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}>
              {item.name}
            </div>
          </div>
        )}
        {loading && (
          <div style={{ position: 'absolute', bottom: '18px', left: '18px', right: '18px' }}>
            <div className="shimmer" style={{ height: '28px', width: '60%', marginBottom: '8px' }} />
            <div className="shimmer" style={{ height: '16px', width: '35%' }} />
          </div>
        )}
      </div>

      {/* ── DETAILS CARD ── */}
      <div className="fd-card" style={{ margin: '14px 14px 0', position: 'relative' }}>
        <div style={{
          background: 'rgba(28,28,28,0.96)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '22px',
          padding: '20px 20px 18px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
          {/* Rating section */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div className="shimmer" style={{ width: '100px', height: '20px' }} />
              <div className="shimmer" style={{ width: '80px', height: '16px' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1,2,3,4,5].map(s => (
                  <Star
                    key={s}
                    size={16}
                    fill={s <= 4 ? '#FFB800' : 'transparent'}
                    color={s <= 4 ? '#FFB800' : '#444'}
                    strokeWidth={s === 5 ? 1.5 : 2}
                  />
                ))}
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFB800' }}>4.5</span>
              <span style={{ fontSize: '12px', color: '#666', fontWeight: 500 }}>(40 Reviews)</span>
            </div>
          )}

          {/* Description bullets */}
          {loading ? (
            <div style={{ marginBottom: '18px' }}>
              {[1,2,3].map(i => (
                <div key={i} className="shimmer" style={{ height: '14px', width: i === 3 ? '50%' : '80%', marginBottom: '8px' }} />
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: '18px' }}>
              {bullets.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '7px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#E8321A', marginTop: '6px', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{b}</span>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '0 0 16px' }} />

          {/* Price + Qty row */}
          {loading ? (
            <div className="shimmer" style={{ height: '36px', width: '160px' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#666', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>Base Price</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 900, color: '#E8321A' }}>₹{(item?.price || 0).toLocaleString('en-IN')}</span>
                  {item?.oldPrice && (
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#444', textDecoration: 'line-through' }}>
                      ₹{item.oldPrice.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
              {/* Quantity stepper */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', padding: '6px 8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  style={{ width: '30px', height: '30px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.06)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Minus size={13} strokeWidth={2.5} />
                </button>
                <span style={{ minWidth: '28px', textAlign: 'center', fontSize: '16px', fontWeight: 800, color: '#fff' }}>{qty}</span>
                <button
                  onClick={() => setQty(q => q + 1)}
                  style={{ width: '30px', height: '30px', borderRadius: '10px', border: 'none', background: '#E8321A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 3px 10px rgba(232,50,26,0.4)' }}
                >
                  <Plus size={13} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ADD-ONS SECTION ── */}
      <div className="fd-addon-card" style={{ margin: '12px 14px 0' }}>
        <div style={{
          background: 'rgba(22,22,22,0.98)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '22px',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>Customize your dish</div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Select add-ons to enhance your meal</div>
          </div>
          {ADD_ONS.map((addon, i) => (
            <div
              key={addon.id}
              className="addon-row"
              onClick={() => toggleAddOn(addon.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: i < ADD_ONS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                cursor: 'pointer',
                borderRadius: i === ADD_ONS.length - 1 ? '0 0 22px 22px' : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '7px',
                  border: `2px solid ${selectedAddOns[addon.id] ? '#E8321A' : 'rgba(255,255,255,0.15)'}`,
                  background: selectedAddOns[addon.id] ? '#E8321A' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.15s ease',
                }}>
                  {selectedAddOns[addon.id] && <CheckCircle size={13} color="#fff" strokeWidth={2.5} />}
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{addon.label}</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: selectedAddOns[addon.id] ? '#E8321A' : '#555' }}>
                +₹{addon.price}
              </span>
            </div>
          ))}
        </div>

        {/* Running total */}
        {addOnTotal > 0 && (
          <div style={{
            marginTop: '10px',
            background: 'rgba(232,50,26,0.08)',
            border: '1px solid rgba(232,50,26,0.20)',
            borderRadius: '14px',
            padding: '12px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Add-ons total</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#E8321A' }}>+₹{addOnTotal}</span>
          </div>
        )}
      </div>

      {/* ── YOU MAY ALSO LIKE ── */}
      {suggestions.length > 0 && (
        <div className="fd-suggestions" style={{ margin: '18px 0 0' }}>
          <div style={{ padding: '0 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>You may also like</div>
            <ChevronRight size={16} color="#555" />
          </div>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '0 14px 4px', scrollSnapType: 'x mandatory' }}>
            {suggestions.map((sug, i) => (
              <div
                key={i}
                className="sug-card"
                onClick={() => handleSuggestionClick(sug)}
                style={{
                  flexShrink: 0, width: '140px',
                  background: 'rgba(22,22,22,0.98)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '18px', overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  scrollSnapAlign: 'start',
                }}
              >
                <div style={{ height: '100px', overflow: 'hidden', position: 'relative' }}>
                  <img
                    src={sug.img || FALLBACK_IMG}
                    alt={sug.name}
                    onError={e => { e.target.src = FALLBACK_IMG }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* Veg dot */}
                  <div style={{
                    position: 'absolute', bottom: '6px', left: '6px',
                    width: '14px', height: '14px', borderRadius: '3px',
                    border: `1.5px solid ${sug.veg !== false ? '#4ade80' : '#E8321A'}`,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: sug.veg !== false ? '#4ade80' : '#E8321A' }} />
                  </div>
                </div>
                <div style={{ padding: '9px 10px 10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3, marginBottom: '5px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {sug.name}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#E8321A' }}>
                    ₹{(sug.price || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STICKY ADD TO ORDER BUTTON ── */}
      <div style={{
        position: 'fixed', bottom: '24px',
        left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px',
        padding: '0 14px', zIndex: 90, pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', pointerEvents: 'all' }}>
          <button
            className="add-btn"
            onClick={handleAddToCart}
            disabled={loading || !item}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'linear-gradient(135deg, #E8321A 0%, #ff6b35 100%)',
              color: '#fff', border: 'none',
              borderRadius: '30px',
              padding: '15px 26px',
              fontSize: '14px', fontWeight: 800,
              cursor: loading || !item ? 'not-allowed' : 'pointer',
              boxShadow: '0 6px 28px rgba(232,50,26,0.50)',
              opacity: loading || !item ? 0.6 : 1,
              transform: addBtnScale ? 'scale(0.95)' : 'scale(1)',
              transition: 'transform 0.15s ease',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            <ShoppingBag size={17} strokeWidth={2.5} />
            Add to Order · ₹{total.toLocaleString('en-IN')}
          </button>
        </div>
      </div>

      {/* ── TOAST NOTIFICATION ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '86px',
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 200,
          background: 'rgba(20,20,20,0.97)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '16px',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          animation: 'toastIn 0.35s cubic-bezier(0.22,1,0.36,1) both',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={15} color="#22c55e" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Added to cart!</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '1px' }}>{qty}× {item?.name?.slice(0, 22)}{(item?.name?.length || 0) > 22 ? '…' : ''}</div>
          </div>
        </div>
      )}
    </div>
  )
}
