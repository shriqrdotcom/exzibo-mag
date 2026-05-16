import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { TrendingUp, Filter, Download, ChevronLeft, ChevronRight, Plus, Trash2, Clock, X, Pencil, Play, ExternalLink, LayoutDashboard, ShieldCheck, ImageDown, Upload, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import { getRestaurants, updateRestaurant, softDeleteRestaurant, getRestaurantsCreatedThisMonth } from '../lib/db'

function getAvatarFromName(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function toISODateInput(d) {
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function formatDDMMYYYY(d) {
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`
}

const PLAN_OPTIONS = ['STARTER', 'GROWTH', 'SCALE', 'CUSTOMISED']
const PLAN_DOT_COLOR = {
  STARTER: '#3B82F6',
  GROWTH: '#22c55e',
  SCALE: '#A855F7',
  CUSTOMISED: '#F59E0B',
}

function normalizePlan(p) {
  if (!p) return 'STARTER'
  const up = String(p).toUpperCase()
  if (PLAN_OPTIONS.includes(up)) return up
  if (up === 'PLUS') return 'STARTER'
  if (up === 'PRO') return 'GROWTH'
  if (up === 'MAX') return 'SCALE'
  return 'STARTER'
}

const editInputStyle = {
  width: '100%',
  padding: '11px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  color: '#fff',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: '10px',
      fontWeight: 700,
      color: '#888',
      letterSpacing: '0.1em',
      marginBottom: '8px',
      textTransform: 'uppercase',
    }}>{children}</div>
  )
}

function monthKey(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function monthLabelFromKey(key) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function formatRevenue(n) {
  if (!isFinite(n) || n <= 0) return '₹0'
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function gatherPaymentEntries() {
  let data = {}
  try { data = JSON.parse(localStorage.getItem('exzibo_payment_amounts') || '{}') } catch {}
  const entries = []
  Object.values(data || {}).forEach(entry => {
    if (Array.isArray(entry?.history)) {
      entry.history.forEach(h => {
        const amt = parseFloat(h?.amount)
        if (h && h.id && isFinite(amt) && h.loggedAt) {
          entries.push({ id: h.id, amount: amt, date: h.loggedAt })
        }
      })
    }
    const ns = entry?.nextSub
    if (ns && ns.id && isFinite(parseFloat(ns.amount)) && ns.loggedAt) {
      entries.push({ id: ns.id, amount: parseFloat(ns.amount), date: ns.loggedAt })
    }
  })
  return entries
}

function syncRevenueLedger() {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 12)
  cutoff.setDate(1)
  cutoff.setHours(0, 0, 0, 0)

  let existing = []
  try { existing = JSON.parse(localStorage.getItem('exzibo_revenue_entries') || '[]') } catch {}

  const merged = {}
  ;[...existing, ...gatherPaymentEntries()].forEach(e => {
    if (!e || !e.id || !e.date) return
    const t = new Date(e.date).getTime()
    if (!isFinite(t) || t < cutoff.getTime()) return
    merged[e.id] = { id: e.id, amount: parseFloat(e.amount) || 0, date: e.date }
  })
  const entries = Object.values(merged)
  localStorage.setItem('exzibo_revenue_entries', JSON.stringify(entries))

  const todayKey = monthKey(new Date())
  let meta = {}
  try { meta = JSON.parse(localStorage.getItem('exzibo_revenue_meta') || '{}') } catch {}
  if (meta.lastResetMonth !== todayKey) {
    localStorage.setItem('exzibo_revenue_meta', JSON.stringify({ lastResetMonth: todayKey }))
  }
  return entries
}

function mapRow(r) {
  const startDate = r.start_date || r.createdAt || new Date().toISOString()
  const endDate   = r.end_date   || (() => { const d = new Date(startDate); d.setDate(d.getDate() + 30); return d.toISOString() })()
  return {
    id:        r.id,
    uid:       r.uid || r.id,
    name:      (r.name || '').toUpperCase(),
    slug:      r.slug || '',
    status:    r.status === 'paused' ? 'PAUSED' : r.status === 'demo' ? 'DEMO' : 'RUNNING',
    startDate,
    endDate,
    plan:      normalizePlan(r.plan),
    place:     (r.place || '—').toUpperCase().slice(0, 2) || '—',
    note:      r.note || '',
    avatar:    getAvatarFromName(r.name || '?'),
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get('section')
  const { exitRoleView } = useRole()
  const [currentPage, setCurrentPage] = useState(1)
  const [restaurants, setRestaurants] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteStage, setDeleteStage] = useState('initial')
  const [confirmUidInput, setConfirmUidInput] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [toast, setToast] = useState('')
  const [revenueEntries, setRevenueEntries] = useState([])
  const [revenueHistoryOpen, setRevenueHistoryOpen] = useState(false)
  const [monthRestaurantCount, setMonthRestaurantCount] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)

  const fetchRestaurants = useCallback(async () => {
    try {
      const rows = await getRestaurants()
      // Keep localStorage in sync so MasterControl and other local-first code works
      try { localStorage.setItem('exzibo_restaurants', JSON.stringify(rows)) } catch { /* noop */ }
      setRestaurants(rows.map(mapRow))
    } catch {
      const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
      // Filter out any rows marked as soft-deleted in localStorage
      let softDeleted = new Set()
      try { softDeleted = new Set(JSON.parse(localStorage.getItem('exzibo_soft_deleted_ids') || '[]')) } catch {}
      const active = saved.filter(r => !r.is_deleted && !softDeleted.has(r.id))
      setRestaurants(active.map(mapRow))
    }
  }, [])

  function openViewModal(r) {
    setViewTarget({ uid: r.uid, state: r.place === '—' ? '' : r.place, note: r.note || '' })
  }

  async function persistRestaurantPatch(id, patch) {
    try {
      await updateRestaurant(id, patch)
    } catch {
      const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
      localStorage.setItem('exzibo_restaurants', JSON.stringify(saved.map(r => r.id === id ? { ...r, ...patch } : r)))
    }
    fetchRestaurants()
  }

  function toggleRowStatus(r) {
    persistRestaurantPatch(r.id, { status: r.status === 'RUNNING' ? 'paused' : 'active' })
  }

  function openEditModal(r) {
    setEditDraft({
      id: r.id,
      uid: r.uid,
      status: r.status,
      place: r.place === '—' ? '' : r.place,
      note: r.note || '',
    })
  }

  function closeEditModal() {
    setEditDraft(null)
  }

  function saveEdit() {
    if (!editDraft) return
    const place = (editDraft.place || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
    const note  = (editDraft.note || '').slice(0, 20)
    persistRestaurantPatch(editDraft.id, {
      status: editDraft.status === 'PAUSED' ? 'paused' : editDraft.status === 'DEMO' ? 'demo' : 'active',
      place:  place || '—',
      note,
    })
    setEditDraft(null)
  }

  function openDeleteModal(r) {
    setDeleteTarget(r)
    setDeleteStage('initial')
    setConfirmUidInput('')
    setDeleteError('')
  }

  function closeDeleteModal() {
    setDeleteTarget(null)
    setDeleteStage('initial')
    setConfirmUidInput('')
    setDeleteError('')
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    if (confirmUidInput.trim() !== String(deleteTarget.uid)) {
      setDeleteError('UID does not match. Please try again.')
      return
    }
    try {
      await softDeleteRestaurant(deleteTarget.id)
    } catch {
      // Fallback: mark as deleted in localStorage
      const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
      localStorage.setItem('exzibo_restaurants', JSON.stringify(
        saved.map(r => (r.id === deleteTarget.id || (r.uid || r.id) === deleteTarget.uid)
          ? { ...r, is_deleted: true, deleted_at: new Date().toISOString() }
          : r
        )
      ))
    }
    fetchRestaurants()
    fetchOrderCount()
    closeDeleteModal()
    setToast('Restaurant moved to Deleted Restaurants')
    setTimeout(() => setToast(''), 2800)
  }

  useLayoutEffect(() => {
    exitRoleView()
  }, [])

  const fetchOrderCount = useCallback(async () => {
    try {
      const count = await getRestaurantsCreatedThisMonth()
      setMonthRestaurantCount(count)
    } catch {
      setMonthRestaurantCount(0)
    }
  }, [])

  useEffect(() => {
    fetchRestaurants()
    fetchOrderCount()
    setRevenueEntries(syncRevenueLedger())
    const onFocus = () => {
      setRevenueEntries(syncRevenueLedger())
      fetchOrderCount()
    }
    const onStorage = (e) => {
      if (!e.key || e.key === 'exzibo_payment_amounts' || e.key === 'exzibo_revenue_entries') {
        setRevenueEntries(syncRevenueLedger())
      }
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [fetchRestaurants, fetchOrderCount])

  const currentMonthKey = monthKey(new Date())
  const currentMonthRevenue = revenueEntries
    .filter(e => monthKey(e.date) === currentMonthKey)
    .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const currentMonthOrderCount = revenueEntries
    .filter(e => monthKey(e.date) === currentMonthKey)
    .length
  const currentMonthAbbr = new Date()
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase()
  const revenueHistory = (() => {
    const map = {}
    revenueEntries.forEach(e => {
      const k = monthKey(e.date)
      if (k === currentMonthKey) return
      map[k] = (map[k] || 0) + (parseFloat(e.amount) || 0)
    })
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
  })()

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          {activeSection === 'image-compressor' ? (
            <ImageCompressor />
          ) : activeSection === 'demo' ? (
            <DemoWebsitesPanel
              restaurants={restaurants.filter(r => r.status === 'DEMO')}
              onEdit={openEditModal}
              onDelete={openDeleteModal}
            />
          ) : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <KPICard
              label="ACTIVE OPERATIONS"
              value={restaurants.filter(r => r.status === 'RUNNING' || r.status === 'PAUSED').length.toLocaleString('en-IN')}
            />
            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '28px',
              position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>
                  TOTAL REVENUE
                </div>
                <button
                  type="button"
                  onClick={() => setRevenueHistoryOpen(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '5px 10px',
                    background: '#22c55e',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em',
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(34,197,94,0.35)',
                  }}
                >
                  <Clock size={11} /> HISTORY
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px' }}>
                <span style={{ fontSize: '42px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {formatRevenue(currentMonthRevenue)}
                </span>
              </div>
            </div>
            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '28px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '16px', textTransform: 'uppercase' }}>
                NEW RESTAURANTS
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>
                {currentMonthAbbr}
              </div>
              {monthRestaurantCount === null ? (
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  border: '3px solid rgba(232,50,26,0.15)',
                  borderTopColor: '#E8321A',
                  animation: 'spin 0.8s linear infinite',
                  marginTop: '4px',
                }} />
              ) : (
                <span style={{ fontSize: '42px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {monthRestaurantCount.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </div>

          <div style={{
            background: '#111',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '20px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px 28px',
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>List of Active Users</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <IconBtn icon={<Filter size={14} />} label="FILTER" />
                <IconBtn icon={<Download size={14} />} label="EXPORT" />
              </div>
            </div>

            {restaurants.filter(r => r.status !== 'DEMO').length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '80px 24px', textAlign: 'center',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{
                  width: '60px', height: '60px', borderRadius: '18px',
                  background: 'rgba(232,50,26,0.08)',
                  border: '2px dashed rgba(232,50,26,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '26px', marginBottom: '20px',
                }}>🍽️</div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>No Active Users Yet</div>
                <p style={{ fontSize: '13px', color: '#555', maxWidth: '280px', lineHeight: 1.6, marginBottom: '24px' }}>
                  Add your first customer to see them appear in the active users list.
                </p>
                <button
                  onClick={() => navigate('/create-website')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '11px 22px',
                    background: '#E8321A',
                    border: 'none', borderRadius: '50px',
                    color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
                    cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(232,50,26,0.4)',
                  }}
                >
                  <Plus size={13} /> ADD CUSTOMER
                </button>
              </div>
            ) : (
            <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {['UID', 'STATUS', 'TIMELINE', 'PLAN', 'PLACE', 'ACTIONS'].map(col => (
                    <th key={col} style={{
                      padding: '14px 28px',
                      textAlign: 'left',
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      color: '#555',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {restaurants.filter(r => r.status !== 'DEMO').map((r, i) => {
                  const statusDot = r.status === 'RUNNING' ? '#22c55e' : '#9CA3AF'
                  const statusLabelColor = r.status === 'RUNNING' ? '#22c55e' : '#aaa'
                  const planDot = PLAN_DOT_COLOR[r.plan] || '#888'
                  return (
                    <tr key={r.uid + i} style={{
                      borderBottom: i < restaurants.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.02em' }}>{r.uid}</div>
                        <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{r.name}</div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <button
                          type="button"
                          onClick={() => toggleRowStatus(r)}
                          title="Click to toggle status"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '7px',
                            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                          }}
                        >
                          <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: statusDot,
                            boxShadow: `0 0 8px ${statusDot}`,
                            display: 'inline-block',
                          }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: statusLabelColor, letterSpacing: '0.04em' }}>{r.status}</span>
                        </button>
                      </td>
                      <td style={{ padding: '20px 28px', color: '#ccc', fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                        {formatDDMMYYYY(r.startDate)} <span style={{ color: '#555', margin: '0 4px' }}>TO</span> {formatDDMMYYYY(r.endDate)}
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: planDot,
                            boxShadow: `0 0 8px ${planDot}`,
                            display: 'inline-block',
                          }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ddd', letterSpacing: '0.06em' }}>{r.plan}</span>
                        </div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <button
                          type="button"
                          onClick={() => openViewModal(r)}
                          title="View details"
                          style={{
                            display: 'inline-block',
                            padding: '5px 10px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(232,50,26,0.12)'
                            e.currentTarget.style.borderColor = 'rgba(232,50,26,0.4)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                          }}
                        >{r.place}</button>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <EditRowBtn onClick={() => openEditModal(r)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 28px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: '12px', color: '#555' }}>{(() => { const n = restaurants.filter(r => r.status !== 'DEMO').length; return `Showing ${n} ${n === 1 ? 'user' : 'users'}` })()}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PageBtn icon={<ChevronLeft size={14} />} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} />
                {[1, 2, 3].map(p => (
                  <button key={p} onClick={() => setCurrentPage(p)} style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: currentPage === p ? '#E8321A' : 'rgba(255,255,255,0.06)',
                    border: 'none',
                    color: '#fff', fontSize: '13px', fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: currentPage === p ? '0 0 16px rgba(232,50,26,0.4)' : 'none',
                    transition: 'all 0.2s',
                  }}>{p}</button>
                ))}
                <PageBtn icon={<ChevronRight size={14} />} onClick={() => setCurrentPage(p => Math.min(3, p + 1))} />
              </div>
            </div>
            </>
            )}
          </div>
          </>
          )}
        </main>
      </div>

      <button
        onClick={() => navigate('/create-website')}
        style={{
          position: 'fixed', bottom: '28px', right: '28px',
          width: '52px', height: '52px', borderRadius: '50%',
          background: '#E8321A',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 0 30px rgba(232,50,26,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(232,50,26,0.7)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.5)' }}
      >
        <Plus size={22} />
      </button>

      {deleteTarget && (
        <div
          onClick={closeDeleteModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '440px',
              background: '#141414',
              border: '1px solid rgba(232,50,26,0.3)',
              borderRadius: '18px',
              padding: '28px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(232,50,26,0.15)',
              position: 'relative',
            }}
          >
            <button
              onClick={closeDeleteModal}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '30px', height: '30px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#888', cursor: 'pointer',
                fontSize: '14px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>

            <div style={{
              fontSize: '15px', fontWeight: 800, color: '#E8321A',
              letterSpacing: '0.06em', marginBottom: '18px', paddingRight: '40px',
            }}>
              MOVE TO DELETED RESTAURANTS
            </div>

            <div style={{
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: '#666', fontWeight: 700, letterSpacing: '0.04em', minWidth: '110px' }}>UID:</span>
                <span style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700 }}>{deleteTarget.uid}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: '#666', fontWeight: 700, letterSpacing: '0.04em', minWidth: '110px' }}>Restaurant Name:</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>{deleteTarget.name}</span>
              </div>
            </div>

            {deleteStage === 'initial' && (
              <button
                onClick={() => { setDeleteStage('confirm'); setDeleteError('') }}
                style={{
                  width: '100%', padding: '13px',
                  background: '#E8321A', border: 'none', borderRadius: '10px',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  letterSpacing: '0.08em', cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(232,50,26,0.4)',
                }}
              >
                DELETE
              </button>
            )}

            {deleteStage === 'confirm' && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  ENTER UID TO CONFIRM
                </div>
                <input
                  type="text"
                  autoFocus
                  value={confirmUidInput}
                  onChange={e => { setConfirmUidInput(e.target.value); setDeleteError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirmDelete() }}
                  placeholder={String(deleteTarget.uid)}
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${deleteError ? 'rgba(232,50,26,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '10px',
                    color: '#fff', fontSize: '14px', fontFamily: 'monospace',
                    outline: 'none', boxSizing: 'border-box',
                    marginBottom: deleteError ? '8px' : '14px',
                  }}
                />
                {deleteError && (
                  <div style={{ fontSize: '12px', color: '#E8321A', fontWeight: 600, marginBottom: '14px' }}>
                    {deleteError}
                  </div>
                )}
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    width: '100%', padding: '13px',
                    background: '#E8321A', border: 'none', borderRadius: '10px',
                    color: '#fff', fontSize: '13px', fontWeight: 800,
                    letterSpacing: '0.08em', cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(232,50,26,0.4)',
                  }}
                >
                  CONFIRM
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {viewTarget && (
        <div
          onClick={() => setViewTarget(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '380px',
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '18px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setViewTarget(null)}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '30px', height: '30px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#888', cursor: 'pointer',
                fontSize: '14px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>

            <div style={{
              fontSize: '15px', fontWeight: 800,
              letterSpacing: '0.06em', marginBottom: '4px', paddingRight: '40px',
              color: '#fff', textTransform: 'uppercase',
            }}>
              CUSTOMER DETAILS
            </div>
            <div style={{
              fontSize: '11px', fontWeight: 700, color: '#666',
              letterSpacing: '0.08em', marginBottom: '20px', fontFamily: 'monospace',
            }}>
              UID {viewTarget.uid}
            </div>

            <FieldLabel>STATE</FieldLabel>
            <div style={{
              padding: '11px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '14px',
              fontFamily: 'monospace',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '16px',
            }}>
              {viewTarget.state || <span style={{ color: '#555', fontWeight: 500, letterSpacing: 0 }}>Not set</span>}
            </div>

            <FieldLabel>NOTE</FieldLabel>
            <div style={{
              padding: '11px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '13px',
              minHeight: '42px',
              wordBreak: 'break-word',
              marginBottom: '8px',
            }}>
              {viewTarget.note || <span style={{ color: '#555' }}>No note added</span>}
            </div>

            <div style={{
              fontSize: '11px', color: '#555', marginTop: '14px',
              textAlign: 'center', fontStyle: 'italic',
            }}>
              Use the pencil icon to edit
            </div>
          </div>
        </div>
      )}

      {editDraft && (
        <div
          onClick={closeEditModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '460px',
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '18px',
              padding: '28px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              position: 'relative',
            }}
          >
            <button
              onClick={closeEditModal}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '30px', height: '30px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#888', cursor: 'pointer',
                fontSize: '14px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>

            <div style={{
              fontSize: '15px', fontWeight: 800,
              letterSpacing: '0.06em', marginBottom: '6px', paddingRight: '40px',
              color: '#fff', textTransform: 'uppercase',
            }}>
              EDIT CUSTOMER
            </div>
            <div style={{
              fontSize: '11px', fontWeight: 700, color: '#666',
              letterSpacing: '0.08em', marginBottom: '20px', fontFamily: 'monospace',
            }}>
              UID {editDraft.uid}
            </div>

            <FieldLabel>STATUS</FieldLabel>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              {['RUNNING', 'PAUSED', 'DEMO'].map(s => {
                const active = editDraft.status === s
                const dot = s === 'RUNNING' ? '#22c55e' : s === 'DEMO' ? '#F59E0B' : '#9CA3AF'
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditDraft(d => ({ ...d, status: s }))}
                    style={{
                      flex: 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      padding: '10px 12px',
                      background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${active ? dot : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '10px',
                      color: active ? '#fff' : '#888',
                      fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
                      cursor: 'pointer',
                      boxShadow: active ? `0 0 14px ${dot}55` : 'none',
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, boxShadow: `0 0 8px ${dot}` }} />
                    {s}
                  </button>
                )
              })}
            </div>

            <FieldLabel>STATE</FieldLabel>
            <input
              type="text"
              maxLength={2}
              value={editDraft.place}
              onChange={e => setEditDraft(d => ({ ...d, place: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) }))}
              placeholder="e.g. WB"
              style={{
                ...editInputStyle,
                marginBottom: '18px',
                fontFamily: 'monospace',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            />

            <div style={{ position: 'relative', marginBottom: '24px' }}>
              <input
                type="text"
                maxLength={20}
                value={editDraft.note}
                onChange={e => setEditDraft(d => ({ ...d, note: e.target.value.slice(0, 20) }))}
                placeholder="Add note..."
                style={{ ...editInputStyle, paddingRight: '52px' }}
              />
              <span style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '11px',
                fontWeight: 600,
                color: '#666',
                fontFamily: 'monospace',
                pointerEvents: 'none',
              }}>{(editDraft.note || '').length}/20</span>
            </div>

            <button
              onClick={saveEdit}
              style={{
                width: '100%', padding: '13px',
                background: '#E8321A', border: 'none', borderRadius: '10px',
                color: '#fff', fontSize: '13px', fontWeight: 800,
                letterSpacing: '0.08em', cursor: 'pointer',
                boxShadow: '0 0 20px rgba(232,50,26,0.4)',
              }}
            >
              SAVE CHANGES
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '32px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15,15,15,0.95)',
          border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: '50px',
          padding: '12px 22px',
          fontSize: '13px', fontWeight: 700, color: '#4ade80',
          zIndex: 2100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(74,222,128,0.1)',
          whiteSpace: 'nowrap', letterSpacing: '0.02em',
        }}>
          {toast}
        </div>
      )}

      {revenueHistoryOpen && (
        <div
          onClick={() => setRevenueHistoryOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '460px',
              background: 'linear-gradient(180deg, rgba(34,197,94,0.08) 0%, #0c1410 100%)',
              border: '1px solid rgba(34,197,94,0.35)',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(34,197,94,0.15)',
              maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: '#22c55e', marginBottom: '4px' }}>
                  📊 REVENUE HISTORY
                </div>
                <div style={{ fontSize: '12px', color: '#7d9b8a' }}>Last 12 months</div>
              </div>
              <button
                type="button"
                onClick={() => setRevenueHistoryOpen(false)}
                style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#aaa',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{
              background: 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '16px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#22c55e', marginBottom: '4px' }}>
                {monthLabelFromKey(currentMonthKey).toUpperCase()} (CURRENT)
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>
                {formatRevenue(currentMonthRevenue)}
              </div>
            </div>

            {revenueHistory.length === 0 ? (
              <div style={{
                padding: '24px', textAlign: 'center',
                color: '#5f7a6c', fontSize: '12px',
                background: 'rgba(34,197,94,0.04)',
                border: '1px dashed rgba(34,197,94,0.2)',
                borderRadius: '12px',
              }}>
                No prior months with revenue yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {revenueHistory.map(([key, total]) => (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: 'rgba(34,197,94,0.04)',
                    border: '1px solid rgba(34,197,94,0.15)',
                    borderRadius: '10px',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#cfe9d8' }}>
                      {monthLabelFromKey(key)}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#22c55e' }}>
                      {formatRevenue(total)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, badge, badgeIcon }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '20px',
      padding: '28px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '16px', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px' }}>
        <span style={{ fontSize: '42px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</span>
        {badge && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'rgba(232,50,26,0.15)',
            border: '1px solid rgba(232,50,26,0.2)',
            borderRadius: '50px',
            padding: '4px 10px',
            fontSize: '11px', fontWeight: 700, color: '#E8321A',
            marginBottom: '6px',
          }}>
            {badgeIcon}{badge}
          </span>
        )}
      </div>
    </div>
  )
}

function IconBtn({ icon, label }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px',
        background: hov ? 'rgba(255,255,255,0.06)' : 'transparent',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        color: '#888',
        fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {icon}{label}
    </button>
  )
}

function PageBtn({ icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '36px', height: '36px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.06)',
      border: 'none',
      color: '#888',
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#888' }}
    >{icon}</button>
  )
}

function EditMenuBtn({ onClick, active }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '9px 16px',
        background: hov ? '#E8321A' : 'transparent',
        border: `1px ${active ? 'dashed' : 'solid'} ${hov ? '#E8321A' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '10px',
        color: hov ? '#fff' : '#aaa',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: hov ? '0 0 16px rgba(232,50,26,0.3)' : 'none',
      }}
    >
      EDIT MENU
    </button>
  )
}

function EditRowBtn({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Edit"
      style={{
        width: '32px', height: '32px',
        background: hov ? 'rgba(232,50,26,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hov ? 'rgba(232,50,26,0.5)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '9px',
        color: hov ? '#E8321A' : '#888',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}
    >
      <Pencil size={14} />
    </button>
  )
}

function DeleteBtn({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Delete"
      style={{
        width: '32px', height: '32px',
        background: hov ? 'rgba(232,50,26,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hov ? 'rgba(232,50,26,0.5)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '9px',
        color: hov ? '#E8321A' : '#888',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}
    >
      <Trash2 size={14} />
    </button>
  )
}

function ImageCompressor() {
  const [original, setOriginal] = useState(null)   // { file, url, size, w, h }
  const [compressed, setCompressed] = useState(null) // { url, size, blob }
  const [quality, setQuality] = useState(80)
  const [format, setFormat] = useState('image/jpeg')
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const canvasRef = React.useRef(null)

  function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setOriginal({ file, url, size: file.size, w: img.naturalWidth, h: img.naturalHeight })
      setCompressed(null)
    }
    img.src = url
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    loadFile(e.dataTransfer.files[0])
  }

  function onInputChange(e) { loadFile(e.target.files[0]) }

  const compress = useCallback(() => {
    if (!original) return
    setProcessing(true)
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      canvas.width = original.w
      canvas.height = original.h
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (format === 'image/png') {
        ctx.fillStyle = 'transparent'
      }
      ctx.drawImage(img, 0, 0)
      const q = format === 'image/png' ? undefined : quality / 100
      canvas.toBlob(blob => {
        if (!blob) { setProcessing(false); return }
        const url = URL.createObjectURL(blob)
        setCompressed({ url, size: blob.size, blob })
        setProcessing(false)
      }, format, q)
    }
    img.src = original.url
  }, [original, quality, format])

  useEffect(() => {
    if (original) compress()
  }, [original, quality, format, compress])

  function handleDownload() {
    if (!compressed) return
    const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg'
    const a = document.createElement('a')
    a.href = compressed.url
    a.download = `compressed-${Date.now()}.${ext}`
    a.click()
  }

  function reset() { setOriginal(null); setCompressed(null); setQuality(80); setFormat('image/jpeg') }

  const saving = original && compressed ? Math.round((1 - compressed.size / original.size) * 100) : 0

  const cardStyle = {
    background: '#111',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '20px',
    padding: '28px',
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ImageDown size={20} color="#E8321A" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>Image Compressor</h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>Compress JPG, PNG & WebP — fully in-browser, nothing uploaded</p>
          </div>
          {original && (
            <button onClick={reset} style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '50px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#888', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8321A'; e.currentTarget.style.color = '#E8321A' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#888' }}
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Hidden canvas for compression */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {!original ? (
        /* Drop zone */
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            ...cardStyle,
            border: `2px dashed ${dragging ? '#E8321A' : 'rgba(255,255,255,0.1)'}`,
            background: dragging ? 'rgba(232,50,26,0.04)' : '#111',
            minHeight: '320px',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => document.getElementById('img-file-input').click()}
        >
          <input id="img-file-input" type="file" accept="image/*" onChange={onInputChange} style={{ display: 'none' }} />
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: dragging ? 'rgba(232,50,26,0.15)' : 'rgba(255,255,255,0.04)',
            border: `2px dashed ${dragging ? '#E8321A' : 'rgba(255,255,255,0.12)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px', transition: 'all 0.2s',
          }}>
            <Upload size={26} color={dragging ? '#E8321A' : '#555'} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: dragging ? '#E8321A' : '#ccc', marginBottom: '8px' }}>
            {dragging ? 'Drop your image here' : 'Click or drag an image here'}
          </div>
          <div style={{ fontSize: '13px', color: '#444' }}>Supports JPG, PNG, WebP — up to any size</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Controls row */}
          <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', padding: '20px 28px' }}>
            {/* Format */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>Output Format</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[['image/jpeg','JPG'], ['image/webp','WebP'], ['image/png','PNG']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setFormat(val)} style={{
                    padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    border: `1px solid ${format === val ? '#E8321A' : 'rgba(255,255,255,0.08)'}`,
                    background: format === val ? 'rgba(232,50,26,0.15)' : 'transparent',
                    color: format === val ? '#E8321A' : '#666', cursor: 'pointer', transition: 'all 0.2s',
                  }}>{lbl}</button>
                ))}
              </div>
            </div>
            {/* Quality slider */}
            {format !== 'image/png' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>Quality</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: quality >= 70 ? '#22c55e' : quality >= 40 ? '#f59e0b' : '#E8321A' }}>{quality}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ZoomOut size={14} color="#555" />
                  <input type="range" min={1} max={100} value={quality} onChange={e => setQuality(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#E8321A', cursor: 'pointer' }} />
                  <ZoomIn size={14} color="#555" />
                </div>
              </div>
            )}
            {/* Download */}
            <button onClick={handleDownload} disabled={!compressed || processing} style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 24px', borderRadius: '50px',
              background: compressed && !processing ? '#E8321A' : '#222',
              border: 'none', color: compressed && !processing ? '#fff' : '#555',
              fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em',
              cursor: compressed && !processing ? 'pointer' : 'not-allowed',
              boxShadow: compressed && !processing ? '0 0 20px rgba(232,50,26,0.35)' : 'none',
              transition: 'all 0.2s',
            }}>
              <Download size={15} />
              {processing ? 'Processing…' : 'Download'}
            </button>
          </div>

          {/* Stats row */}
          {compressed && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              {[
                { label: 'Original Size', value: fmtSize(original.size), accent: '#888' },
                { label: 'Compressed Size', value: fmtSize(compressed.size), accent: '#22c55e' },
                { label: 'Size Saved', value: `${saving > 0 ? saving : 0}%`, accent: saving > 0 ? '#E8321A' : '#888' },
              ].map(s => (
                <div key={s.label} style={{ ...cardStyle, padding: '20px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '8px' }}>{s.label}</div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: s.accent }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Preview row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Original */}
            <div style={{ ...cardStyle }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '14px' }}>
                Original · {original.w}×{original.h}px · {fmtSize(original.size)}
              </div>
              <img src={original.url} alt="original" style={{
                width: '100%', height: '220px', objectFit: 'contain',
                borderRadius: '10px', background: 'rgba(255,255,255,0.03)',
              }} />
            </div>
            {/* Compressed */}
            <div style={{ ...cardStyle }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: compressed ? '#22c55e' : '#555', textTransform: 'uppercase', marginBottom: '14px' }}>
                {compressed ? `Compressed · ${format.split('/')[1].toUpperCase()} · ${fmtSize(compressed.size)}` : 'Processing…'}
              </div>
              {processing ? (
                <div style={{ width: '100%', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    border: '3px solid rgba(232,50,26,0.15)', borderTopColor: '#E8321A',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                </div>
              ) : compressed ? (
                <img src={compressed.url} alt="compressed" style={{
                  width: '100%', height: '220px', objectFit: 'contain',
                  borderRadius: '10px', background: 'rgba(255,255,255,0.03)',
                }} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DemoWebsitesPanel({ restaurants, onEdit, onDelete }) {
  const navigate = useNavigate()
  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px',
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '50px',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#F59E0B', boxShadow: '0 0 8px #F59E0B', display: 'inline-block' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', color: '#F59E0B', textTransform: 'uppercase' }}>Demo Mode</span>
          </div>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Demo Websites</h2>
        <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>
          Restaurants marked as Demo. Use the edit (✎) button on any entry to change its status.
        </p>
      </div>

      <div style={{
        background: '#111',
        border: '1px solid rgba(245,158,11,0.12)',
        borderRadius: '20px',
        overflow: 'hidden',
      }}>
        {restaurants.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '80px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: '18px',
              background: 'rgba(245,158,11,0.08)',
              border: '2px dashed rgba(245,158,11,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px', marginBottom: '20px',
            }}>🎬</div>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>No Demo Websites Yet</div>
            <p style={{ fontSize: '13px', color: '#555', maxWidth: '300px', lineHeight: 1.6, margin: 0 }}>
              To add a website here, open the Dashboard, click the edit (✎) icon on any restaurant, and set its status to <strong style={{ color: '#F59E0B' }}>DEMO</strong>.
            </p>
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {['UID', 'STATUS', 'TIMELINE', 'PLAN', 'PLACE', 'ACTIONS'].map(col => (
                    <th key={col} style={{
                      padding: '14px 28px', textAlign: 'left',
                      fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                      color: '#555', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r, i) => {
                  const planDot = PLAN_DOT_COLOR[r.plan] || '#888'
                  return (
                    <tr key={r.uid + i} style={{
                      borderBottom: i < restaurants.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.02em' }}>{r.uid}</div>
                        <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{r.name}</div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B', boxShadow: '0 0 8px #F59E0B', display: 'inline-block' }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#F59E0B', letterSpacing: '0.04em' }}>DEMO</span>
                        </div>
                      </td>
                      <td style={{ padding: '20px 28px', color: '#ccc', fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                        {formatDDMMYYYY(r.startDate)} <span style={{ color: '#555', margin: '0 4px' }}>TO</span> {formatDDMMYYYY(r.endDate)}
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: planDot, boxShadow: `0 0 8px ${planDot}`, display: 'inline-block' }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ddd', letterSpacing: '0.06em' }}>{r.plan}</span>
                        </div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <span style={{
                          display: 'inline-block', padding: '5px 10px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px', color: '#fff',
                          fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', fontFamily: 'monospace',
                        }}>{r.place}</span>
                      </td>
                      <td style={{ padding: '16px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {[
                            { label: 'VIEW',   color: '#22c55e', onClick: () => r.slug ? navigate(`/restaurant/${r.slug}`) : null },
                            { label: 'ADMIN',  color: '#3B82F6', onClick: () => navigate(`/admin/${r.id}`) },
                            { label: 'MASTER', color: '#A855F7', onClick: () => { console.log('Opening MASTER for:', r.uid); navigate(`/master-control/${r.uid}`) } },
                          ].map(({ label, color, onClick }) => (
                            <button
                              key={label}
                              onClick={onClick}
                              style={{
                                display: 'inline-flex', alignItems: 'center',
                                padding: '7px 13px',
                                background: `rgba(${color === '#22c55e' ? '34,197,94' : color === '#3B82F6' ? '59,130,246' : '168,85,247'},0.08)`,
                                border: `1px solid ${color}44`,
                                borderRadius: '8px',
                                color,
                                fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = color
                                e.currentTarget.style.color = '#fff'
                                e.currentTarget.style.boxShadow = `0 0 14px ${color}66`
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = `rgba(${color === '#22c55e' ? '34,197,94' : color === '#3B82F6' ? '59,130,246' : '168,85,247'},0.08)`
                                e.currentTarget.style.color = color
                                e.currentTarget.style.boxShadow = 'none'
                              }}
                            >
                              {label}
                            </button>
                          ))}
                          <EditRowBtn onClick={() => onEdit(r)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding: '14px 28px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '12px', color: '#555' }}>
                {restaurants.length} demo {restaurants.length === 1 ? 'website' : 'websites'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

