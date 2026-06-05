import React, { useState } from 'react'
import { Clock, ArrowRight, Info, AlertTriangle, CheckCircle, Utensils, CalendarDays, Globe, LayoutDashboard, Timer, ChevronDown, ChevronUp } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'

const ACCENT = '#E8321A'
const BG_CARD = '#111'
const BORDER = 'rgba(255,255,255,0.06)'

const EXPIRY_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '11px 22px',
        borderRadius: '10px',
        background: active ? ACCENT : 'transparent',
        border: active ? 'none' : `1px solid ${BORDER}`,
        color: active ? '#fff' : '#666',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
          e.currentTarget.style.color = '#bbb'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.borderColor = BORDER
          e.currentTarget.style.color = '#666'
        }
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}

function SectionHeading({ icon: Icon, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '24px' }}>
      <div style={{
        width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
        background: 'rgba(232,50,26,0.10)',
        border: '1px solid rgba(232,50,26,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={ACCENT} />
      </div>
      <div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#555', marginTop: '3px', lineHeight: 1.5 }}>{sub}</div>
      </div>
    </div>
  )
}

function RouteChip({ url, label }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      flex: 1,
      minWidth: '220px',
    }}>
      <div style={{
        fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em',
        color: '#555', textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{
        padding: '13px 16px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        fontFamily: 'monospace',
        fontSize: '12px',
        fontWeight: 600,
        color: '#e2e2e2',
        letterSpacing: '0.01em',
        lineHeight: 1.6,
        wordBreak: 'break-all',
      }}>
        {url}
      </div>
    </div>
  )
}

function ExpirySelector({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 18px',
          background: '#1a1a1a',
          border: `1px solid rgba(232,50,26,0.35)`,
          borderRadius: '10px',
          color: '#fff',
          fontSize: '22px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          cursor: 'pointer',
          minWidth: '140px',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: ACCENT }}>{value}</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#666', letterSpacing: '0.06em' }}>MIN</span>
        </span>
        {open ? <ChevronUp size={16} color="#666" /> : <ChevronDown size={16} color="#666" />}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 100,
          background: '#1a1a1a',
          border: `1px solid ${BORDER}`,
          borderRadius: '10px',
          overflow: 'hidden',
          minWidth: '140px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {EXPIRY_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%',
                padding: '11px 18px',
                background: opt === value ? 'rgba(232,50,26,0.12)' : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${BORDER}`,
                color: opt === value ? '#fff' : '#888',
                fontSize: '14px',
                fontWeight: opt === value ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent' }}
            >
              <span>{opt} minutes</span>
              {opt === value && <CheckCircle size={13} color={ACCENT} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MenuTimeTab() {
  const [expiryMinutes, setExpiryMinutes] = useState(10)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Route Flow */}
      <div style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: '16px',
        padding: '28px',
      }}>
        <SectionHeading
          icon={Globe}
          title="Route Flow"
          sub="How customers reach the menu and how orders arrive at the dashboard"
        />

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          padding: '20px',
          background: 'rgba(255,255,255,0.025)',
          borderRadius: '12px',
          border: `1px solid rgba(255,255,255,0.06)`,
          marginBottom: '20px',
        }}>
          <RouteChip
            label="Customer Menu URL"
            url="menu.exzibo.online / {restaurant-slug} / {page-slug} / {table-number}"
          />

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
          }}>
            <ArrowRight size={20} color={ACCENT} />
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>sends to</span>
          </div>

          <RouteChip
            label="Dashboard Management URL"
            url="dashboard.exzibo.online / {restaurant-slug} / {page-slug}"
          />
        </div>

        {/* Explanation */}
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '16px 18px',
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.15)',
          borderRadius: '10px',
        }}>
          <Info size={16} color="#3B82F6" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.65 }}>
            Customers place orders via the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>menu route</span> by scanning the QR code at their table. Every new order is instantly visible in the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>dashboard route</span>, where your team can accept, prepare, and complete it in real time.
          </div>
        </div>
      </div>

      {/* Auto Order Expiry */}
      <div style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: '16px',
        padding: '28px',
      }}>
        <SectionHeading
          icon={Timer}
          title="Auto Order Expiry"
          sub="Automatically mark unaccepted orders as failed after the set time window"
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>

          {/* Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>
              Expiry Window
            </div>
            <ExpirySelector value={expiryMinutes} onChange={setExpiryMinutes} />
            <div style={{ fontSize: '11px', color: '#444', maxWidth: '200px', lineHeight: 1.5 }}>
              Default is <span style={{ color: '#777', fontWeight: 600 }}>10 minutes</span>. Orders pending longer than this are auto-marked failed.
            </div>
          </div>

          {/* Visual timeline */}
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '14px' }}>
              Order Lifecycle
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {[
                { icon: '📲', label: 'Customer places order', color: '#3B82F6', step: 1 },
                { icon: '⏳', label: `Dashboard has ${expiryMinutes} min to accept`, color: '#F59E0B', step: 2 },
                { icon: '✅', label: 'Accepted → Preparing → Complete', color: '#22c55e', step: 3, alt: true },
                { icon: '❌', label: 'Not accepted → Auto marked Failed', color: '#EF4444', step: 3 },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: `rgba(${item.color === '#22c55e' ? '34,197,94' : item.color === '#EF4444' ? '239,68,68' : item.color === '#F59E0B' ? '245,158,11' : '59,130,246'},0.12)`,
                      border: `1px solid ${item.color}33`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px',
                      zIndex: 1,
                    }}>
                      {item.icon}
                    </div>
                    {i < 2 && (
                      <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.07)' }} />
                    )}
                    {i === 2 && (
                      <div style={{ width: '1px', height: '18px', background: 'transparent' }} />
                    )}
                  </div>
                  <div style={{ paddingTop: '6px', paddingBottom: i < 3 ? '0' : '0' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: item.alt ? '#22c55e' : item.color === '#EF4444' ? '#EF4444' : '#ccc', lineHeight: 1.4 }}>
                      {item.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Description box */}
        <div style={{
          marginTop: '24px',
          display: 'flex',
          gap: '12px',
          padding: '18px 20px',
          background: 'rgba(232,50,26,0.05)',
          border: '1px solid rgba(232,50,26,0.15)',
          borderRadius: '12px',
        }}>
          <AlertTriangle size={18} color="#E8321A" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '6px', letterSpacing: '0.01em' }}>
              How Auto Expiry Works
            </div>
            <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.7 }}>
              When a customer submits an order, a countdown starts. If your dashboard team does not <strong style={{ color: '#bbb' }}>Accept</strong> or <strong style={{ color: '#bbb' }}>Confirm</strong> the order within <strong style={{ color: ACCENT }}>{expiryMinutes} minutes</strong>, the system will automatically change the order status to <strong style={{ color: '#EF4444' }}>Failed</strong>. This prevents stale orders from cluttering the queue and ensures customers receive timely feedback. You can adjust this window above to suit your kitchen's response capacity.
            </div>
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={handleSave}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 28px',
              background: saved ? '#22c55e' : ACCENT,
              border: 'none',
              borderRadius: '50px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              boxShadow: saved ? '0 0 20px rgba(34,197,94,0.35)' : '0 0 20px rgba(232,50,26,0.35)',
            }}
          >
            {saved ? <><CheckCircle size={14} /> SAVED</> : <><Timer size={14} /> SAVE SETTINGS</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function BookingTimeTab() {
  const [expiryHours, setExpiryHours] = useState(24)
  const [saved, setSaved] = useState(false)
  const HOUR_OPTIONS = [1, 2, 4, 6, 12, 24, 48]

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Booking Route Flow */}
      <div style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: '16px',
        padding: '28px',
      }}>
        <SectionHeading
          icon={CalendarDays}
          title="Booking Route Flow"
          sub="How customers submit table reservations and how they are managed"
        />

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          padding: '20px',
          background: 'rgba(255,255,255,0.025)',
          borderRadius: '12px',
          border: `1px solid rgba(255,255,255,0.06)`,
          marginBottom: '20px',
        }}>
          <RouteChip
            label="Customer Booking URL"
            url="menu.exzibo.online / {restaurant-slug} / booking / {table-number}"
          />

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
          }}>
            <ArrowRight size={20} color="#A855F7" />
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>sends to</span>
          </div>

          <RouteChip
            label="Dashboard Bookings Panel"
            url="dashboard.exzibo.online / {restaurant-slug} / bookings"
          />
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '16px 18px',
          background: 'rgba(168,85,247,0.06)',
          border: '1px solid rgba(168,85,247,0.15)',
          borderRadius: '10px',
        }}>
          <Info size={16} color="#A855F7" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.65 }}>
            Customers request a reservation via the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>booking page</span>. Each request lands in the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>Bookings panel</span> on the dashboard where your team can confirm or decline it before the auto-expiry window closes.
          </div>
        </div>
      </div>

      {/* Auto Booking Expiry */}
      <div style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: '16px',
        padding: '28px',
      }}>
        <SectionHeading
          icon={Timer}
          title="Auto Booking Expiry"
          sub="Automatically expire unresponded booking requests after the set window"
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>
              Expiry Window
            </div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select
                value={expiryHours}
                onChange={e => setExpiryHours(Number(e.target.value))}
                style={{
                  appearance: 'none',
                  padding: '12px 48px 12px 18px',
                  background: '#1a1a1a',
                  border: '1px solid rgba(168,85,247,0.35)',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '22px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  outline: 'none',
                  minWidth: '140px',
                }}
              >
                {HOUR_OPTIONS.map(h => (
                  <option key={h} value={h} style={{ background: '#1a1a1a', fontSize: '14px' }}>
                    {h} {h === 1 ? 'hour' : 'hours'}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} color="#666" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
            <div style={{ fontSize: '11px', color: '#444', maxWidth: '200px', lineHeight: 1.5 }}>
              Default is <span style={{ color: '#777', fontWeight: 600 }}>24 hours</span>. Booking requests not responded to within this window are auto-expired.
            </div>
          </div>

          {/* Booking lifecycle */}
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '14px' }}>
              Booking Lifecycle
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {[
                { icon: '📅', label: 'Customer submits booking request', color: '#A855F7' },
                { icon: '⏳', label: `Dashboard has ${expiryHours}h to confirm`, color: '#F59E0B' },
                { icon: '✅', label: 'Confirmed → Reserved', color: '#22c55e', alt: true },
                { icon: '❌', label: 'No response → Auto Expired', color: '#EF4444' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: `${item.color}18`,
                      border: `1px solid ${item.color}33`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', zIndex: 1,
                    }}>
                      {item.icon}
                    </div>
                    {i < 2 && <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.07)' }} />}
                    {i === 2 && <div style={{ width: '1px', height: '18px', background: 'transparent' }} />}
                  </div>
                  <div style={{ paddingTop: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: item.alt ? '#22c55e' : item.color === '#EF4444' ? '#EF4444' : '#ccc', lineHeight: 1.4 }}>
                      {item.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Description box */}
        <div style={{
          marginTop: '24px',
          display: 'flex',
          gap: '12px',
          padding: '18px 20px',
          background: 'rgba(168,85,247,0.05)',
          border: '1px solid rgba(168,85,247,0.15)',
          borderRadius: '12px',
        }}>
          <AlertTriangle size={18} color="#A855F7" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '6px', letterSpacing: '0.01em' }}>
              How Booking Expiry Works
            </div>
            <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.7 }}>
              When a customer submits a table reservation, the booking enters a <strong style={{ color: '#bbb' }}>Pending</strong> state. Your team must <strong style={{ color: '#bbb' }}>Confirm</strong> or <strong style={{ color: '#bbb' }}>Decline</strong> within <strong style={{ color: '#A855F7' }}>{expiryHours} hour{expiryHours !== 1 ? 's' : ''}</strong>. If no action is taken, the booking is automatically set to <strong style={{ color: '#EF4444' }}>Expired</strong>. This keeps the bookings queue clean and ensures customers are not left waiting indefinitely for a response.
            </div>
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={handleSave}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 28px',
              background: saved ? '#22c55e' : '#A855F7',
              border: 'none',
              borderRadius: '50px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              boxShadow: saved ? '0 0 20px rgba(34,197,94,0.35)' : '0 0 20px rgba(168,85,247,0.35)',
            }}
          >
            {saved ? <><CheckCircle size={14} /> SAVED</> : <><Timer size={14} /> SAVE SETTINGS</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrderTimePage() {
  const [activeTab, setActiveTab] = useState('menu')

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px 36px' }}>

          {/* Page header */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'rgba(232,50,26,0.10)',
                border: '1px solid rgba(232,50,26,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={20} color={ACCENT} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
                  Order Time
                </h1>
                <p style={{ margin: 0, fontSize: '13px', color: '#555', marginTop: '3px' }}>
                  Configure expiry windows and understand your order &amp; booking route flow
                </p>
              </div>
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginTop: '20px' }} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
            <TabButton
              active={activeTab === 'menu'}
              onClick={() => setActiveTab('menu')}
              icon={Utensils}
              label="MENU TIME"
            />
            <TabButton
              active={activeTab === 'booking'}
              onClick={() => setActiveTab('booking')}
              icon={CalendarDays}
              label="BOOKING TIME"
            />
          </div>

          {/* Tab content */}
          {activeTab === 'menu' ? <MenuTimeTab /> : <BookingTimeTab />}

        </main>
      </div>
    </div>
  )
}
