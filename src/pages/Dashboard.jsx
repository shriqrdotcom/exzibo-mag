import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { TrendingUp, Filter, Download, ChevronLeft, ChevronRight, Plus } from 'lucide-react'

const STATIC_RESTAURANTS = [
  { uid: '8472910472', name: 'THE GLOBAL FORK', status: 'RUNNING', date: 'Oct 24, 2023', tables: 42, payment: '₹11,92,400', avatar: 'TG' },
  { uid: '9203847561', name: 'VELVET LOUNGE', status: 'PENDING', date: 'Nov 12, 2023', tables: 18, payment: '₹0.00', avatar: 'VL' },
  { uid: '1049283746', name: 'KAI KITCHEN', status: 'RUNNING', date: 'Dec 05, 2023', tables: 112, payment: '₹43,50,820', avatar: 'KK' },
  { uid: '5561029384', name: 'SIMON PIZZERIA', status: 'RUNNING', date: 'Jan 14, 2024', tables: 24, payment: '₹7,46,400', avatar: 'SP' },
]

function getAvatarFromName(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [currentPage, setCurrentPage] = useState(1)
  const [restaurants, setRestaurants] = useState(STATIC_RESTAURANTS)

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const mapped = saved.map(r => ({
      uid: r.id,
      name: r.name.toUpperCase(),
      status: r.status === 'active' ? 'RUNNING' : r.status === 'paused' ? 'PAUSED' : 'PENDING',
      date: formatDate(r.createdAt),
      tables: parseInt(r.tables) || 0,
      payment: '₹0.00',
      avatar: getAvatarFromName(r.name),
      isNew: true,
    }))
    setRestaurants([...mapped, ...STATIC_RESTAURANTS])
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            <KPICard
              label="ACTIVE OPERATIONS"
              value="1,284"
              badge="+12.5%"
              badgeIcon={<TrendingUp size={11} />}
            />
            <KPICard label="TOTAL REVENUE" value="₹2.4Cr" />
            <KPICard label="AVG TICKET" value="₹7,050" />
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
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Enterprise Partners</h2>
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
                {restaurants.map((r, i) => {
                  const dotColor = r.status === 'RUNNING' ? '#E8321A' : r.status === 'PAUSED' ? '#FFB800' : '#555'
                  const labelColor = r.status === 'RUNNING' ? '#E8321A' : r.status === 'PAUSED' ? '#FFB800' : '#666'
                  return (
                    <tr key={r.uid + i} style={{
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
                            background: r.isNew ? 'rgba(232,50,26,0.15)' : 'linear-gradient(135deg, #333, #222)',
                            border: r.isNew ? '1px solid rgba(232,50,26,0.25)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', fontWeight: 700,
                            color: r.isNew ? '#E8321A' : '#888',
                          }}>{r.avatar}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>{r.uid}</div>
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
                        <EditMenuBtn onClick={() => navigate('/menu-editor')} active={r.status === 'RUNNING'} />
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
              <span style={{ fontSize: '12px', color: '#555' }}>Showing {restaurants.length} restaurants</span>
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
