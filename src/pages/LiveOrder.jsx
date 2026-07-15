import React, { useState, useEffect, useCallback } from 'react'
import { Radio, Clock, Bell, Server, Database, Cpu, Wifi, ChevronDown, ChevronUp } from 'lucide-react'
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
  const { status: cfStatus, lastEvent: cfLastEvent, wsHost: cfWsHost } = useRealtimeOrders(selectedId, handleOrderEvent)

  // Polling fallback — fires every 30 s when the WebSocket is not open.
  // This ensures new orders appear without a page refresh even if the
  // Cloudflare Worker is temporarily unreachable or the socket is
  // still reconnecting. Has no effect while the socket is open because
  // ORDER_CREATED events arrive immediately via the WebSocket above.
  useEffect(() => {
    if (!selectedId || cfStatus === 'open') return
    const interval = setInterval(() => fetchOrders(selectedId), 30_000)
    return () => clearInterval(interval)
  }, [selectedId, cfStatus, fetchOrders])

  const [showArchitecture, setShowArchitecture] = useState(false)

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

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setShowArchitecture(v => !v)}
                title="View the Cloudflare Workers / Durable Objects realtime pipeline"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: showArchitecture ? 'rgba(232,50,26,0.14)' : '#151515',
                  color: showArchitecture ? '#E8321A' : '#ccc',
                  border: `1px solid ${showArchitecture ? 'rgba(232,50,26,0.3)' : '#2a2a2a'}`,
                  borderRadius: '10px', padding: '9px 14px', fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.02em',
                }}
              >
                <Cpu size={14} />
                REALTIME PIPELINE
                {showArchitecture ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

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
          </div>

          {showArchitecture && (
            <RealtimeArchitecturePanel
              status={cfStatus}
              lastEvent={cfLastEvent}
              wsHost={cfWsHost}
              restaurantId={selectedId}
            />
          )}

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

// Live "monitor" of the realtime order pipeline: Neon → backend API →
// Cloudflare Worker (REALTIME_URL) → Durable Object (per-restaurant room) →
// this browser's WebSocket (role=staff). Read-only — reflects the actual
// code path in src/lib/realtime-publisher.js, exzibo-realtime/src/index.ts,
// and src/hooks/useRealtimeOrders.js.
const STATUS_META = {
  idle:         { label: 'IDLE', color: '#666' },
  connecting:   { label: 'CONNECTING…', color: '#f59e0b' },
  reconnecting: { label: 'RECONNECTING…', color: '#f59e0b' },
  open:         { label: 'LIVE', color: '#22c55e' },
  closed:       { label: 'DISCONNECTED', color: '#EF4444' },
}

function agoLabel(ts) {
  if (!ts) return '—'
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 1) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.round(s / 60)}m ago`
}

function PipelineNode({ icon, title, subtitle, detail, accent, badge }) {
  return (
    <div style={{
      background: '#141414', border: `1px solid ${accent ? `${accent}40` : '#232323'}`,
      borderRadius: '14px', padding: '14px 16px', minWidth: '220px', flex: '1 1 220px',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '9px', flexShrink: 0,
            background: accent ? `${accent}1F` : 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{title}</div>
        </div>
        {badge}
      </div>
      <div style={{ fontSize: '11px', color: '#888', marginTop: '8px', lineHeight: 1.4 }}>{subtitle}</div>
      {detail && (
        <div style={{
          fontSize: '10.5px', color: '#666', marginTop: '8px', fontFamily: 'monospace',
          background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: '6px', padding: '6px 8px',
          overflowWrap: 'anywhere',
        }}>
          {detail}
        </div>
      )}
    </div>
  )
}

function Arrow({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#444', flexShrink: 0, padding: '0 2px', minWidth: '40px',
    }}>
      <div style={{ fontSize: '9px', color: '#555', marginBottom: '2px', textAlign: 'center', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: '18px', lineHeight: 1 }}>→</div>
    </div>
  )
}

function RealtimeArchitecturePanel({ status, lastEvent, wsHost, restaurantId }) {
  const meta = STATUS_META[status] || STATUS_META.idle
  const doName = restaurantId ? `restaurant:${restaurantId}` : '—'

  return (
    <div style={{
      background: '#101010', border: '1px solid #232323', borderRadius: '16px',
      padding: '18px', marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#aaa', letterSpacing: '0.06em' }}>
          CLOUDFLARE WORKERS + DURABLE OBJECTS — LIVE ORDER PIPELINE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: meta.color }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%', background: meta.color,
              boxShadow: status === 'open' ? `0 0 6px ${meta.color}` : 'none',
            }} />
            {meta.label}
          </span>
          <span style={{ fontSize: '11px', color: '#666' }}>
            Last event: {lastEvent ? `${lastEvent.type} (${agoLabel(lastEvent.time)})` : 'none yet'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', paddingBottom: '4px' }}>
        <PipelineNode
          icon={<Database size={15} color="#9AA0A6" />}
          title="Neon Postgres"
          subtitle="Source of truth. Order INSERT/UPDATE commits here first — realtime is a notification layer only."
          detail="menu/orders tables"
        />
        <Arrow label="on commit" />
        <PipelineNode
          icon={<Server size={15} color="#60A5FA" />}
          accent="#60A5FA"
          title="Backend API"
          subtitle="After a successful Neon write, fires a non-blocking POST with a Bearer secret. Never blocks the order response."
          detail={`publishOrderRealtimeEvent()\nserver.js · api/orders.js`}
        />
        <Arrow label="REALTIME_URL" />
        <PipelineNode
          icon={<Cpu size={15} color="#E8321A" />}
          accent="#E8321A"
          title="Cloudflare Worker"
          subtitle="Edge entrypoint. Routes /publish/order-event and /ws/restaurant/:id to the right Durable Object instance."
          detail={`POST /publish/order-event\nGET  /ws/restaurant/:id`}
        />
        <Arrow label="idFromName()" />
        <PipelineNode
          icon={<Radio size={15} color="#22c55e" />}
          accent="#22c55e"
          title="Durable Object"
          subtitle="One instance per restaurant — a stateful 'room' holding WebSocket Hibernation connections. Broadcasts to staff, or to the matching customer only."
          detail={`MyDurableObject\nid = ${doName}`}
        />
        <Arrow label="wss://" />
        <PipelineNode
          icon={<Wifi size={15} color={meta.color} />}
          accent={meta.color}
          title="This dashboard"
          subtitle="Browser WebSocket, role=staff — receives every ORDER_CREATED / ORDER_STATUS_CHANGED / ORDER_CANCELLED event for the selected restaurant and refetches from Neon."
          detail={wsHost ? `wss://${wsHost}/ws/restaurant/…?role=staff` : '—'}
          badge={
            <span style={{
              fontSize: '9px', fontWeight: 800, padding: '3px 7px', borderRadius: '999px',
              background: `${meta.color}22`, color: meta.color, textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>
              {meta.label}
            </span>
          }
        />
      </div>

      <div style={{ fontSize: '10.5px', color: '#555', marginTop: '14px', lineHeight: 1.5 }}>
        Files: <code style={{ color: '#777' }}>src/lib/realtime-publisher.js</code> · <code style={{ color: '#777' }}>exzibo-realtime/src/index.ts</code> · <code style={{ color: '#777' }}>src/hooks/useRealtimeOrders.js</code>.
        The frontend only ever connects with <code style={{ color: '#777' }}>role=staff</code> or <code style={{ color: '#777' }}>role=customer</code> — it never holds <code style={{ color: '#777' }}>REALTIME_PUBLISH_SECRET</code>, which stays server-side.
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
