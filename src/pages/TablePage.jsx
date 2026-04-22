import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { X, Check, Copy, ExternalLink, Plus, Lock } from 'lucide-react'

function getAvatar(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function loadTableNames(restaurantId) {
  try {
    return JSON.parse(localStorage.getItem(`exzibo_table_names_${restaurantId}`) || '[]')
  } catch { return [] }
}

function saveTableNames(restaurantId, names) {
  localStorage.setItem(`exzibo_table_names_${restaurantId}`, JSON.stringify(names))
}

function loadPendingCount(restaurantId) {
  const raw = localStorage.getItem(`exzibo_table_pending_${restaurantId}`)
  if (raw === null) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function savePendingCount(restaurantId, count) {
  localStorage.setItem(`exzibo_table_pending_${restaurantId}`, String(count))
}

function loadLinkName(uid) {
  return localStorage.getItem(`exzibo_link_name_${uid}`) || ''
}

function saveLinkName(uid, name) {
  localStorage.setItem(`exzibo_link_name_${uid}`, name)
}

function loadRoutesCreated(uid) {
  return localStorage.getItem(`exzibo_link_routes_created_${uid}`) === 'true'
}

function saveRoutesCreated(uid, val) {
  localStorage.setItem(`exzibo_link_routes_created_${uid}`, val ? 'true' : 'false')
}

function loadLinkTableCount(uid) {
  const raw = localStorage.getItem(`exzibo_link_table_count_${uid}`)
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function saveLinkTableCount(uid, count) {
  localStorage.setItem(`exzibo_link_table_count_${uid}`, String(count))
}

const LINK_BASE_URL = 'https://exzibo-mag.vercel.app'

function sanitizeLinkName(value) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
}

function getRestaurantTables(restaurant) {
  if (Array.isArray(restaurant.tableNumbers) && restaurant.tableNumbers.length > 0) {
    return restaurant.tableNumbers.map(String)
  }
  const n = parseInt(restaurant.tables, 10)
  if (Number.isFinite(n) && n > 0) {
    return Array.from({ length: n }, (_, i) => String(i + 1))
  }
  return ['1']
}

export default function TablePage() {
  const [restaurants, setRestaurants] = useState([])
  const [panelTarget, setPanelTarget] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [tableNames, setTableNames] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [newTableName, setNewTableName] = useState('')
  const [toast, setToast] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [linksTarget, setLinksTarget] = useState(null)
  const [linksOpen, setLinksOpen] = useState(false)
  const [linkStep, setLinkStep] = useState(1)
  const [linkNameInput, setLinkNameInput] = useState('')
  const [savedLinkName, setSavedLinkName] = useState('')
  const [routesCreated, setRoutesCreated] = useState(false)
  const [linkTableCountInput, setLinkTableCountInput] = useState('')
  const [savedTableCount, setSavedTableCount] = useState(0)
  const [linkPendingCount, setLinkPendingCount] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [copiedTableUrl, setCopiedTableUrl] = useState(null)
  const inputRef = useRef(null)
  const toastTimer = useRef(null)

  function loadRestaurants() {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    setRestaurants(saved)
  }

  useEffect(() => { loadRestaurants() }, [])

  function openPanel(restaurant) {
    setPanelTarget(restaurant)
    setTableNames(loadTableNames(restaurant.id))
    setPendingCount(loadPendingCount(restaurant.id))
    setNewTableName('')
    setPanelOpen(true)
    setTimeout(() => inputRef.current?.focus(), 300)
  }

  function closePanel() {
    setPanelOpen(false)
    setTimeout(() => {
      setPanelTarget(null)
      setTableNames([])
      setPendingCount(0)
      setNewTableName('')
    }, 320)
  }

  function showToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function handleCreate() {
    const raw = newTableName.trim()
    if (!raw) return
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0 || String(n) !== raw) return
    const updated = pendingCount + n
    setPendingCount(updated)
    if (panelTarget) savePendingCount(panelTarget.id, updated)
    setNewTableName('')
    showToast('✅ Table request added!')
    inputRef.current?.focus()
  }

  function handleInputKey(e) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') closePanel()
  }

  function getRestaurantUrl(r) {
    return `${window.location.origin}/restaurant/${r.slug || r.id}`
  }

  function handleCopyLink(r) {
    navigator.clipboard.writeText(getRestaurantUrl(r)).then(() => {
      setCopiedId(r.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function openLinks(restaurant) {
    const uid = restaurant.uid || restaurant.id
    const existing = loadLinkName(uid)
    const created = loadRoutesCreated(uid)
    const tableCount = loadLinkTableCount(uid)
    const pending = loadPendingCount(restaurant.id)
    setLinksTarget(restaurant)
    setSavedLinkName(existing)
    setRoutesCreated(created)
    setSavedTableCount(tableCount)
    setLinkPendingCount(pending)
    setLinkNameInput('')
    setLinkTableCountInput('')
    setShowConfirm(false)
    if (existing && created) setLinkStep(3)
    else setLinkStep(1)
    setLinksOpen(true)
  }

  function closeLinks() {
    setLinksOpen(false)
    setTimeout(() => {
      setLinksTarget(null)
      setLinkStep(1)
      setLinkNameInput('')
      setLinkTableCountInput('')
      setSavedLinkName('')
      setSavedTableCount(0)
      setLinkPendingCount(0)
      setRoutesCreated(false)
      setShowConfirm(false)
      setCopiedTableUrl(null)
    }, 320)
  }

  function handleRequestCreate() {
    if (!linksTarget) return
    const cleaned = sanitizeLinkName(linkNameInput)
    const count = parseInt(linkTableCountInput, 10)
    if (!cleaned) {
      showToast('⚠️ Enter a valid link name')
      return
    }
    if (!Number.isFinite(count) || count <= 0) {
      showToast('⚠️ Enter a valid table count')
      return
    }
    const uid = linksTarget.uid || linksTarget.id
    const taken = restaurants.some(r => {
      const otherUid = r.uid || r.id
      if (otherUid === uid) return false
      return loadLinkName(otherUid) === cleaned
    })
    if (taken) {
      showToast('⚠️ This link name is already taken')
      return
    }
    setShowConfirm(true)
  }

  function handleConfirmCreate() {
    if (!linksTarget) return
    const uid = linksTarget.uid || linksTarget.id
    const cleaned = sanitizeLinkName(linkNameInput)
    const count = parseInt(linkTableCountInput, 10)
    saveLinkName(uid, cleaned)
    saveLinkTableCount(uid, count)
    saveRoutesCreated(uid, true)
    setSavedLinkName(cleaned)
    setSavedTableCount(count)
    setRoutesCreated(true)
    setShowConfirm(false)
    setLinkStep(3)
    showToast('✅ Links created successfully')
  }

  function handleCopyTableUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedTableUrl(url)
      setTimeout(() => setCopiedTableUrl(null), 1800)
    })
  }

  function getTableUrl(linkName, tableNumber) {
    return `${LINK_BASE_URL}/menu/${linkName}/table-${tableNumber}`
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(100%); opacity: 0; }
        }
        @keyframes toastIn {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes fadeOverlay {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader subtitle="Table" />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{
            background: '#111',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '20px',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Table
              </h2>
            </div>

            {restaurants.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '80px 24px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#555', marginBottom: '8px' }}>No restaurants found</div>
                <p style={{ fontSize: '13px', color: '#444', maxWidth: '280px', lineHeight: 1.6 }}>
                  Add a restaurant first to manage its tables here.
                </p>
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['RESTAURANT', 'UID', 'NO OF TABLE', 'ADD TABLE', 'LINKS'].map(col => (
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
                      const isLive = r.status === 'active'
                      const statusColor = isLive ? '#4ade80' : '#FFB800'
                      const storedNames = loadTableNames(r.id)
                      const tableCount = storedNames.length > 0
                        ? storedNames.length
                        : (r.tables !== undefined && r.tables !== null ? r.tables : 0)

                      return (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: i < restaurants.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '20px 28px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #333, #222)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '12px', fontWeight: 800, color: '#aaa', flexShrink: 0,
                              }}>
                                {getAvatar(r.name)}
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', textTransform: 'uppercase' }}>
                                {r.name}
                              </span>
                            </div>
                          </td>

                          <td style={{ padding: '20px 28px', fontSize: '12px', color: '#666', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                            {r.uid || r.id}
                          </td>

                          <td style={{ padding: '20px 28px', fontSize: '16px', fontWeight: 700, color: '#ccc' }}>
                            {tableCount}
                          </td>

                          <td style={{ padding: '20px 28px' }}>
                            <AddBtn onClick={() => openPanel(r)} />
                          </td>

                          <td style={{ padding: '20px 28px' }}>
                            <GetBtn
                              copied={copiedId === r.id}
                              onCopy={() => openLinks(r)}
                              onOpen={() => window.open(getRestaurantUrl(r), '_blank')}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div style={{ padding: '16px 28px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '12px', color: '#555' }}>
                    Showing {restaurants.length} restaurant{restaurants.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {panelTarget && (
        <>
          <div
            onClick={closePanel}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 1000,
              backdropFilter: 'blur(4px)',
              animation: panelOpen ? 'fadeOverlay 0.25s ease' : 'none',
            }}
          />

          <div style={{
            position: 'fixed',
            top: 0, right: 0,
            width: '380px',
            height: '100vh',
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRight: 'none',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-12px 0 60px rgba(0,0,0,0.7)',
            animation: `${panelOpen ? 'slideInRight' : 'slideOutRight'} 0.3s cubic-bezier(0.4,0,0.2,1) forwards`,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '22px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>ADD TABLE</div>
                <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '2px' }}>
                  {panelTarget.name}
                </div>
              </div>
              <button
                onClick={closePanel}
                style={{
                  width: '32px', height: '32px', borderRadius: '9px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#888', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#888' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <div style={{ marginBottom: '28px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '18px 22px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px',
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
                    PENDING
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#fffc00' }}>
                    {pendingCount}
                  </span>
                </div>
              </div>

              <div style={{
                height: '1px',
                background: 'rgba(255,255,255,0.06)',
                marginBottom: '28px',
              }} />

              <div>
                <div style={{
                  fontSize: '11px', fontWeight: 700, color: '#fff',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  marginBottom: '14px',
                }}>
                  Add New Table Request
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={newTableName}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '' || /^\d+$/.test(v)) setNewTableName(v)
                  }}
                  onKeyDown={handleInputKey}
                  inputMode="numeric"
                  placeholder="Enter number of tables..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 500,
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: '12px',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(232,50,26,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />

                <button
                  onClick={handleCreate}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: newTableName.trim() ? '#E8321A' : 'rgba(255,255,255,0.05)',
                    border: newTableName.trim() ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    color: newTableName.trim() ? '#fff' : '#555',
                    fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em',
                    cursor: newTableName.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    boxShadow: newTableName.trim() ? '0 0 20px rgba(232,50,26,0.35)' : 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (newTableName.trim()) e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.55)'
                  }}
                  onMouseLeave={e => {
                    if (newTableName.trim()) e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.35)'
                  }}
                >
                  <Plus size={15} />
                  Create
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {linksTarget && (
        <>
          <div
            onClick={closeLinks}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 1000,
              backdropFilter: 'blur(4px)',
              animation: linksOpen ? 'fadeOverlay 0.25s ease' : 'none',
            }}
          />
          <div style={{
            position: 'fixed',
            top: 0, right: 0,
            width: '460px',
            height: '100vh',
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRight: 'none',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-12px 0 60px rgba(0,0,0,0.7)',
            animation: `${linksOpen ? 'slideInRight' : 'slideOutRight'} 0.3s cubic-bezier(0.4,0,0.2,1) forwards`,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '22px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>GET LINKS</div>
                <div style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '2px' }}>
                  {linksTarget.name} · Step {linkStep} of 3
                </div>
              </div>
              <button
                onClick={closeLinks}
                style={{
                  width: '32px', height: '32px', borderRadius: '9px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#888', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {linkStep === 1 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px' }}>
                    Step 1 — Pending Tables Overview
                  </div>
                  <div style={{
                    padding: '22px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '14px',
                    marginBottom: '18px',
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em', marginBottom: '14px' }}>
                      PENDING TABLES
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '40px', fontWeight: 800, color: '#fffc00', lineHeight: 1 }}>
                        {linkPendingCount}
                      </span>
                      <span style={{ fontSize: '12px', color: '#777', fontWeight: 600 }}>tables pending</span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#888', lineHeight: 1.6, margin: 0 }}>
                      This restaurant has {linkPendingCount} table{linkPendingCount === 1 ? '' : 's'}. No links have been created yet.
                    </p>
                  </div>
                  <button
                    onClick={() => setLinkStep(2)}
                    style={{
                      width: '100%', padding: '13px',
                      background: '#E8321A', border: 'none', borderRadius: '10px',
                      color: '#fff', fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em',
                      cursor: 'pointer', boxShadow: '0 0 20px rgba(232,50,26,0.35)',
                    }}
                  >
                    Continue to Create Link →
                  </button>
                </div>
              )}

              {linkStep === 2 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px' }}>
                    Step 2 — Create Link & Set Tables
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.06em', marginBottom: '8px' }}>
                      CREATE PERMANENT LINK NAME
                    </div>
                    <input
                      type="text"
                      autoFocus
                      value={linkNameInput}
                      onChange={e => setLinkNameInput(sanitizeLinkName(e.target.value))}
                      placeholder="e.g. spice-garden"
                      style={{
                        width: '100%', padding: '12px 14px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#fff', fontSize: '14px', fontWeight: 500,
                        outline: 'none', boxSizing: 'border-box', marginBottom: '8px',
                      }}
                    />
                    <div style={{
                      fontSize: '11px', color: '#666', fontFamily: 'monospace',
                      padding: '8px 10px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px dashed rgba(255,255,255,0.07)',
                      borderRadius: '8px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {LINK_BASE_URL}/menu/{linkNameInput || '[linkname]'}/table-1
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.06em', marginBottom: '8px' }}>
                      ENTER TOTAL NUMBER OF TABLES
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={linkTableCountInput}
                      onChange={e => {
                        const v = e.target.value
                        if (v === '' || /^\d+$/.test(v)) setLinkTableCountInput(v)
                      }}
                      placeholder="e.g. 100"
                      style={{
                        width: '100%', padding: '12px 14px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        color: '#fff', fontSize: '14px', fontWeight: 500,
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    onClick={handleRequestCreate}
                    disabled={!linkNameInput || !linkTableCountInput}
                    style={{
                      width: '100%', padding: '13px',
                      background: (linkNameInput && linkTableCountInput) ? '#E8321A' : 'rgba(255,255,255,0.05)',
                      border: (linkNameInput && linkTableCountInput) ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      color: (linkNameInput && linkTableCountInput) ? '#fff' : '#555',
                      fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em',
                      cursor: (linkNameInput && linkTableCountInput) ? 'pointer' : 'default',
                      boxShadow: (linkNameInput && linkTableCountInput) ? '0 0 20px rgba(232,50,26,0.35)' : 'none',
                    }}
                  >
                    Create Links
                  </button>
                </div>
              )}

              {linkStep === 3 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
                    Step 3 — Table Links
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 14px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    marginBottom: '16px',
                  }}>
                    <Lock size={13} color="#888" />
                    <span style={{ fontSize: '12px', color: '#aaa', fontFamily: 'monospace' }}>{savedLinkName}</span>
                    <span style={{ fontSize: '10px', color: '#4ade80', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.08em' }}>created</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Array.from({ length: savedTableCount }, (_, i) => String(i + 1)).map((t) => {
                      const url = getTableUrl(savedLinkName, t)
                      const isCopied = copiedTableUrl === url
                      return (
                        <div key={t} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '12px 14px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: '10px',
                        }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'rgba(232,50,26,0.12)',
                            border: '1px solid rgba(232,50,26,0.2)',
                            color: '#E8321A', fontSize: '11px', fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>{t}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {url}
                            </div>
                          </div>
                          <button
                            onClick={() => handleCopyTableUrl(url)}
                            style={{
                              padding: '8px 12px',
                              background: isCopied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
                              border: `1px solid ${isCopied ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'}`,
                              borderRadius: '8px',
                              color: isCopied ? '#4ade80' : '#ccc',
                              fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '5px',
                              flexShrink: 0,
                            }}
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                            {isCopied ? 'COPIED' : 'COPY'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showConfirm && linksTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            width: '100%', maxWidth: '420px',
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '26px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>
              Confirm Permanent Creation
            </div>
            <p style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.6, marginBottom: '20px' }}>
              You are about to permanently create{' '}
              <span style={{ color: '#fffc00', fontWeight: 700, fontFamily: 'monospace' }}>
                {sanitizeLinkName(linkNameInput)}
              </span>{' '}
              with{' '}
              <span style={{ color: '#fff', fontWeight: 800 }}>{linkTableCountInput}</span>{' '}
              table links. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  flex: 1, padding: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  color: '#ccc', fontSize: '13px', fontWeight: 700,
                  letterSpacing: '0.04em', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreate}
                style={{
                  flex: 1, padding: '12px',
                  background: '#E8321A', border: 'none', borderRadius: '10px',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  letterSpacing: '0.04em', cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(232,50,26,0.4)',
                }}
              >
                Confirm & Create
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15,15,15,0.95)',
          border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: '50px',
          padding: '12px 22px',
          fontSize: '13px', fontWeight: 700, color: '#4ade80',
          zIndex: 2000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(74,222,128,0.1)',
          whiteSpace: 'nowrap',
          animation: 'toastIn 0.3s cubic-bezier(0.34,1.1,0.64,1)',
          letterSpacing: '0.02em',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function AddBtn({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '8px 18px',
        background: hov ? '#E8321A' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${hov ? '#E8321A' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '9px',
        color: hov ? '#fff' : '#ccc',
        fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: hov ? '0 0 14px rgba(232,50,26,0.35)' : 'none',
      }}
    >
      ADD
    </button>
  )
}

function GetBtn({ copied, onCopy, onOpen }) {
  const [hov, setHov] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <button
        onClick={onCopy}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title="Copy restaurant link"
        style={{
          padding: '8px 14px',
          background: copied ? 'rgba(74,222,128,0.12)' : hov ? 'rgba(255,255,255,0.1)' : 'transparent',
          border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: '9px',
          color: copied ? '#4ade80' : '#ccc',
          fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
          cursor: 'pointer', transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        GET
      </button>
      <button
        onClick={onOpen}
        title="Open restaurant page"
        style={{
          width: '30px', height: '30px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          color: '#666', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
      >
        <ExternalLink size={12} />
      </button>
    </div>
  )
}
