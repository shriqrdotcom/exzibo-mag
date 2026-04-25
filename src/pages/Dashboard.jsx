import React, { useState, useEffect, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { TrendingUp, Filter, Download, ChevronLeft, ChevronRight, Plus, Trash2, Clock, X, Pencil } from 'lucide-react'
import { useRole } from '../context/RoleContext'

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

export default function Dashboard() {
  const navigate = useNavigate()
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
  const [editDraft, setEditDraft] = useState(null)

  function loadRestaurantsFromStorage() {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    let mutated = false
    const today = new Date()
    const monthFromNow = new Date()
    monthFromNow.setDate(monthFromNow.getDate() + 30)
    const enriched = saved.map(r => {
      const patch = {}
      if (!r.startDate) { patch.startDate = (r.createdAt || today.toISOString()); mutated = true }
      if (!r.endDate) {
        const start = new Date(r.startDate || patch.startDate || today.toISOString())
        const end = new Date(start)
        end.setDate(end.getDate() + 30)
        patch.endDate = end.toISOString()
        mutated = true
      }
      if (!r.place) { patch.place = '—'; mutated = true }
      const normalizedPlan = normalizePlan(r.plan)
      if (r.plan !== normalizedPlan) { patch.plan = normalizedPlan; mutated = true }
      return { ...r, ...patch }
    })
    if (mutated) {
      localStorage.setItem('exzibo_restaurants', JSON.stringify(enriched))
    }
    return enriched.map(r => ({
      id: r.id,
      uid: r.uid || r.id,
      name: r.name.toUpperCase(),
      status: r.status === 'paused' ? 'PAUSED' : 'RUNNING',
      startDate: r.startDate,
      endDate: r.endDate,
      plan: normalizePlan(r.plan),
      place: (r.place || '—').toUpperCase().slice(0, 2) || '—',
      avatar: getAvatarFromName(r.name),
    }))
  }

  function persistRestaurantPatch(id, patch) {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const updated = saved.map(r => r.id === id ? { ...r, ...patch } : r)
    localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
    setRestaurants(loadRestaurantsFromStorage())
  }

  function toggleRowStatus(r) {
    persistRestaurantPatch(r.id, { status: r.status === 'RUNNING' ? 'paused' : 'active' })
  }

  function openEditModal(r) {
    setEditDraft({
      id: r.id,
      uid: r.uid,
      status: r.status,
      startDate: toISODateInput(r.startDate),
      endDate: toISODateInput(r.endDate),
      plan: r.plan,
      place: r.place === '—' ? '' : r.place,
    })
  }

  function closeEditModal() {
    setEditDraft(null)
  }

  function saveEdit() {
    if (!editDraft) return
    const start = editDraft.startDate ? new Date(editDraft.startDate).toISOString() : null
    const end = editDraft.endDate ? new Date(editDraft.endDate).toISOString() : null
    const place = (editDraft.place || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
    persistRestaurantPatch(editDraft.id, {
      status: editDraft.status === 'PAUSED' ? 'paused' : 'active',
      startDate: start,
      endDate: end,
      plan: normalizePlan(editDraft.plan),
      place: place || '—',
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

  function handleConfirmDelete() {
    if (!deleteTarget) return
    if (confirmUidInput.trim() !== String(deleteTarget.uid)) {
      setDeleteError('UID does not match. Please try again.')
      return
    }
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const filtered = saved.filter(r => r.id !== deleteTarget.id && (r.uid || r.id) !== deleteTarget.uid)
    localStorage.setItem('exzibo_restaurants', JSON.stringify(filtered))
    const id = deleteTarget.id
    const uid = deleteTarget.uid
    ;[
      `exzibo_table_pending_${id}`,
      `exzibo_table_names_${id}`,
      `exzibo_link_name_${uid}`,
      `exzibo_link_routes_created_${uid}`,
      `exzibo_link_table_count_${uid}`,
    ].forEach(k => localStorage.removeItem(k))
    setRestaurants(loadRestaurantsFromStorage())
    closeDeleteModal()
    setToast('Restaurant deleted successfully')
    setTimeout(() => setToast(''), 2400)
  }

  useLayoutEffect(() => {
    exitRoleView()
  }, [])

  useEffect(() => {
    setRestaurants(loadRestaurantsFromStorage())
    setRevenueEntries(syncRevenueLedger())
    const onFocus = () => setRevenueEntries(syncRevenueLedger())
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
  }, [])

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
                ORDER PER MONTH
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>
                {currentMonthAbbr}
              </div>
              <span style={{ fontSize: '42px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
                {currentMonthOrderCount.toLocaleString('en-IN')}
              </span>
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

            {restaurants.length === 0 ? (
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
                {restaurants.map((r, i) => {
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
                        <span style={{
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
                        }}>{r.place}</span>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <EditRowBtn onClick={() => openEditModal(r)} />
                          <DeleteBtn onClick={() => openDeleteModal(r)} />
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
              <span style={{ fontSize: '12px', color: '#555' }}>Showing {restaurants.length} {restaurants.length === 1 ? 'user' : 'users'}</span>
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
              DELETE RESTAURANT PERMANENTLY
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
              {['RUNNING', 'PAUSED'].map(s => {
                const active = editDraft.status === s
                const dot = s === 'RUNNING' ? '#22c55e' : '#9CA3AF'
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

            <FieldLabel>TIMELINE</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
              <input
                type="date"
                value={editDraft.startDate}
                onChange={e => setEditDraft(d => ({ ...d, startDate: e.target.value }))}
                style={editInputStyle}
              />
              <input
                type="date"
                value={editDraft.endDate}
                onChange={e => setEditDraft(d => ({ ...d, endDate: e.target.value }))}
                style={editInputStyle}
              />
            </div>

            <FieldLabel>PLAN</FieldLabel>
            <select
              value={editDraft.plan}
              onChange={e => setEditDraft(d => ({ ...d, plan: e.target.value }))}
              style={{ ...editInputStyle, marginBottom: '18px', appearance: 'none', cursor: 'pointer' }}
            >
              {PLAN_OPTIONS.map(p => (
                <option key={p} value={p} style={{ background: '#141414', color: '#fff' }}>{p}</option>
              ))}
            </select>

            <FieldLabel>PLACE (2-letter code)</FieldLabel>
            <input
              type="text"
              maxLength={2}
              value={editDraft.place}
              onChange={e => setEditDraft(d => ({ ...d, place: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) }))}
              placeholder="e.g. WB"
              style={{
                ...editInputStyle,
                marginBottom: '24px',
                fontFamily: 'monospace',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            />

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
