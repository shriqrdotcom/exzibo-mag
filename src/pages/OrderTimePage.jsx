import React, { useState, useEffect } from 'react'
import {
  Clock, ArrowRight, Info, AlertTriangle, CheckCircle, Utensils, CalendarDays,
  Globe, Timer, ChevronDown, ChevronUp, Trash2, ShieldCheck,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { getCleanupSettings, saveCleanupSettings, runOrderAutoCleanup } from '../lib/orderCleanup'

const ACCENT   = '#E8321A'
const BLUE     = '#3B82F6'
const BG_CARD  = '#111'
const BORDER   = 'rgba(255,255,255,0.06)'

const EXPIRY_OPTIONS  = [5, 10, 15, 20, 30, 45, 60]
const CONFIRM_HOURS   = [1, 2, 4, 6, 8, 12, 24, 48, 72]
const REJECTED_MINS   = [5, 10, 15, 20, 30, 45, 60]

// ─── Shared primitives ───────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '11px 22px', borderRadius: '10px',
        background: active ? ACCENT : 'transparent',
        border: active ? 'none' : `1px solid ${BORDER}`,
        color: active ? '#fff' : '#666',
        fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
        cursor: 'pointer', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#bbb' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = '#666' } }}
    >
      <Icon size={14} />{label}
    </button>
  )
}

function SectionHeading({ icon: Icon, title, sub, accent = ACCENT }) {
  const rgba = accent === BLUE ? '59,130,246' : '232,50,26'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '24px' }}>
      <div style={{
        width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
        background: `rgba(${rgba},0.10)`, border: `1px solid rgba(${rgba},0.18)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={accent} />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '220px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', color: '#555', textTransform: 'uppercase' }}>{label}</div>
      <div style={{
        padding: '13px 16px', background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
        fontFamily: 'monospace', fontSize: '12px', fontWeight: 600,
        color: '#e2e2e2', lineHeight: 1.6, wordBreak: 'break-all',
      }}>{url}</div>
    </div>
  )
}

function Lifecycle({ steps }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {steps.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%',
              background: `${item.color}18`, border: `1px solid ${item.color}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', zIndex: 1,
            }}>{item.icon}</div>
            {i < steps.length - 1 && <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.07)' }} />}
          </div>
          <div style={{ paddingTop: '5px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: item.textColor || '#ccc', lineHeight: 1.4 }}>{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Generic small dropdown for minutes or hours
function SmallDropdown({ value, options, onChange, unit, accent = ACCENT }) {
  const [open, setOpen] = useState(false)
  const rgba = accent === BLUE ? '59,130,246' : '232,50,26'
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 16px', background: '#1a1a1a',
          border: `1px solid rgba(${rgba},0.35)`, borderRadius: '10px',
          color: '#fff', fontSize: '20px', fontWeight: 800,
          cursor: 'pointer', minWidth: '130px', justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ color: accent }}>{value}</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#666', letterSpacing: '0.06em' }}>{unit.toUpperCase()}</span>
        </span>
        {open ? <ChevronUp size={14} color="#666" /> : <ChevronDown size={14} color="#666" />}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: '#1a1a1a', border: `1px solid ${BORDER}`, borderRadius: '10px',
          overflow: 'hidden', minWidth: '130px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '10px 16px',
                background: opt === value ? `rgba(${rgba},0.12)` : 'transparent',
                border: 'none', borderBottom: `1px solid ${BORDER}`,
                color: opt === value ? '#fff' : '#888',
                fontSize: '13px', fontWeight: opt === value ? 700 : 500,
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent' }}
            >
              <span>{opt} {unit}{opt !== 1 && unit.endsWith('hour') ? 's' : ''}</span>
              {opt === value && <CheckCircle size={12} color={accent} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Red ExpirySelector (existing style) ─────────────────────────────────────

function ExpirySelector({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px',
          background: '#1a1a1a', border: `1px solid rgba(232,50,26,0.35)`, borderRadius: '10px',
          color: '#fff', fontSize: '22px', fontWeight: 800, cursor: 'pointer',
          minWidth: '140px', justifyContent: 'space-between',
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
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
          background: '#1a1a1a', border: `1px solid ${BORDER}`, borderRadius: '10px',
          overflow: 'hidden', minWidth: '140px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {EXPIRY_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '11px 18px',
                background: opt === value ? 'rgba(232,50,26,0.12)' : 'transparent',
                border: 'none', borderBottom: `1px solid ${BORDER}`,
                color: opt === value ? '#fff' : '#888',
                fontSize: '14px', fontWeight: opt === value ? 700 : 500,
                cursor: 'pointer', textAlign: 'left',
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

// ─── Blue save button ─────────────────────────────────────────────────────────

function BlueSaveButton({ saved, onClick, label = 'SAVE SETTINGS' }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 24px',
        background: saved ? '#22c55e' : BLUE,
        border: 'none', borderRadius: '50px', color: '#fff',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
        cursor: 'pointer', transition: 'all 0.25s ease',
        boxShadow: saved ? '0 0 18px rgba(34,197,94,0.35)' : '0 0 18px rgba(59,130,246,0.35)',
      }}
    >
      {saved ? <><CheckCircle size={13} /> SAVED</> : <><ShieldCheck size={13} /> {label}</>}
    </button>
  )
}

// ─── Cleanup card sub-component ───────────────────────────────────────────────

function CleanupCard({ title, sub, icon: Icon, value, unit, options, onChange, steps, infoText, onSave, saved, runResult, onRunNow }) {
  return (
    <div style={{
      flex: 1, minWidth: '280px',
      background: '#0e0e0e',
      border: `1px solid rgba(59,130,246,0.18)`,
      borderRadius: '16px',
      padding: '24px',
      display: 'flex', flexDirection: 'column', gap: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
          background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '0.01em' }}>{title}</div>
          <div style={{ fontSize: '11px', color: '#555', marginTop: '3px', lineHeight: 1.4 }}>{sub}</div>
        </div>
      </div>

      {/* Timer selector row */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#444', textTransform: 'uppercase', marginBottom: '10px' }}>
          Delete after
        </div>
        <SmallDropdown value={value} options={options} onChange={onChange} unit={unit} accent={BLUE} />
        <div style={{ fontSize: '11px', color: '#3a3a3a', marginTop: '8px', lineHeight: 1.5 }}>
          Default is <span style={{ color: '#555', fontWeight: 600 }}>{unit === 'hour' ? `${options[Math.floor(options.length / 2)]} hours` : `${options[0]} minutes`}</span>
        </div>
      </div>

      {/* Lifecycle */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#444', textTransform: 'uppercase', marginBottom: '10px' }}>
          Cleanup flow
        </div>
        <Lifecycle steps={steps} />
      </div>

      {/* Info box */}
      <div style={{
        display: 'flex', gap: '10px', padding: '14px 16px',
        background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.14)',
        borderRadius: '10px',
      }}>
        <Info size={14} color={BLUE} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '11px', color: '#777', lineHeight: 1.65 }}>{infoText}</div>
      </div>

      {/* Run result */}
      {runResult && (
        <div style={{
          fontSize: '11px', color: '#22c55e', fontWeight: 600,
          padding: '8px 12px', background: 'rgba(34,197,94,0.06)',
          border: '1px solid rgba(34,197,94,0.15)', borderRadius: '8px',
        }}>
          ✓ Cleanup ran — {runResult}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 'auto' }}>
        <button
          onClick={onRunNow}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 18px', background: 'transparent',
            border: '1px solid rgba(59,130,246,0.3)', borderRadius: '50px',
            color: BLUE, fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <Trash2 size={12} /> RUN NOW
        </button>
        <BlueSaveButton saved={saved} onClick={onSave} />
      </div>
    </div>
  )
}

// ─── MENU TIME tab ────────────────────────────────────────────────────────────

function MenuTimeTab() {
  const [expiryMinutes, setExpiryMinutes] = useState(10)
  const [saved, setSaved] = useState(false)

  // Cleanup settings — loaded from localStorage
  const [confirmedHours, setConfirmedHours]   = useState(12)
  const [rejectedMins,   setRejectedMins]     = useState(10)
  const [savedConfirmed, setSavedConfirmed]   = useState(false)
  const [savedRejected,  setSavedRejected]    = useState(false)
  const [resultConfirmed, setResultConfirmed] = useState(null)
  const [resultRejected,  setResultRejected]  = useState(null)

  useEffect(() => {
    const s = getCleanupSettings()
    setConfirmedHours(s.confirmedDeleteHours)
    setRejectedMins(s.rejectedDeleteMinutes)
  }, [])

  function handleSave() { setSaved(true); setTimeout(() => setSaved(false), 2200) }

  function handleSaveConfirmed() {
    saveCleanupSettings({ confirmedDeleteHours: confirmedHours })
    setSavedConfirmed(true)
    setTimeout(() => setSavedConfirmed(false), 2200)
  }

  function handleSaveRejected() {
    saveCleanupSettings({ rejectedDeleteMinutes: rejectedMins })
    setSavedRejected(true)
    setTimeout(() => setSavedRejected(false), 2200)
  }

  async function handleRunConfirmed() {
    setResultConfirmed(null)
    const r = await runOrderAutoCleanup({ confirmedDeleteHours: confirmedHours, rejectedDeleteMinutes: 0 })
    setResultConfirmed(r.deletedConfirmed != null ? `${r.deletedConfirmed} completed order(s) removed` : 'Done')
    setTimeout(() => setResultConfirmed(null), 6000)
  }

  async function handleRunRejected() {
    setResultRejected(null)
    const r = await runOrderAutoCleanup({ confirmedDeleteHours: 999999, rejectedDeleteMinutes: rejectedMins })
    setResultRejected(r.deletedRejected != null ? `${r.deletedRejected} rejected order(s) removed` : 'Done')
    setTimeout(() => setResultRejected(null), 6000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Route Flow */}
      <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '28px' }}>
        <SectionHeading icon={Globe} title="Route Flow" sub="How customers reach the menu and how orders arrive at the dashboard" />
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px',
          padding: '20px', background: 'rgba(255,255,255,0.025)',
          borderRadius: '12px', border: `1px solid rgba(255,255,255,0.06)`, marginBottom: '20px',
        }}>
          <RouteChip label="Customer Menu URL" url="menu.exzibo.online / {restaurant-slug} / {page-slug} / {table-number}" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <ArrowRight size={20} color={ACCENT} />
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>sends to</span>
          </div>
          <RouteChip label="Dashboard Management URL" url="dashboard.exzibo.online / {restaurant-slug} / {page-slug}" />
        </div>
        <div style={{ display: 'flex', gap: '12px', padding: '16px 18px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '10px' }}>
          <Info size={16} color={BLUE} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.65 }}>
            Customers place orders via the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>menu route</span> by scanning the QR code at their table. Every new order is instantly visible in the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>dashboard route</span>, where your team can accept, prepare, and complete it in real time.
          </div>
        </div>
      </div>

      {/* Auto Order Expiry */}
      <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '28px' }}>
        <SectionHeading icon={Timer} title="Auto Order Expiry" sub="Automatically mark unaccepted orders as failed after the set time window" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>Expiry Window</div>
            <ExpirySelector value={expiryMinutes} onChange={setExpiryMinutes} />
            <div style={{ fontSize: '11px', color: '#444', maxWidth: '200px', lineHeight: 1.5 }}>
              Default is <span style={{ color: '#777', fontWeight: 600 }}>10 minutes</span>. Orders pending longer are auto-marked failed.
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '14px' }}>Order Lifecycle</div>
            <Lifecycle steps={[
              { icon: '📲', label: 'Customer places order',                         color: '#3B82F6' },
              { icon: '⏳', label: `Dashboard has ${expiryMinutes} min to accept`, color: '#F59E0B' },
              { icon: '✅', label: 'Accepted → Preparing → Complete',               color: '#22c55e', textColor: '#22c55e' },
              { icon: '❌', label: 'Not accepted → Auto marked Failed',             color: '#EF4444', textColor: '#EF4444' },
            ]} />
          </div>
        </div>
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', padding: '18px 20px', background: 'rgba(232,50,26,0.05)', border: '1px solid rgba(232,50,26,0.15)', borderRadius: '12px' }}>
          <AlertTriangle size={18} color={ACCENT} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>How Auto Expiry Works</div>
            <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.7 }}>
              When a customer submits an order, a countdown starts. If your dashboard team does not <strong style={{ color: '#bbb' }}>Accept</strong> or <strong style={{ color: '#bbb' }}>Confirm</strong> the order within <strong style={{ color: ACCENT }}>{expiryMinutes} minutes</strong>, the system automatically changes the order status to <strong style={{ color: '#EF4444' }}>Failed</strong>.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={handleSave}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px',
              background: saved ? '#22c55e' : ACCENT, border: 'none', borderRadius: '50px',
              color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
              cursor: 'pointer', transition: 'all 0.25s ease',
              boxShadow: saved ? '0 0 20px rgba(34,197,94,0.35)' : '0 0 20px rgba(232,50,26,0.35)',
            }}
          >
            {saved ? <><CheckCircle size={14} /> SAVED</> : <><Timer size={14} /> SAVE SETTINGS</>}
          </button>
        </div>
      </div>

      {/* ── Delete sections — side by side, blue ─────────────────────────────── */}
      <div>
        {/* Section header */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '3px', height: '22px', borderRadius: '2px',
              background: 'linear-gradient(180deg, #3B82F6, #1D4ED8)',
            }} />
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
              Auto Order Cleanup
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#444', marginTop: '6px', marginLeft: '13px' }}>
            Permanently remove stale orders from the database and dashboard history
          </div>
        </div>

        {/* Two cards side by side */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>

          {/* Card 1 — Delete Confirmed Orders */}
          <CleanupCard
            title="Delete Confirmed Orders"
            sub="Auto-delete completed orders after a set window"
            icon={CheckCircle}
            value={confirmedHours}
            unit="hour"
            options={CONFIRM_HOURS}
            onChange={setConfirmedHours}
            steps={[
              { icon: '✅', label: 'Order marked Completed / Confirmed', color: '#22c55e', textColor: '#22c55e' },
              { icon: '⏳', label: `Timer runs for ${confirmedHours} hour${confirmedHours !== 1 ? 's' : ''}`, color: '#F59E0B' },
              { icon: '🗑️', label: 'Order permanently deleted from DB', color: '#3B82F6', textColor: '#3B82F6' },
            ]}
            infoText={
              <>
                After an order reaches <strong style={{ color: '#ccc' }}>Completed</strong> or <strong style={{ color: '#ccc' }}>Confirmed</strong> status, it will be permanently removed from the database and dashboard history after <strong style={{ color: BLUE }}>{confirmedHours} hour{confirmedHours !== 1 ? 's' : ''}</strong>. This keeps your order queue clean without manual effort.
              </>
            }
            saved={savedConfirmed}
            onSave={handleSaveConfirmed}
            onRunNow={handleRunConfirmed}
            runResult={resultConfirmed}
          />

          {/* Card 2 — Delete Rejected Orders */}
          <CleanupCard
            title="Delete Rejected Orders"
            sub="Auto-delete rejected orders after a short window"
            icon={Trash2}
            value={rejectedMins}
            unit="minute"
            options={REJECTED_MINS}
            onChange={setRejectedMins}
            steps={[
              { icon: '❌', label: 'Admin rejects / cancels the order', color: '#EF4444', textColor: '#EF4444' },
              { icon: '⏳', label: `Timer runs for ${rejectedMins} minute${rejectedMins !== 1 ? 's' : ''}`, color: '#F59E0B' },
              { icon: '🗑️', label: 'Order permanently deleted from DB', color: '#3B82F6', textColor: '#3B82F6' },
            ]}
            infoText={
              <>
                When an admin sets an order to <strong style={{ color: '#ccc' }}>Rejected</strong> or <strong style={{ color: '#ccc' }}>Cancelled</strong>, it will be automatically wiped from the database after <strong style={{ color: BLUE }}>{rejectedMins} minute{rejectedMins !== 1 ? 's' : ''}</strong>. This prevents rejected orders from cluttering the dashboard history.
              </>
            }
            saved={savedRejected}
            onSave={handleSaveRejected}
            onRunNow={handleRunRejected}
            runResult={resultRejected}
          />

        </div>

        {/* Combined note */}
        <div style={{
          marginTop: '16px', display: 'flex', gap: '12px',
          padding: '16px 18px',
          background: 'rgba(59,130,246,0.04)',
          border: '1px solid rgba(59,130,246,0.10)',
          borderRadius: '12px',
        }}>
          <AlertTriangle size={16} color={BLUE} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.7 }}>
            <strong style={{ color: '#999' }}>Permanent deletion</strong> — orders removed by this cleanup are erased from the database, storage, and the dashboard order history. This action cannot be undone. The cleanup worker runs automatically every <strong style={{ color: '#777' }}>5 minutes</strong> in the background while the app is open.
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── BOOKING TIME tab ─────────────────────────────────────────────────────────

function BookingTimeTab() {
  const [expiryHours, setExpiryHours] = useState(24)
  const [saved, setSaved] = useState(false)
  const HOUR_OPTIONS = [1, 2, 4, 6, 12, 24, 48]

  function handleSave() { setSaved(true); setTimeout(() => setSaved(false), 2200) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Booking Route Flow */}
      <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '28px' }}>
        <SectionHeading icon={CalendarDays} title="Booking Route Flow" sub="How customers submit table reservations and how they are managed" />
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px',
          padding: '20px', background: 'rgba(255,255,255,0.025)',
          borderRadius: '12px', border: `1px solid rgba(255,255,255,0.06)`, marginBottom: '20px',
        }}>
          <RouteChip label="Customer Booking URL" url="menu.exzibo.online / {restaurant-slug} / booking / {table-number}" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <ArrowRight size={20} color="#A855F7" />
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>sends to</span>
          </div>
          <RouteChip label="Dashboard Bookings Panel" url="dashboard.exzibo.online / {restaurant-slug} / bookings" />
        </div>
        <div style={{ display: 'flex', gap: '12px', padding: '16px 18px', background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: '10px' }}>
          <Info size={16} color="#A855F7" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.65 }}>
            Customers request a reservation via the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>booking page</span>. Each request lands in the <span style={{ color: '#e2e2e2', fontWeight: 600 }}>Bookings panel</span> on the dashboard where your team can confirm or decline it before the auto-expiry window closes.
          </div>
        </div>
      </div>

      {/* Auto Booking Expiry */}
      <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '28px' }}>
        <SectionHeading icon={Timer} title="Auto Booking Expiry" sub="Automatically expire unresponded booking requests after the set window" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase' }}>Expiry Window</div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select
                value={expiryHours}
                onChange={e => setExpiryHours(Number(e.target.value))}
                style={{
                  appearance: 'none', padding: '12px 48px 12px 18px', background: '#1a1a1a',
                  border: '1px solid rgba(168,85,247,0.35)', borderRadius: '10px', color: '#fff',
                  fontSize: '22px', fontWeight: 800, cursor: 'pointer', outline: 'none', minWidth: '140px',
                }}
              >
                {HOUR_OPTIONS.map(h => (
                  <option key={h} value={h} style={{ background: '#1a1a1a', fontSize: '14px' }}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                ))}
              </select>
              <ChevronDown size={16} color="#666" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
            <div style={{ fontSize: '11px', color: '#444', maxWidth: '200px', lineHeight: 1.5 }}>
              Default is <span style={{ color: '#777', fontWeight: 600 }}>24 hours</span>. Booking requests not responded to within this window are auto-expired.
            </div>
          </div>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '14px' }}>Booking Lifecycle</div>
            <Lifecycle steps={[
              { icon: '📅', label: 'Customer submits booking request', color: '#A855F7' },
              { icon: '⏳', label: `Dashboard has ${expiryHours}h to confirm`, color: '#F59E0B' },
              { icon: '✅', label: 'Confirmed → Reserved',              color: '#22c55e', textColor: '#22c55e' },
              { icon: '❌', label: 'No response → Auto Expired',        color: '#EF4444', textColor: '#EF4444' },
            ]} />
          </div>
        </div>
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', padding: '18px 20px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: '12px' }}>
          <AlertTriangle size={18} color="#A855F7" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>How Booking Expiry Works</div>
            <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.7 }}>
              When a customer submits a table reservation, the booking enters a <strong style={{ color: '#bbb' }}>Pending</strong> state. Your team must <strong style={{ color: '#bbb' }}>Confirm</strong> or <strong style={{ color: '#bbb' }}>Decline</strong> within <strong style={{ color: '#A855F7' }}>{expiryHours} hour{expiryHours !== 1 ? 's' : ''}</strong>. If no action is taken, the booking is automatically set to <strong style={{ color: '#EF4444' }}>Expired</strong>.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={handleSave}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px',
              background: saved ? '#22c55e' : '#A855F7', border: 'none', borderRadius: '50px',
              color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
              cursor: 'pointer', transition: 'all 0.25s ease',
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

// ─── Page root ────────────────────────────────────────────────────────────────

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
                background: 'rgba(232,50,26,0.10)', border: '1px solid rgba(232,50,26,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={20} color={ACCENT} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>Order Time</h1>
                <p style={{ margin: 0, fontSize: '13px', color: '#555', marginTop: '3px' }}>
                  Configure expiry windows, cleanup rules, and understand your order &amp; booking route flow
                </p>
              </div>
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginTop: '20px' }} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
            <TabButton active={activeTab === 'menu'}    onClick={() => setActiveTab('menu')}    icon={Utensils}    label="MENU TIME" />
            <TabButton active={activeTab === 'booking'} onClick={() => setActiveTab('booking')} icon={CalendarDays} label="BOOKING TIME" />
          </div>

          {activeTab === 'menu' ? <MenuTimeTab /> : <BookingTimeTab />}

        </main>
      </div>
    </div>
  )
}
