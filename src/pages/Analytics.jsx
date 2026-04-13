import React from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { BarChart2, CalendarDays, LayoutGrid, CalendarCheck, Users } from 'lucide-react'
import { useAnalytics } from '../context/AnalyticsContext'

const wealthData = [38, 62, 58, 44, 42, 60, 64, 58, 62, 55, 48, 42]
const chartW = 340
const chartH = 120
const minV = 35
const maxV = 75

function pointsFromData(data, w, h) {
  const step = w / (data.length - 1)
  return data.map((v, i) => {
    const x = i * step
    const y = h - ((v - minV) / (maxV - minV)) * h
    return [x, y]
  })
}

function LineChart() {
  const pts = pointsFromData(wealthData, chartW, chartH)
  const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const areaPath =
    `M ${pts[0][0]},${chartH} ` +
    pts.map(([x, y]) => `L ${x},${y}`).join(' ') +
    ` L ${pts[pts.length - 1][0]},${chartH} Z`

  return (
    <svg
      viewBox={`0 0 ${chartW} ${chartH + 8}`}
      style={{ width: '100%', height: '130px' }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8321A" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#E8321A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[35, 55, 75].map((label, i) => {
        const y = chartH - ((label - minV) / (maxV - minV)) * chartH
        return (
          <line
            key={i}
            x1={0} y1={y} x2={chartW} y2={y}
            stroke="#e5e5ea" strokeWidth="1" strokeDasharray="4 3"
          />
        )
      })}
      <path d={areaPath} fill="url(#lineGrad)" />
      <polyline
        points={polyline}
        fill="none"
        stroke="#E8321A"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#E8321A" strokeWidth="2" />
      ))}
    </svg>
  )
}

function DonutChart({ segments }) {
  const total = segments.reduce((s, d) => s + d.value, 0)
  const cx = 60, cy = 60, r = 44, strokeW = 18
  const circ = 2 * Math.PI * r
  let cumulative = 0

  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      <svg viewBox="0 0 120 120" width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circ
          const gap = circ - dash
          const offset = (cumulative / total) * circ
          cumulative += seg.value
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeW}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
            />
          )
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 2,
      }}>
        <span style={{ fontSize: 20 }}>🏠</span>
        <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>   </span>
      </div>
    </div>
  )
}

const card = {
  background: '#fff',
  borderRadius: '20px',
  padding: '20px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
}

export default function Analytics() {
  const { totalWealth, todaysCollection, totalCustomers, totalBookings, categoryData } = useAnalytics()

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader subtitle="Analytics" showSearch={false} />
        <main style={{ flex: 1, overflowY: 'auto', background: '#f0f0f5', padding: '28px 24px' }}>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111', letterSpacing: '-0.5px', margin: 0 }}>
                ANALYTICS PAGE
              </h1>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ ...card, padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
                  <BarChart2 size={18} color="#555" />
                </div>
                <div style={{ ...card, padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
                  <CalendarDays size={18} color="#555" />
                </div>
              </div>
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>Overview</span>
                <BarChart2 size={18} color="#aaa" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: '#111' }}>{totalWealth}</span>
                <span style={{ fontSize: 13, color: '#888' }}>Total wealth</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                <span>75k</span>
              </div>
              <LineChart />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginTop: 2 }}>
                <span>35k</span>
                <span>55k</span>
                <span>75k</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={{ background: '#6C63FF', borderRadius: '20px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.4 }}>
                    Todays<br />Collection
                  </span>
                  <LayoutGrid size={16} color="rgba(255,255,255,0.7)" />
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
                  {todaysCollection}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Total in INR.
                </div>
              </div>

              <div style={{ ...card }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#333', lineHeight: 1.4 }}>
                    Total<br />customer
                  </span>
                  <Users size={18} color="#aaa" />
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#111', marginBottom: 4 }}>
                  {totalCustomers.toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: '#6C63FF', fontWeight: 600 }}>
                  +12% this month
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>Category</span>
                  <CalendarCheck size={16} color="#aaa" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <DonutChart segments={categoryData} />
                </div>
              </div>

              <div style={{ ...card }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#333', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.4 }}>
                    Total<br />Booking
                  </span>
                  <CalendarCheck size={16} color="#aaa" />
                </div>
                <div style={{ fontSize: 44, fontWeight: 900, color: '#111', marginBottom: 4, lineHeight: 1 }}>
                  {totalBookings.toLocaleString()}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
                  Bookings this month
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
