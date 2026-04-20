import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import AdminHeader from '../components/AdminHeader'
import {
  TrendingUp, Filter, Download,
  ChevronLeft, ChevronRight, Plus,
  LayoutDashboard, Zap,
} from 'lucide-react'

function getAvatarFromName(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

/* ─── Demo-scoped sidebar ─── */
function DemoSidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: `/demo/dashboard`, available: true },
    { icon: Plus, label: 'Create Demo App', path: '/demo/create', available: true },
    { icon: Zap, label: 'List of Demo', path: '/demo/list', available: true },
  ]

  return (
    <aside style={{
      width: '270px',
      minWidth: '270px',
      height: '100vh',
      background: '#0e0e0e',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      padding: '28px 16px',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ marginBottom: '40px', paddingLeft: '8px' }}>
        <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.05em', color: '#fff' }}>
          EXZI<span style={{ color: '#E8321A' }}>BO</span>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.2em', color: '#555', marginTop: '4px', textTransform: 'uppercase' }}>
          Demo Mode
        </div>
        <div style={{
          marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: 'rgba(232,50,26,0.1)', border: '1px solid rgba(232,50,26,0.2)',
          borderRadius: '6px', padding: '3px 8px',
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: '#E8321A',
        }}>
          🧪 DEMO ENVIRONMENT
        </div>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {navItems.map(({ icon: Icon, label, path, available }) => {
          const isActive = available && location.pathname === path
          return (
            <button
              key={label}
              onClick={() => available && path && navigate(path)}
              title={available ? label : 'Not available in Demo'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: isActive ? '#E8321A' : 'transparent',
                border: isActive ? 'none' : '1px solid rgba(255,255,255,0.06)',
                color: isActive ? '#fff' : available ? '#888' : '#333',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                cursor: available ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                width: '100%',
                opacity: available ? 1 : 0.45,
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (available && !isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = '#fff'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                }
              }}
              onMouseLeave={e => {
                if (available && !isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#888'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                }
              }}
            >
              <Icon size={18} />
              <span style={{ flex: 1 }}>{label}</span>
            </button>
          )
        })}
      </nav>

      <button
        onClick={() => navigate('/demo/list')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '13px',
          borderRadius: '50px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#E8321A'
          e.currentTarget.style.borderColor = '#E8321A'
          e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.4)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <Zap size={15} />
        GO LIVE
      </button>
    </aside>
  )
}

/* ─── Main page ─── */
export default function DemoDashboard() {
  const navigate = useNavigate()
  const [currentPage, setCurrentPage] = useState(1)
  const [rows, setRows] = useState([])

  useEffect(() => {
    const allDemos = JSON.parse(localStorage.getItem('exzibo_demo_restaurants') || '[]')

    const newRows = allDemos.map(found => {
      const orders = (() => {
        try { return JSON.parse(localStorage.getItem(`exzibo_orders_${found.id}`) || '[]') } catch { return [] }
      })()
      const totalPayment = orders
        .filter(o => o.status === 'completed' || o.status === 'confirmed')
        .reduce((s, o) => s + (o.grandTotal || o.items?.reduce((a, i) => a + (i.price * (i.qty || 1)), 0) || 0), 0)

      return {
        id: found.id,
        uid: found.uid || found.id,
        slug: found.slug,
        name: found.name ? found.name.toUpperCase() : 'DEMO SITE',
        status: found.status === 'active' ? 'RUNNING' : found.status === 'paused' ? 'PAUSED' : 'PENDING',
        date: found.createdAt ? formatDate(found.createdAt) : '—',
        tables: parseInt(found.tables) || 0,
        payment: totalPayment > 0 ? `₹${totalPayment.toLocaleString('en-IN')}` : '₹0.00',
        avatar: found.name ? getAvatarFromName(found.name) : 'DM',
        isDemo: true,
      }
    })

    setRows(newRows)
  }, [])

  const activeOps = rows.filter(r => r.status === 'RUNNING').length
  const totalTables = rows.reduce((s, r) => s + r.tables, 0)

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <DemoSidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader subtitle="Demo Dashboard" showSearch={false} />

        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

          {/* Demo notice banner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(232,50,26,0.06)',
            border: '1px solid rgba(232,50,26,0.15)',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '24px',
            fontSize: '12px', color: '#888',
          }}>
            <span style={{ fontSize: '16px' }}>🧪</span>
            <span>
              <strong style={{ color: '#E8321A', marginRight: '6px' }}>Demo Environment</strong>
              This dashboard is scoped to your demo restaurant only. Stats and data are sandboxed.
            </span>
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <KPICard
              label="ACTIVE OPERATIONS"
              value={activeOps.toString()}
              badge={activeOps > 0 ? 'LIVE' : null}
              badgeIcon={activeOps > 0 ? <TrendingUp size={11} /> : null}
            />
            <KPICard label="TOTAL TABLES" value={totalTables.toString()} />
            <KPICard label="DEMO SITES" value={rows.length.toString()} />
          </div>

          {/* Enterprise Partners table */}
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
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Enterprise Partners</h2>
                <div style={{ fontSize: '11px', color: '#555', marginTop: '4px', letterSpacing: '0.05em' }}>Demo Restaurant Registry</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <IconBtn icon={<Filter size={14} />} label="FILTER" />
                <IconBtn icon={<Download size={14} />} label="EXPORT" />
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {['RESTAURANT UID', 'STATUS', 'ACTIVATION DATE', 'TOTAL TABLES', 'TOTAL PAYMENT', 'ACTIONS'].map(col => (
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
                {rows.map((r, i) => {
                  const dotColor = r.status === 'RUNNING' ? '#E8321A' : r.status === 'PAUSED' ? '#FFB800' : '#555'
                  const labelColor = r.status === 'RUNNING' ? '#E8321A' : r.status === 'PAUSED' ? '#FFB800' : '#666'
                  return (
                    <tr
                      key={r.uid + i}
                      style={{
                        borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'rgba(232,50,26,0.15)',
                            border: '1px solid rgba(232,50,26,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', fontWeight: 700, color: '#E8321A',
                          }}>{r.avatar}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.04em' }}>{r.uid}</div>
                            <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{r.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: dotColor,
                            boxShadow: r.status !== 'PENDING' ? `0 0 8px ${dotColor}` : 'none',
                            display: 'inline-block',
                          }} />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: labelColor }}>{r.status}</span>
                        </div>
                      </td>
                      <td style={{ padding: '20px 28px', color: '#888', fontSize: '13px' }}>{r.date}</td>
                      <td style={{ padding: '20px 28px', color: '#ccc', fontSize: '14px', fontWeight: 600 }}>{r.tables}</td>
                      <td style={{ padding: '20px 28px', color: '#ccc', fontSize: '14px', fontWeight: 600 }}>{r.payment}</td>
                      <td style={{ padding: '20px 28px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <ViewSiteBtn onClick={() => navigate(`/restaurant/${r.slug}`)} />
                          <AdminBtn onClick={() => navigate(`/admin/${r.id}`)} />
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
              <span style={{ fontSize: '12px', color: '#555' }}>Showing {rows.length} demo site{rows.length !== 1 ? 's' : ''}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PageBtn icon={<ChevronLeft size={14} />} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} />
                {[1].map(p => (
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
                <PageBtn icon={<ChevronRight size={14} />} onClick={() => setCurrentPage(p => Math.min(1, p + 1))} />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/demo/create')}
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
          zIndex: 50,
        }}
        title="Create Demo App"
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(232,50,26,0.7)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.5)' }}
      >
        <Plus size={22} />
      </button>
    </div>
  )
}

/* ─── Sub-components ─── */
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
        <span style={{ fontSize: '42px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: '#fff' }}>{value}</span>
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

function ViewSiteBtn({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '9px 14px',
        background: hov ? '#E8321A' : 'transparent',
        border: `1px dashed ${hov ? '#E8321A' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '10px',
        color: hov ? '#fff' : '#aaa',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: hov ? '0 0 16px rgba(232,50,26,0.3)' : 'none',
        whiteSpace: 'nowrap',
      }}
    >VIEW SITE</button>
  )
}

function AdminBtn({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '9px 14px',
        background: hov ? 'rgba(255,255,255,0.1)' : 'transparent',
        border: `1px solid ${hov ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '10px',
        color: hov ? '#fff' : '#aaa',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}
    >ADMIN</button>
  )
}
