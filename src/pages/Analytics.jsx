import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, Zap, Receipt, Wifi, Plus } from 'lucide-react'

const weeklyData = [
  { day: 'Mon', revenue: 1500000 },
  { day: 'Tue', revenue: 1850000 },
  { day: 'Wed', revenue: 1620000 },
  { day: 'Thu', revenue: 2350000 },
  { day: 'Fri', revenue: 3500000 },
  { day: 'Sat', revenue: 5420000 },
  { day: 'Sun', revenue: 4600000 },
]

const dailyData = [
  { day: '9am', revenue: 165000 },
  { day: '11am', revenue: 375000 },
  { day: '1pm', revenue: 1000000 },
  { day: '3pm', revenue: 585000 },
  { day: '5pm', revenue: 750000 },
  { day: '7pm', revenue: 1500000 },
  { day: '9pm', revenue: 1165000 },
]

const hubs = [
  { location: 'Mumbai Central', abbr: 'MU', volume: '1.2k orders', status: 'PEAK', net: '₹3.5Cr' },
  { location: 'Delhi Connaught', abbr: 'DL', volume: '890 orders', status: 'STABLE', net: '₹2.6Cr' },
  { location: 'Bengaluru Koramangala', abbr: 'BL', volume: '640 orders', status: 'PEAK', net: '₹1.54Cr' },
]

const livePulse = [
  { msg: 'New Order at Mumbai Central', time: '2 mins ago • ₹20,450', type: 'order' },
  { msg: 'Network node Optimised in Delhi', time: '5 mins ago', type: 'system' },
  { msg: 'Menu updated: Bengaluru Koramangala', time: '12 mins ago', type: 'update' },
]

export default function Analytics() {
  const [timeframe, setTimeframe] = useState('weekly')

  const data = timeframe === 'weekly' ? weeklyData : dailyData

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader subtitle="Performance Analytics" />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
            <StatCard icon={<Receipt size={16} />} label="TOTAL REVENUE" value="₹35Cr" badge="+12.4%" />
            <StatCard icon={<Zap size={16} />} label="ACTIVE NODES" value="124" badge="LIVE" live />
            <StatCard icon={<Receipt size={16} />} label="AVG TICKET" value="₹7,050" badge="STABLE" neutral />
            <StatCard icon={<Wifi size={16} />} label="NETWORK UPTIME" value="99.9%" badge="OPTIMAL" good />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', marginBottom: '20px' }}>
            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '28px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>Performance Core</div>
                  <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Revenue Growth Trends</h2>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['daily', 'weekly'].map(t => (
                    <button key={t} onClick={() => setTimeframe(t)} style={{
                      padding: '7px 16px',
                      borderRadius: '6px',
                      background: timeframe === t ? '#E8321A' : 'rgba(255,255,255,0.04)',
                      border: 'none',
                      color: timeframe === t ? '#fff' : '#666',
                      fontSize: '11px', fontWeight: 700,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      transition: 'all 0.2s',
                      boxShadow: timeframe === t ? '0 0 16px rgba(232,50,26,0.3)' : 'none',
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#E8321A', display: 'inline-block' }} />
                <span style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gross Revenue</span>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E8321A" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#E8321A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    formatter={(val) => [`₹${(val / 100000).toFixed(2)}L`, 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#E8321A" strokeWidth={2.5} fill="url(#revenueGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '24px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#555', marginBottom: '20px', textTransform: 'uppercase' }}>Category Split</div>

              <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto 20px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[{ value: 64 }, { value: 22 }, { value: 14 }]}
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={72}
                      startAngle={90} endAngle={-270}
                      strokeWidth={0}
                    >
                      <Cell fill="#E8321A" />
                      <Cell fill="#3a1010" />
                      <Cell fill="#2a2a2a" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>TOP</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.02em' }}>DINING</div>
                </div>
              </div>

              {[
                { label: 'DINE-IN', value: '64%', color: '#E8321A' },
                { label: 'TAKEOUT', value: '22%', color: '#8a1a1a' },
                { label: 'DELIVERY', value: '14%', color: '#444' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: item.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '12px', color: '#666', letterSpacing: '0.06em' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '20px' }}>
            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#555', textTransform: 'uppercase' }}>Elite Performance Hubs</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['HUB LOCATION', 'VOLUME', 'STATUS', 'NET'].map(h => (
                      <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', color: '#444', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hubs.map((hub, i) => (
                    <tr key={hub.location} style={{ borderBottom: i < hubs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #E8321A, #8a1a1a)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', fontWeight: 800, color: '#fff',
                          }}>{hub.abbr}</div>
                          <span style={{ fontSize: '14px', fontWeight: 600 }}>{hub.location}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: '#888', fontSize: '13px' }}>{hub.volume}</td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          padding: '5px 12px',
                          background: hub.status === 'PEAK' ? 'rgba(232,50,26,0.12)' : 'rgba(34,197,94,0.1)',
                          border: `1px solid ${hub.status === 'PEAK' ? 'rgba(232,50,26,0.25)' : 'rgba(34,197,94,0.2)'}`,
                          borderRadius: '50px',
                          fontSize: '11px', fontWeight: 700,
                          color: hub.status === 'PEAK' ? '#E8321A' : '#4ade80',
                        }}>{hub.status}</span>
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: '15px', fontWeight: 800, color: '#fff' }}>{hub.net}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#555', textTransform: 'uppercase' }}>Live Pulse</div>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#E8321A', boxShadow: '0 0 8px #E8321A', display: 'inline-block', animation: 'pulse-glow 2s ease-in-out infinite' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {livePulse.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '10px',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%', marginTop: '4px', flexShrink: 0,
                      background: item.type === 'order' ? '#E8321A' : item.type === 'system' ? '#60a5fa' : '#4ade80',
                      boxShadow: item.type === 'order' ? '0 0 6px rgba(232,50,26,0.6)' : 'none',
                    }} />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{item.msg}</div>
                      <div style={{ fontSize: '10px', color: '#555' }}>{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      <button style={{
        position: 'fixed', bottom: '28px', right: '28px',
        width: '52px', height: '52px', borderRadius: '50%',
        background: '#E8321A', border: 'none', color: '#fff',
        cursor: 'pointer', boxShadow: '0 0 30px rgba(232,50,26,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s',
      }}>
        <Plus size={22} />
      </button>
    </div>
  )
}

function StatCard({ icon, label, value, badge, live, neutral, good }) {
  const badgeColor = live ? '#E8321A' : neutral ? '#888' : good ? '#22c55e' : '#E8321A'
  return (
    <div style={{
      background: '#111',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '18px',
      padding: '22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>{label}</div>
        <span style={{ color: '#444' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '30px', fontWeight: 800, marginBottom: '6px' }}>{value}</div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: badgeColor }}>
        {live && <span style={{ marginRight: '4px' }}>●</span>}{badge}
      </div>
    </div>
  )
}
