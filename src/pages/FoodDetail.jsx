import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useMenuSubdomainRedirect } from '../lib/routeConfig'
import { getRestaurantBySlug } from '../lib/db'
import { supabase } from '../lib/supabase'
import { toSlug, findBySlug } from '../lib/slug'
import { getSubdomain } from '../lib/subdomain'
import { ArrowLeft, Share2, Heart, Search, Star, ChevronRight, ChevronDown, Flame } from 'lucide-react'

const FALLBACK_IMG = '/menu/wagyu-ribeye.png'

const MENU_FALLBACK = {
  starters: [
    { name: 'Truffle Beef Carpaccio', price: 2100, oldPrice: 3150, img: '/menu/truffle-beef-carpaccio.png', description: 'Thin-sliced wagyu with black truffle and aged parmesan', tags: ['Popular'], veg: false, rating: 4.8, ratingCount: 811, weight: '200g', ingredients: 'Wagyu beef, black truffle, aged parmesan, arugula, olive oil', spice: 'Mild' },
    { name: 'Atlantic Oysters', price: 2800, oldPrice: 4200, img: '/menu/atlantic-oysters.png', description: 'Half dozen with mignonette and lemon', tags: ['Seasonal'], veg: false, rating: 4.6, ratingCount: 342, weight: '300g', ingredients: 'Fresh oysters, mignonette sauce, lemon, shallots', spice: 'None' },
    { name: 'Heirloom Burrata', price: 1650, oldPrice: 2475, img: '/menu/heirloom-burrata.png', description: 'Fresh burrata with heirloom tomatoes and basil oil', tags: ['Vegetarian'], veg: true, rating: 4.7, ratingCount: 197, weight: '250g', ingredients: 'Fresh burrata, heirloom tomatoes, basil, extra virgin olive oil', spice: 'None' },
  ],
  mains: [
    { name: 'A5 Wagyu Ribeye', price: 15500, oldPrice: 23250, img: '/menu/wagyu-ribeye.png', description: 'Japanese A5 Wagyu with bone marrow butter', tags: ['Popular'], veg: false, rating: 4.9, ratingCount: 437, weight: '350g', ingredients: 'A5 Wagyu beef, bone marrow, fleur de sel, thyme, garlic butter', spice: 'Mild' },
    { name: 'Lobster Thermidor', price: 7950, oldPrice: 11925, img: '/menu/lobster-thermidor.png', description: 'Whole Maine lobster in cognac cream sauce', tags: ['Seasonal'], veg: false, rating: 4.7, ratingCount: 194, weight: '500g', ingredients: 'Maine lobster, cognac, cream, gruyère, tarragon, shallots', spice: 'None', stock: 3 },
    { name: 'Forest Mushroom Risotto', price: 3500, oldPrice: 5250, img: '/menu/mushroom-risotto.png', description: 'Arborio rice with wild porcini and truffle oil', tags: ['Vegetarian', 'Gluten Free'], veg: true, rating: 4.5, ratingCount: 256, weight: '400g', ingredients: 'Arborio rice, porcini mushrooms, truffle oil, parmesan, white wine', spice: 'None' },
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
    ratingCount: item.ratingCount || 150,
    weight: item.weight || '200g',
    ingredients: item.ingredients || item.description || '',
    spice: item.spice || 'Medium',
  }
}

function getAllItems(menuData) {
  return [...menuData.starters, ...menuData.mains, ...menuData.drinks]
}

export default function FoodDetail() {
  // Support two URL patterns:
  //   /:slug/food/:itemName         (classic pattern)
  //   /:slug/:tableNumber/:page     (table-context pattern, page = item name)
  const { slug, itemName, tableNumber, page } = useParams()
  const effectiveItemName = itemName || page
  const navigate = useNavigate()
  const location = useLocation()

  // Redirect to configured menu subdomain in production (only for classic /restaurant/ pattern)
  // Use slug-based URL so the redirect lands on the clean canonical path
  useMenuSubdomainRedirect(slug && itemName ? `/${slug}/food/${toSlug(decodeURIComponent(itemName))}` : null)

  const [item, setItem] = useState(location.state?.item ? injectOldPrice(location.state.item) : null)
  const returnTab = location.state?.returnTab || 'menu'
  const [menuData, setMenuData] = useState({ starters: [], mains: [], drinks: [] })
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(!location.state?.item)
  const [itemNotFound, setItemNotFound] = useState(false)
  const [liked, setLiked] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [heartBounce, setHeartBounce] = useState(false)

  const BRAND_CRIMSON = '#E8321A'
  const themeColor = location.state?.themeColor ||
    (restaurant?.accent_color && restaurant.accent_color !== '#6366F1' ? restaurant.accent_color : null) ||
    BRAND_CRIMSON

  // On menu.exzibo.online the restaurant base path is /:slug (no /restaurant/ prefix)
  const isMenuSubdomain = getSubdomain() === 'menu'
  const restaurantBasePath = isMenuSubdomain ? `/${slug}` : `/restaurant/${slug}`

  // ── Back navigation — returns to the right URL depending on context ────────
  function goBack() {
    if (tableNumber) {
      navigate(`/${slug}/${tableNumber}`, { state: { activeNav: returnTab } })
    } else {
      navigate(restaurantBasePath, { state: { activeNav: returnTab } })
    }
  }

  useEffect(() => {
    if (!slug || !effectiveItemName) return
    const decoded = decodeURIComponent(effectiveItemName)
    let cancelled = false

    async function loadItem() {
      // ── 1. Try Supabase first ─────────────────────────────────────────────
      try {
        const rest = await getRestaurantBySlug(slug)
        if (!cancelled && rest) {
          setRestaurant(rest)

          // Fetch all items for this restaurant — used for both lookup and suggestions.
          // Slug match (new URLs) and exact name match (legacy URL-encoded) are both handled.
          const { data: allItems, error } = await supabase
            .from('menu_items')
            .select('*')
            .eq('restaurant_id', rest.id)

          // decoded can be a slug like 'chicken-malai-tikka' OR a raw name like 'Chicken Malai Tikka'
          const dbItem = !error && allItems ? findBySlug(allItems, decoded) : null

          if (dbItem && !cancelled) {
            setItem(injectOldPrice({
              ...dbItem,
              img: dbItem.image || null,
            }))
            setLoading(false)
            setItemNotFound(false)

            // Build suggestions from remaining published items
            const allMapped = (allItems || [])
              .filter(it => it.is_published !== false && it.id !== dbItem.id)
              .map(it => injectOldPrice({ ...it, img: it.image || null }))

            if (!cancelled) {
              setMenuData({
                starters: allMapped.filter((_, i) => i % 3 === 0),
                mains:    allMapped.filter((_, i) => i % 3 === 1),
                drinks:   allMapped.filter((_, i) => i % 3 === 2),
              })
            }
            return
          }
        }
      } catch {}

      // ── 2. Fall back to localStorage ──────────────────────────────────────
      if (cancelled) return
      let menu = MENU_FALLBACK
      let rest = null
      if (slug !== 'demo') {
        try {
          const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
          const found = restaurants.find(r => r.slug === slug || r.id === slug)
          if (found) {
            rest = found
            const saved = localStorage.getItem(`exzibo_menu_${found.id}`)
            if (saved) {
              const parsed = JSON.parse(saved)
              menu = {
                starters: parsed.starters?.length ? parsed.starters.map(injectOldPrice) : MENU_FALLBACK.starters,
                mains:    parsed.mains?.length    ? parsed.mains.map(injectOldPrice)    : MENU_FALLBACK.mains,
                drinks:   parsed.drinks?.length   ? parsed.drinks.map(injectOldPrice)   : MENU_FALLBACK.drinks,
              }
            }
          }
        } catch {}
      }

      if (!cancelled) {
        setMenuData(menu)
        if (!item) {
          const found = getAllItems(menu).find(i => i.name === decoded)
          if (found) {
            setItem(injectOldPrice(found))
            setItemNotFound(false)
          } else {
            setItemNotFound(true)
          }
        }
        if (rest && !restaurant) setRestaurant(rest)
        setTimeout(() => { if (!cancelled) setLoading(false) }, 400)
      }
    }

    loadItem()
    return () => { cancelled = true }
  }, [slug, effectiveItemName])

  const suggestions = getAllItems(menuData).filter(i => i.name !== item?.name).slice(0, 8)
  const isOutOfStock = item?.outOfStock === true
  const stockCount = item?.stock || null
  const isVeg = item?.veg !== false
  const restaurantName = restaurant?.name || (slug === 'demo' ? 'CrimsonLuxe' : slug)
  const restaurantLogo = restaurant?.logo || null

  const spiceColors = { None: '#60a5fa', Mild: '#4ade80', Medium: '#fbbf24', Hot: '#f97316', 'Very Hot': '#ef4444' }

  function toggleLike() {
    setLiked(v => !v)
    setHeartBounce(true)
    setTimeout(() => setHeartBounce(false), 400)
  }

  function handleShare() {
    if (navigator.share) navigator.share({ title: item?.name, url: window.location.href }).catch(() => {})
    else if (navigator.clipboard) navigator.clipboard.writeText(window.location.href)
  }

  function handleSuggestionClick(sug) {
    const path = tableNumber
      ? `/${slug}/${tableNumber}/${toSlug(sug.name)}`
      : `${restaurantBasePath}/food/${toSlug(sug.name)}`
    navigate(path, {
      state: { item: sug, returnTab, themeColor },
      replace: true,
    })
    setItem(injectOldPrice(sug))
    setImgLoaded(false)
    setDetailsOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const shimmer = 'linear-gradient(90deg,#222 25%,#2e2e2e 50%,#222 75%)'

  return (
    <div style={{
      background: '#111214',
      minHeight: '100vh',
      maxWidth: '480px',
      margin: '0 auto',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowX: 'hidden',
      paddingBottom: '40px',
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        @keyframes heartPop { 0% { transform: scale(1); } 50% { transform: scale(1.5); } 100% { transform: scale(1); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes detailsIn { from { opacity: 0; } to { opacity: 1; } }
        .shimmer { background-size: 400px 100%; animation: shimmer 1.4s infinite linear; }
        .fd-content { animation: fadeUp 0.35s ease both; }
        .icon-btn { transition: transform 0.12s ease; outline: none; -webkit-tap-highlight-color: transparent; }
        .icon-btn:active { transform: scale(0.88); }
        .icon-btn:focus { outline: none; }
        .icon-btn:focus-visible { outline: none; }
        .sug-card { transition: transform 0.16s ease; cursor: pointer; }
        .sug-card:active { transform: scale(0.96); }
        .brand-row { transition: background 0.15s ease; cursor: pointer; }
        .brand-row:active { background: rgba(255,255,255,0.04) !important; }
        .detail-toggle { transition: background 0.15s; cursor: pointer; }
        .detail-toggle:active { background: rgba(255,255,255,0.04) !important; }
      `}</style>

      {/* ── ITEM NOT FOUND ── */}
      {!loading && !item && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '80vh', padding: '32px 24px', gap: '16px',
        }}>
          <div style={{ fontSize: '56px' }}>🍽️</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', textAlign: 'center' }}>
            Item not found
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: '240px', lineHeight: 1.6 }}>
            This menu item may have been removed or is no longer available.
          </div>
          <button
            onClick={goBack}
            style={{
              marginTop: '8px', padding: '12px 28px',
              background: themeColor, color: '#fff',
              border: 'none', borderRadius: '100px',
              fontSize: '14px', fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back to menu
          </button>
        </div>
      )}

      {/* ── HERO IMAGE ── */}
      {(loading || item) && (
      <div style={{ position: 'relative', width: '100%', height: '300px', background: '#1a1a1a' }}>
        {/* Shimmer */}
        {(loading || !imgLoaded) && (
          <div className="shimmer" style={{ position: 'absolute', inset: 0, background: shimmer }} />
        )}
        {!loading && item && (
          <img
            src={item.img || FALLBACK_IMG}
            alt={item.name}
            onLoad={() => setImgLoaded(true)}
            onError={e => { e.target.src = FALLBACK_IMG; setImgLoaded(true) }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.4s' }}
          />
        )}

        {/* Top gradient for icon readability */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '90px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Icon bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 14px',
          zIndex: 10,
        }}>
          {/* Back */}
          <button
            className="icon-btn"
            onClick={goBack}
            style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: 'rgba(30,30,30,0.85)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff',
              outline: 'none', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ArrowLeft size={17} strokeWidth={2.5} />
          </button>

          {/* Right icons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="icon-btn"
              onClick={toggleLike}
              style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: 'rgba(30,30,30,0.85)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                border: `1px solid ${liked ? themeColor + '50' : 'rgba(255,255,255,0.1)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                outline: 'none', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Heart
                size={16}
                fill={liked ? themeColor : 'transparent'}
                color={liked ? themeColor : '#fff'}
                strokeWidth={2}
                style={{ animation: heartBounce ? 'heartPop 0.4s ease' : 'none' }}
              />
            </button>
            <button
              className="icon-btn"
              onClick={() => {
                if (tableNumber) {
                  navigate(`/${slug}/${tableNumber}`, { state: { activeNav: returnTab, openSearch: true } })
                } else {
                  navigate(restaurantBasePath, { state: { activeNav: returnTab, openSearch: true } })
                }
              }}
              style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: 'rgba(30,30,30,0.85)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff',
                outline: 'none', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Search size={16} strokeWidth={2} />
            </button>
            <button
              className="icon-btn"
              onClick={handleShare}
              style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: 'rgba(30,30,30,0.85)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff',
                outline: 'none', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Share2 size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* ── PRODUCT INFO CARD ── */}
      <div className="fd-content" style={{ margin: '10px 10px 0' }}>
        <div style={{
          background: '#1C1E22',
          borderRadius: '16px',
          padding: '16px 16px 18px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Rating */}
          {!loading && item ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
              {[1,2,3,4,5].map(i => (
                <Star
                  key={i}
                  size={13}
                  fill={i <= Math.round(item.rating) ? '#FFB800' : 'transparent'}
                  color={i <= Math.round(item.rating) ? '#FFB800' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={1.5}
                />
              ))}
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFB800', marginLeft: '1px' }}>
                {item.rating.toFixed(1)}
              </span>
            </div>
          ) : (
            <div className="shimmer" style={{ height: '14px', width: '120px', borderRadius: '6px', background: shimmer, marginBottom: '10px' }} />
          )}

          {/* Title + veg icon */}
          {!loading && item ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', lineHeight: 1.3, flex: 1 }}>
                {item.name}
              </div>
              {/* Veg / non-veg indicator */}
              <div style={{
                width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0, marginTop: '2px',
                border: `2px solid ${isVeg ? '#4ade80' : themeColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: isVeg ? '#4ade80' : themeColor,
                }} />
              </div>
            </div>
          ) : (
            <div className="shimmer" style={{ height: '22px', width: '70%', borderRadius: '6px', background: shimmer, marginBottom: '14px' }} />
          )}

          {/* Price + stock */}
          {!loading && item ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
                ₹{(item.price || 0).toLocaleString('en-IN')}
              </span>
              {isOutOfStock ? (
                <span style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px', padding: '3px 10px',
                  fontSize: '12px', fontWeight: 600, color: '#888',
                }}>
                  Out of stock
                </span>
              ) : stockCount && stockCount <= 5 ? (
                <span style={{
                  background: `${themeColor}18`,
                  border: `1px solid ${themeColor}35`,
                  borderRadius: '6px', padding: '3px 10px',
                  fontSize: '12px', fontWeight: 700, color: themeColor,
                }}>
                  Only {stockCount} left
                </span>
              ) : null}
            </div>
          ) : (
            <div className="shimmer" style={{ height: '18px', width: '100px', borderRadius: '6px', background: shimmer, marginBottom: '16px' }} />
          )}

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', marginBottom: '14px' }} />

          {/* View product details toggle */}
          <div
            className="detail-toggle"
            onClick={() => setDetailsOpen(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '2px 0',
              borderRadius: '6px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: themeColor }}>View product details</span>
            <ChevronDown
              size={14}
              color={themeColor}
              style={{ transition: 'transform 0.25s ease', transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </div>

          {/* Expanded details */}
          {detailsOpen && (
            <div style={{ marginTop: '14px', animation: 'detailsIn 0.2s ease both' }}>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', marginBottom: '14px' }} />

              {item?.description && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '5px' }}>Description</div>
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{item.description}</p>
                </div>
              )}



              {item?.tags?.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {item.tags.map((tag, i) => (
                      <div key={i} style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '20px', padding: '3px 10px',
                        fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)',
                      }}>
                        {tag}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BRAND CARD ── */}
      <div style={{ margin: '10px 10px 0' }}>
        <div
          className="brand-row"
          onClick={() => navigate(restaurantBasePath, { state: { activeNav: 'home' } })}
          style={{
            background: '#1C1E22',
            borderRadius: '16px',
            padding: '14px 16px',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}
        >
          {/* Logo */}
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
            background: restaurantLogo ? 'transparent' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {restaurantLogo ? (
              <img src={restaurantLogo} alt={restaurantName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '20px', fontWeight: 900, color: 'rgba(255,255,255,0.7)' }}>
                {restaurantName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{restaurantName}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Explore all products</div>
          </div>
          <ChevronRight size={18} color='rgba(255,255,255,0.25)' />
        </div>
      </div>

      {/* ── SIMILAR PRODUCTS ── */}
      {suggestions.length > 0 && (
        <div style={{ margin: '20px 0 0' }}>
          <div style={{ padding: '0 14px 12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>Similar products</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '0 14px 4px', scrollSnapType: 'x mandatory' }}>
            {suggestions.map((sug, i) => {
              const sugVeg = sug.veg !== false
              return (
                <div
                  key={i}
                  className="sug-card"
                  onClick={() => handleSuggestionClick(sug)}
                  style={{
                    flexShrink: 0, width: '148px',
                    background: '#1C1E22',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '14px', overflow: 'hidden',
                    scrollSnapAlign: 'start',
                  }}
                >
                  <div style={{ position: 'relative', height: '110px', background: '#222' }}>
                    <img
                      src={sug.img || FALLBACK_IMG}
                      alt={sug.name}
                      onError={e => { e.target.src = FALLBACK_IMG }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {/* Heart icon overlay */}
                    <button
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute', top: '7px', right: '7px',
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: 'rgba(30,30,30,0.8)',
                        border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Heart size={13} color="rgba(255,255,255,0.7)" fill="transparent" strokeWidth={2} />
                    </button>
                    {/* Veg indicator */}
                    <div style={{
                      position: 'absolute', bottom: '6px', left: '6px',
                      width: '15px', height: '15px', borderRadius: '3px',
                      border: `1.5px solid ${sugVeg ? '#4ade80' : themeColor}`,
                      background: 'rgba(0,0,0,0.6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: sugVeg ? '#4ade80' : themeColor }} />
                    </div>
                  </div>
                  <div style={{ padding: '10px 10px 12px' }}>
                    {sug.weight && (
                      <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, marginBottom: '3px' }}>{sug.weight}</div>
                    )}
                    <div style={{
                      fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                      lineHeight: 1.3, marginBottom: '6px',
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {sug.name}
                    </div>
                    {sug.rating && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '6px' }}>
                        <Star size={10} fill="#FFB800" color="#FFB800" />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
                          {sug.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                        ₹{(sug.price || 0).toLocaleString('en-IN')}
                      </div>
                      <button
                        onClick={e => e.stopPropagation()}
                        style={{
                          background: 'transparent',
                          border: `1.5px solid ${themeColor}`,
                          borderRadius: '8px', padding: '4px 10px',
                          fontSize: '11px', fontWeight: 800, color: themeColor,
                          cursor: 'pointer', letterSpacing: '0.04em',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = themeColor; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = themeColor }}
                      >
                        ADD
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
