import React, { useState, useEffect, useMemo } from 'react'
import { getMenuCategories, getMenuItems, createOrder } from '../lib/db'
import { getPublicImageUrl } from '../lib/imageUrl'
import { Plus, Minus, ShoppingBag } from 'lucide-react'

export default function AddOrdersPanel({
  restaurantId,
  accentStart,
  accentEnd,
  currency = '\u20b9',
  onBack,
  showToast,
}) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [cart, setCart] = useState({})
  const [loading, setLoading] = useState(true)
  const [tableNumber, setTableNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, allItems] = await Promise.all([
          getMenuCategories(restaurantId),
          getMenuItems(restaurantId),
        ])
        const catsArr = Array.isArray(cats) ? cats : []
        const itemsArr = Array.isArray(allItems) ? allItems : []
        setCategories(catsArr)
        setItems(itemsArr)
        if (catsArr.length) setActiveCategory(catsArr[0].id)
      } catch (e) {
        console.error('[AddOrders] load failed:', e)
        try {
          const saved = localStorage.getItem(`exzibo_menu_${restaurantId}`)
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) {
              setItems(parsed)
              const catIds = [...new Set(parsed.map(i => i.category_id).filter(Boolean))]
              if (catIds.length) {
                setCategories(catIds.map((id, i) => ({ id, name: `Category ${i + 1}` })))
                setActiveCategory(catIds[0])
              }
            }
          }
        } catch (lsErr) {
          // ignore
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [restaurantId])

  // Lock body scroll on mount on mobile only, restore on unmount
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.innerWidth > 768) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const filteredItems = useMemo(() => {
    if (!activeCategory) return items
    return items.filter(i => i.category_id === activeCategory)
  }, [items, activeCategory])

  const cartEntries = useMemo(() => Object.values(cart), [cart])
  const total = useMemo(
    () => cartEntries.reduce((sum, { item, qty }) => sum + (Number(item.price) || 0) * qty, 0),
    [cartEntries]
  )
  const itemCount = useMemo(() => cartEntries.reduce((sum, { qty }) => sum + qty, 0), [cartEntries])

  function addToCart(item) {
    setCart(prev => {
      const existing = prev[item.id]
      if (existing) {
        return { ...prev, [item.id]: { item, qty: existing.qty + 1 } }
      }
      return { ...prev, [item.id]: { item, qty: 1 } }
    })
  }

  function removeFromCart(itemId) {
    setCart(prev => {
      const existing = prev[itemId]
      if (!existing) return prev
      if (existing.qty <= 1) {
        const { [itemId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: { ...existing, qty: existing.qty - 1 } }
    })
  }

  async function placeOrder() {
    if (cartEntries.length === 0) {
      showToast('Please select at least one item')
      return
    }
    setPlacing(true)
    try {
      const orderItems = cartEntries.map(({ item, qty }) => ({
        name: item.name,
        qty,
        price: Number(item.price) || 0,
      }))
      const order = {
        id: `STAFF-${Date.now()}`,
        table: tableNumber.trim() || null,
        customerName: customerName.trim() || 'Staff Order',
        items: orderItems,
        status: 'pending',
        total,
        notes: 'Manual order created by staff',
      }
      await createOrder(restaurantId, order)
      showToast('Order placed successfully')
      onBack()
    } catch (e) {
      console.error('[AddOrders] place order failed:', e)
      showToast('Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  const cardBg = 'rgba(255,255,255,0.7)'
  const border = '1px solid rgba(255,255,255,0.6)'
  const shadow = '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)'

  // --- Render: Mobile viewport-locked shell with inner scroll ---
  return (
    <>
      <style>{`
        .add-orders-shell {
          /* Default: desktop - no fixed overlay, normal flow */
          position: relative;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
        }
        .add-orders-scroll {
          /* Desktop: normal flow, no extra scrolling container */
          overflow: visible;
        }
        .add-orders-inner {
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          box-sizing: border-box;
          padding-left: 4px;
          padding-right: 4px;
        }
        .add-orders-inputs {
          display: flex;
          gap: 12px;
        }
        .add-orders-inputs input {
          box-sizing: border-box;
          min-width: 0;
        }

        /* Mobile: lock to viewport, inner area scrolls */
        @media (max-width: 768px) {
          .add-orders-shell {
            position: fixed;
            inset: 0;
            z-index: 50;
            background: linear-gradient(145deg, #eef0f5 0%, #e8eaf0 100%);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            height: 100dvh;
            width: 100vw;
          }
          .add-orders-scroll {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-y: contain;
          }
          .add-orders-inner {
            padding-top: 78px;       /* fixed header height */
            padding-bottom: 150px;   /* bottom nav + FAB clearance */
            padding-left: 16px;
            padding-right: 16px;
            width: 100%;
            max-width: 100%;
            margin: 0;
          }
          .add-orders-title {
            font-size: 22px !important;
          }
          .add-orders-inputs {
            flex-direction: column !important;
          }
          .add-orders-inputs input {
            font-size: 16px !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .add-orders-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div className="add-orders-shell">
        <div className="add-orders-scroll">
          <div className="add-orders-inner" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 4px 16px' }}>
              <h1
                className="add-orders-title"
                style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}
              >
                ADD ORDERS
              </h1>
              {itemCount > 0 && (
                <div style={{
                  padding: '6px 14px',
                  background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                  borderRadius: '50px', color: '#fff',
                  fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
                  boxShadow: `0 4px 14px ${accentStart}60`,
                }}>
                  {itemCount} ITEM{itemCount > 1 ? 'S' : ''}
                </div>
              )}
            </div>

            {/* Inputs */}
            <div
              className="add-orders-inputs"
              style={{
                background: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '18px', padding: '14px 16px', border, boxShadow: shadow,
              }}
            >
              <input
                placeholder="Table number"
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '12px',
                  border: '1px solid rgba(226,232,240,0.8)', fontSize: '14px', fontWeight: 600,
                  background: 'rgba(255,255,255,0.6)', color: '#0f172a',
                  outline: 'none',
                }}
              />
              <input
                placeholder="Customer name"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                style={{
                  flex: 2, padding: '10px 14px', borderRadius: '12px',
                  border: '1px solid rgba(226,232,240,0.8)', fontSize: '14px', fontWeight: 600,
                  background: 'rgba(255,255,255,0.6)', color: '#0f172a',
                  outline: 'none',
                }}
              />
            </div>

            {/* Category tabs */}
            {categories.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 2px' }}>
                {categories.map(cat => {
                  const active = cat.id === activeCategory
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      style={{
                        padding: '8px 16px', borderRadius: '12px', border: 'none',
                        cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                        whiteSpace: 'nowrap', flexShrink: 0,
                        background: active ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : 'rgba(255,255,255,0.6)',
                        color: active ? '#fff' : '#64748b',
                        boxShadow: active ? `0 4px 12px ${accentStart}50` : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Items */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '14px', fontWeight: 600 }}>
                Loading menu...
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '14px', fontWeight: 600 }}>
                No items in this category.
              </div>
            ) : (
              <div className="add-orders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                {filteredItems.map(item => {
                  const cartEntry = cart[item.id]
                  const qty = cartEntry ? cartEntry.qty : 0
                  const imgUrl = item.image ? getPublicImageUrl(item.image) : null
                  return (
                    <div key={item.id} style={{
                      background: cardBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                      borderRadius: '18px', border, boxShadow: shadow,
                      overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    }}>
                      {imgUrl && (
                        <div style={{ width: '100%', height: '140px', overflow: 'hidden' }}>
                          <img src={imgUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                          {item.name}
                        </div>
                        {item.description && (
                          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {item.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '6px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: accentStart }}>
                            {currency}{Number(item.price || 0).toFixed(0)}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {qty > 0 && (
                              <>
                                <button
                                  onClick={() => removeFromCart(item.id)}
                                  style={{
                                    width: '28px', height: '28px', borderRadius: '8px',
                                    background: 'rgba(239,68,68,0.12)', border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: '#ef4444',
                                  }}
                                >
                                  <Minus size={14} />
                                </button>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', minWidth: '20px', textAlign: 'center' }}>
                                  {qty}
                                </span>
                              </>
                            )}
                            <button
                              onClick={() => addToCart(item)}
                              style={{
                                width: '28px', height: '28px', borderRadius: '8px',
                                background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                                border: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#fff',
                                boxShadow: `0 2px 8px ${accentStart}50`,
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Cart summary */}
            {itemCount > 0 && (
              <div style={{
                background: cardBg, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px', border, boxShadow: shadow,
                padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingBag size={18} color={accentStart} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                      {itemCount} item{itemCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
                    {currency}{total.toFixed(0)}
                  </span>
                </div>
                <button
                  onClick={placeOrder}
                  disabled={placing}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                    cursor: placing ? 'wait' : 'pointer', fontSize: '15px', fontWeight: 800,
                    color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em',
                    background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                    boxShadow: `0 4px 14px ${accentStart}60`,
                    opacity: placing ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {placing ? 'Placing...' : 'Place Order'}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
