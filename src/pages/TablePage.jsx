import React, { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { X, Check, Copy, ExternalLink } from 'lucide-react'

function getAvatar(name) {
  return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function TablePage() {
  const [restaurants, setRestaurants] = useState([])
  const [modalTarget, setModalTarget] = useState(null)
  const [tableInput, setTableInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  function loadRestaurants() {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    setRestaurants(saved)
  }

  useEffect(() => {
    loadRestaurants()
  }, [])

  function openModal(restaurant) {
    setModalTarget(restaurant)
    setTableInput(restaurant.tables !== undefined && restaurant.tables !== null ? String(restaurant.tables) : '')
    setInputError('')
  }

  function closeModal() {
    setModalTarget(null)
    setTableInput('')
    setInputError('')
  }

  function handleSave() {
    const val = tableInput.trim()
    if (val === '') { setInputError('Please enter a number of tables.'); return }
    const num = parseInt(val, 10)
    if (isNaN(num) || num < 0) { setInputError('Enter a valid non-negative number.'); return }

    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const updated = all.map(r =>
      r.id === modalTarget.id ? { ...r, tables: num } : r
    )
    localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
    loadRestaurants()
    closeModal()
  }

  function getRestaurantUrl(r) {
    const slug = r.slug || r.id
    return `${window.location.origin}/restaurant/${slug}`
  }

  function handleCopyLink(r) {
    const url = getRestaurantUrl(r)
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(r.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
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
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#555', marginBottom: '8px' }}>
                  No restaurants found
                </div>
                <p style={{ fontSize: '13px', color: '#444', maxWidth: '280px', lineHeight: 1.6 }}>
                  Add a restaurant first to manage its tables here.
                </p>
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['RESTAURANT', 'UID', 'NO OF TABLE', 'ADD TABLE', 'STATUS', 'LINKS'].map(col => (
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
                      const isLive = r.status === 'active'
                      const statusLabel = isLive ? 'LIVE' : 'PAUSED'
                      const statusColor = isLive ? '#4ade80' : '#FFB800'
                      const tableCount = r.tables !== undefined && r.tables !== null ? r.tables : 0
                      const avatar = getAvatar(r.name)

                      return (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: i < restaurants.length - 1
                              ? '1px solid rgba(255,255,255,0.04)'
                              : 'none',
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
                                {avatar}
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
                            <AddBtn onClick={() => openModal(r)} />
                          </td>

                          <td style={{ padding: '20px 28px' }}>
                            <span style={{
                              fontSize: '12px', fontWeight: 800,
                              color: statusColor, letterSpacing: '0.06em',
                            }}>
                              {statusLabel}
                            </span>
                          </td>

                          <td style={{ padding: '20px 28px' }}>
                            <GetBtn
                              copied={copiedId === r.id}
                              onCopy={() => handleCopyLink(r)}
                              onOpen={() => window.open(getRestaurantUrl(r), '_blank')}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div style={{
                  padding: '16px 28px',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: '12px', color: '#555' }}>
                    Showing {restaurants.length} restaurant{restaurants.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {modalTarget && (
        <AddTableModal
          restaurant={modalTarget}
          value={tableInput}
          onChange={v => { setTableInput(v); setInputError('') }}
          onSave={handleSave}
          onClose={closeModal}
          error={inputError}
        />
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

function AddTableModal({ restaurant, value, onChange, onSave, onClose, error }) {
  function handleKey(e) {
    if (e.key === 'Enter') onSave()
    if (e.key === 'Escape') onClose()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 1000,
          backdropFilter: 'blur(6px)',
        }}
      />
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '360px',
        background: '#161616',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '20px',
        zIndex: 1001,
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        padding: '28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
              Set Number of Tables
            </div>
            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {restaurant.name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none', borderRadius: '8px',
              width: '30px', height: '30px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#888', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Number of Tables
          </label>
          <input
            autoFocus
            type="number"
            min="0"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. 24"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${error ? '#E8321A' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '10px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => { if (!error) e.target.style.borderColor = 'rgba(255,255,255,0.25)' }}
            onBlur={e => { if (!error) e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
          {error && (
            <div style={{ fontSize: '11px', color: '#E8321A', marginTop: '6px', fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '11px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: '#888', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            style={{
              flex: 1, padding: '11px',
              background: '#E8321A',
              border: 'none',
              borderRadius: '10px',
              color: '#fff', fontSize: '13px', fontWeight: 800,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              boxShadow: '0 0 20px rgba(232,50,26,0.4)',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.6)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.4)'}
          >
            <Check size={14} /> Save
          </button>
        </div>
      </div>
    </>
  )
}
