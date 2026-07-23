import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Trash2, AlertTriangle, X, RotateCcw } from 'lucide-react'
import { getDeletedRestaurants, permanentDeleteRestaurant, updateRestaurant } from '../lib/db'

function formatDDMMYYYY(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function DeletedRestaurants() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteStage, setDeleteStage] = useState('initial')
  const [confirmUidInput, setConfirmUidInput] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState('')

  const fetchDeleted = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getDeletedRestaurants()
      setRestaurants(rows)
    } catch {
      setRestaurants([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDeleted() }, [fetchDeleted])

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

  async function restoreToDemo(r) {
    try {
      await updateRestaurant(r.id, { status: 'demo', is_deleted: false, deleted_at: null })
    } catch (err) {
      console.error('[restoreToDemo] API failed:', err.message)
    }
    fetchDeleted()
    setToast('Restaurant restored to Demo section')
    setTimeout(() => setToast(''), 2800)
  }

  async function handlePermanentDelete() {
    if (!deleteTarget) return
    const uid = deleteTarget.uid || deleteTarget.id
    if (confirmUidInput.trim() !== String(uid)) {
      setDeleteError('UID does not match. Please try again.')
      return
    }
    setDeleting(true)
    try {
      await permanentDeleteRestaurant(deleteTarget)
      closeDeleteModal()
      fetchDeleted()
      setToast('Restaurant permanently deleted — all data and files removed')
      setTimeout(() => setToast(''), 3200)
    } catch (err) {
      setDeleteError('Failed to delete: ' + (err.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'rgba(232,50,26,0.1)', border: '1px solid rgba(232,50,26,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={16} color="#E8321A" />
                </div>
                <h1 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', color: '#fff' }}>
                  Deleted Restaurants
                </h1>
              </div>
              <p style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>
                Restaurants moved here are not deleted permanently yet. Use "DELETE PERMANENTLY" to remove all data.
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#888',
                fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
            >
              ← BACK TO DASHBOARD
            </button>
          </div>

          {/* Warning banner */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            background: 'rgba(232,50,26,0.06)',
            border: '1px solid rgba(232,50,26,0.2)',
            borderRadius: '14px',
            padding: '16px 20px',
            marginBottom: '24px',
          }}>
            <AlertTriangle size={16} color="#E8321A" style={{ marginTop: '1px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8321A', marginBottom: '3px' }}>
                Permanent Deletion Warning
              </div>
              <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.6 }}>
                Permanently deleting a restaurant removes all of its data — including orders, bookings, menu items, team members, and images. This action cannot be undone.
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{
            background: '#111',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '20px',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                {loading ? 'Loading…' : `${restaurants.length} Restaurant${restaurants.length !== 1 ? 's' : ''} in Trash`}
              </h2>
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  border: '3px solid rgba(232,50,26,0.15)',
                  borderTopColor: '#E8321A',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : restaurants.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '80px 24px', textAlign: 'center',
              }}>
                <div style={{
                  width: '60px', height: '60px', borderRadius: '18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '2px dashed rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '18px',
                }}>
                  <Trash2 size={24} color="#444" />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>
                  No Deleted Restaurants
                </div>
                <p style={{ fontSize: '13px', color: '#555', maxWidth: '260px', lineHeight: 1.6 }}>
                  When you delete a restaurant from the dashboard, it will appear here first.
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['UID', 'NAME', 'PLAN', 'DELETED', 'ACTIONS'].map(col => (
                      <th key={col} style={{
                        padding: '14px 28px',
                        textAlign: 'left',
                        fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                        color: '#555',
                      }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((r, i) => (
                    <tr key={r.id} style={{
                      borderBottom: i < restaurants.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#ccc' }}>
                          {r.uid || r.id}
                        </div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                          {(r.name || '—').toUpperCase()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{r.slug || ''}</div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                          color: '#888', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px', padding: '3px 8px',
                        }}>
                          {r.plan || 'STARTER'}
                        </span>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#E8321A' }}>
                          {timeAgo(r.deleted_at)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                          {formatDDMMYYYY(r.deleted_at)}
                        </div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => restoreToDemo(r)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '7px',
                              padding: '9px 14px',
                              background: 'rgba(245,158,11,0.08)',
                              border: '1px solid rgba(245,158,11,0.3)',
                              borderRadius: '9px',
                              color: '#F59E0B',
                              fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#F59E0B'
                              e.currentTarget.style.color = '#000'
                              e.currentTarget.style.boxShadow = '0 0 16px rgba(245,158,11,0.4)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(245,158,11,0.08)'
                              e.currentTarget.style.color = '#F59E0B'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                          >
                            <RotateCcw size={12} /> RESTORE
                          </button>
                          <button
                            onClick={() => openDeleteModal(r)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '7px',
                              padding: '9px 14px',
                              background: 'rgba(232,50,26,0.08)',
                              border: '1px solid rgba(232,50,26,0.25)',
                              borderRadius: '9px',
                              color: '#E8321A',
                              fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#E8321A'
                              e.currentTarget.style.color = '#fff'
                              e.currentTarget.style.boxShadow = '0 0 16px rgba(232,50,26,0.4)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(232,50,26,0.08)'
                              e.currentTarget.style.color = '#E8321A'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                          >
                            <Trash2 size={12} /> DELETE PERMANENTLY
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          onClick={closeDeleteModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '460px',
              background: '#141414',
              border: '1px solid rgba(232,50,26,0.35)',
              borderRadius: '18px',
              padding: '28px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(232,50,26,0.15)',
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
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>

            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', paddingRight: '40px' }}>
              <AlertTriangle size={18} color="#E8321A" />
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#E8321A', letterSpacing: '0.06em' }}>
                DELETE RESTAURANT PERMANENTLY
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
              This will permanently remove all restaurant data. This cannot be undone.
            </div>

            {/* Restaurant info */}
            <div style={{
              padding: '14px 16px',
              background: 'rgba(232,50,26,0.05)',
              border: '1px solid rgba(232,50,26,0.15)',
              borderRadius: '10px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: '#666', fontWeight: 700, letterSpacing: '0.04em', minWidth: '120px' }}>UID:</span>
                <span style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700 }}>{deleteTarget.uid || deleteTarget.id}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: '#666', fontWeight: 700, letterSpacing: '0.04em', minWidth: '120px' }}>Restaurant Name:</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>{(deleteTarget.name || '—').toUpperCase()}</span>
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
                PROCEED TO PERMANENT DELETE
              </button>
            )}

            {deleteStage === 'confirm' && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#aaa', letterSpacing: '0.06em', marginBottom: '8px' }}>
                  ENTER UID TO CONFIRM PERMANENT DELETE
                </div>
                <input
                  type="text"
                  autoFocus
                  value={confirmUidInput}
                  onChange={e => { setConfirmUidInput(e.target.value); setDeleteError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handlePermanentDelete() }}
                  placeholder={String(deleteTarget.uid || deleteTarget.id)}
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
                  onClick={handlePermanentDelete}
                  disabled={deleting}
                  style={{
                    width: '100%', padding: '13px',
                    background: deleting ? 'rgba(232,50,26,0.5)' : '#E8321A',
                    border: 'none', borderRadius: '10px',
                    color: '#fff', fontSize: '13px', fontWeight: 800,
                    letterSpacing: '0.08em',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    boxShadow: deleting ? 'none' : '0 0 20px rgba(232,50,26,0.4)',
                  }}
                >
                  {deleting ? 'DELETING…' : 'CONFIRM PERMANENT DELETE'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
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
    </div>
  )
}
