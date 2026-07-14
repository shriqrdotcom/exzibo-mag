import React, { useState, useEffect, useCallback } from 'react'
import { Radio, Clock, Bell } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { getRestaurants, getOrders } from '../lib/db'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders'

const STATUS_COLORS = {
  pending:   { bg: 'rgba(232,50,26,0.14)', fg: '#E8321A' },
  confirmed: { bg: 'rgba(76,175,80,0.14)', fg: '#4CAF50' },
  ready:     { bg: 'rgba(33,150,243,0.14)', fg: '#2196F3' },
  completed: { bg: 'rgba(120,120,120,0.14)', fg: '#9AA0A6' },
  cancelled: { bg: 'rgba(120,120,120,0.14)', fg: '#9AA0A6' },
  rejected:  { bg: 'rgba(120,120,120,0.14)', fg: '#9AA0A6' },
}

function timeLabel(order) {
  const raw = order.submittedAt || order.createdAt || ''
  try {
    const d = new Date(raw)
    if (!isNaN(d)) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {}
  return ''
}

// Live, realtime-driven order feed. Connects to the Cloudflare Worker
// (via useRealtimeOrders) for the selected restaurant and refetches the
// Neon-backed order list on every ORDER_CREATED / ORDER_STATUS_CHANGED /
// ORDER_CANCELLED event, exactly like the AdminDashboard order panel does.
export default function LiveOrder() {
  const [restaurants, setRestaurants] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // Load restaurant list once, then default to the first one (or the last
  // one the admin had selected, if it still exists).
  useEffect(() => {
    let cancelled = false
    async function loadRestaurants() {
      let list = []
      try {
        list = await getRestaurants()
      } catch { /* fall through to local cache */ }
      if (!Array.isArray(list) || list.length === 0) {
        try { list = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]') } catch { list = [] }
      }
      if (cancelled) return
      setRestaurants(list)
      const saved = localStorage.getItem('exzibo_live_order_selected')
      const fallback = list.find(r => r.id === saved)?.id || list[0]?.id || ''
      setSelectedId(fallback)
    }
    loadRestaurants()
    return () => { cancelled = true }
  }, [])

  const fetchOrders = useCallback(async (restaurantId) => {
    if (!restaurantId) { setOrders([]); setLoading(false); return }
    try {
      const data = await getOrders(restaurantId)
      setOrders(data.slice().sort((a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt)))
    } catch { /* noop — keep last known list */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchOrders(selectedId)
    if (selectedId) localStorage.setItem('exzibo_live_order_selected', selectedId)
  }, [selectedId, fetchOrders])

  // Any realtime event for this restaurant → refetch (Neon stays the
  // source of truth, same pattern used by AdminDashboard).
  const handleOrderEvent = useCallback(() => { fetchOrders(selectedId) }, [selectedId, fetchOrders])
  useRealtimeOrders(selectedId, handleOrderEvent)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0A' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="LIVE ORDER" />
        <main style={{ flex: 1, padding: '28px 40px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Radio size={18} color="#E8321A" />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Live incoming orders</div>
                <div style={{ fontSize: '12px', color: '#777' }}>Updates instantly as customers place orders</div>
              </div>
            </div>

            {restaurants.length > 1 && (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                style={{
                  background: '#151515', color: '#fff', border: '1px solid #2a2a2a',
                  borderRadius: '10px', padding: '10px 14px', fontSize: '13px', fontWeight: 600,
                }}
              >
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>{r.name || r.id}</option>
                ))}
              </select>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#666', padding: '80px 0' }}>Loading live orders…</div>
          ) : !selectedId ? (
            <EmptyState message="No restaurant available yet." />
          ) : orders.length === 0 ? (
            <EmptyState message="No orders yet — new orders will appear here instantly." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {orders.map(order => {
                const colors = STATUS_COLORS[order.status] || STATUS_COLORS.pending
                const itemCount = (order.items || []).reduce((s, it) => s + (it.qty || 1), 0)
                return (
                  <div key={order.id} style={{
                    background: '#141414', border: '1px solid #232323', borderRadius: '16px',
                    padding: '16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bell size={14} color={colors.fg} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                          {order.customerName || `Table ${order.table || '—'}`}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
                        background: colors.bg, color: colors.fg, textTransform: 'uppercase',
                      }}>
                        {order.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                      {itemCount} item{itemCount === 1 ? '' : 's'} · Table {order.table || '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff' }}>₹{order.grandTotal?.toFixed?.(2) ?? order.grandTotal}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#777' }}>
                        <Clock size={12} /> {timeLabel(order)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div style={{ textAlign: 'center', color: '#555', padding: '80px 0' }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '14px',
        background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <Radio size={26} color="#E8321A" />
      </div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#888' }}>{message}</div>
    </div>
  )
}
