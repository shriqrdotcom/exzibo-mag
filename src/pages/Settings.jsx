import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Lock, Shield, ChevronDown, Check, ArrowLeft, Calendar } from 'lucide-react'

const DEFAULTS = {
  profile: { name: 'Julian Vercetti', email: 'j.vercetti@exzibo.com', role: 'General Manager', company: 'Exzibo Group' },
  twoFactor: true,
  theme: 'dark',
  language: 'English',
  notifications: { orders: true, system: true, updates: false },
}

function getInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '??'
}

export default function Settings() {
  const [profile, setProfile] = useState(DEFAULTS.profile)
  const [twoFactor, setTwoFactor] = useState(DEFAULTS.twoFactor)
  const [theme, setTheme] = useState(DEFAULTS.theme)
  const [language, setLanguage] = useState(DEFAULTS.language)
  const [notifications, setNotifications] = useState(DEFAULTS.notifications)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const saveTimer = useRef(null)

  useEffect(() => {
    const stored = localStorage.getItem('exzibo_settings')
    if (stored) {
      const s = JSON.parse(stored)
      if (s.profile) setProfile(s.profile)
      if (s.twoFactor !== undefined) setTwoFactor(s.twoFactor)
      if (s.theme) setTheme(s.theme)
      if (s.language) setLanguage(s.language)
      if (s.notifications) setNotifications(s.notifications)
    }
  }, [])

  const markDirty = (setter) => (...args) => {
    setter(...args)
    setDirty(true)
  }

  const handleDiscard = () => {
    const stored = localStorage.getItem('exzibo_settings')
    if (stored) {
      const s = JSON.parse(stored)
      if (s.profile) setProfile(s.profile)
      if (s.twoFactor !== undefined) setTwoFactor(s.twoFactor)
      if (s.theme) setTheme(s.theme)
      if (s.language) setLanguage(s.language)
      if (s.notifications) setNotifications(s.notifications)
    } else {
      setProfile(DEFAULTS.profile)
      setTwoFactor(DEFAULTS.twoFactor)
      setTheme(DEFAULTS.theme)
      setLanguage(DEFAULTS.language)
      setNotifications(DEFAULTS.notifications)
    }
    setDirty(false)
  }

  const handleSave = () => {
    localStorage.setItem('exzibo_settings', JSON.stringify({ profile, twoFactor, theme, language, notifications }))
    setDirty(false)
    setSaved(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader subtitle="Global Settings" showSearch={false} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px', maxWidth: '800px' }}>
          {saved && (
            <div style={{
              marginBottom: '20px',
              padding: '14px 20px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
              borderRadius: '10px',
              color: '#4ade80',
              fontSize: '13px', fontWeight: 600,
              animation: 'fade-in 0.3s ease',
            }}>
              ✓ Changes saved successfully
            </div>
          )}

          <Section title="Profile" subtitle="Manage your administrative credentials.">
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #E8321A, #8a1a1a)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '26px', fontWeight: 800,
                  border: '3px solid rgba(232,50,26,0.3)',
                  transition: 'all 0.2s',
                  letterSpacing: '0.02em',
                }}>{getInitials(profile.name)}</div>
                <button style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: '#E8321A', border: 'none',
                  color: '#fff', fontSize: '12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✎</button>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, transition: 'all 0.15s' }}>{profile.name || 'Your Name'}</div>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '2px', transition: 'all 0.15s' }}>
                  {profile.role || 'Role'}{profile.company ? ` • ${profile.company}` : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <SettingsField label="FULL NAME" value={profile.name} onChange={v => { setProfile(p => ({ ...p, name: v })); setDirty(true) }} />
              <SettingsField label="EMAIL ADDRESS" value={profile.email} onChange={v => { setProfile(p => ({ ...p, email: v })); setDirty(true) }} />
              <SettingsField label="ROLE" value={profile.role} onChange={v => { setProfile(p => ({ ...p, role: v })); setDirty(true) }} />
              <SettingsField label="COMPANY" value={profile.company} onChange={v => { setProfile(p => ({ ...p, company: v })); setDirty(true) }} />
            </div>
          </Section>

          <Section title="Security" subtitle="Protect your account with enterprise-grade authentication protocols.">
            <ToggleRow
              icon={<Shield size={18} />}
              title="Two-Factor Authentication"
              desc="Add an extra layer of security to your management console."
              value={twoFactor}
              onChange={v => { setTwoFactor(v); setDirty(true) }}
            />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
            <ActionRow
              icon={<Lock size={18} />}
              title="Password Management"
              desc="Last changed 42 days ago. Strong entropy recommended."
              action="UPDATE"
            />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />

            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Active Sessions</div>
              {[
                { device: 'MacBook Pro 16"', location: 'San Francisco, CA', sub: 'CURRENT SESSION • CHROME 124.0', status: 'ACTIVE', icon: '💻' },
                { device: 'iPhone 15 Pro', location: 'London, UK', sub: 'LAST ACTIVE 4 HOURS AGO • MOBILE APP', status: 'REVOKE', icon: '📱' },
              ].map(session => (
                <div key={session.device} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '10px',
                  marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>{session.icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{session.device} • {session.location}</div>
                      <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.06em', marginTop: '2px' }}>{session.sub}</div>
                    </div>
                  </div>
                  <button style={{
                    padding: '6px 14px',
                    background: 'transparent',
                    border: 'none',
                    color: session.status === 'ACTIVE' ? '#4ade80' : '#E8321A',
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                    cursor: 'pointer',
                  }}>{session.status}</button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Preferences" subtitle="Customize your administrative experience and regional settings.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>Interface Theme</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['dark', 'deeper'].map(t => (
                    <button key={t} onClick={() => { setTheme(t); setDirty(true) }} style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: theme === t ? '#E8321A' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${theme === t ? '#E8321A' : 'rgba(255,255,255,0.08)'}`,
                      color: theme === t ? '#fff' : '#666',
                      fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'all 0.2s',
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>Language</label>
                <div style={{ position: 'relative' }}>
                  <select value={language} onChange={e => { setLanguage(e.target.value); setDirty(true) }} style={{
                    width: '100%', padding: '10px 16px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    color: '#ccc', fontSize: '13px',
                    appearance: 'none',
                    cursor: 'pointer',
                  }}>
                    {['English', 'French', 'Spanish', 'Italian', 'Japanese'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: '#888' }}>Notifications</div>
              {[
                { key: 'orders', label: 'New Orders', desc: 'Get alerted for incoming order activity' },
                { key: 'system', label: 'System Alerts', desc: 'Infrastructure and uptime notifications' },
                { key: 'updates', label: 'Product Updates', desc: 'Feature releases and platform news' },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{desc}</div>
                  </div>
                  <Toggle value={notifications[key]} onChange={v => { setNotifications(p => ({ ...p, [key]: v })); setDirty(true) }} />
                </div>
              ))}
            </div>
          </Section>

          <CouponManagement />

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '32px' }}>
            {dirty && (
              <span style={{ fontSize: '12px', color: '#555', marginRight: '4px' }}>
                ● Unsaved changes
              </span>
            )}
            <button onClick={handleDiscard} style={{
              padding: '12px 28px',
              background: 'transparent',
              border: `1px solid ${dirty ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '10px',
              color: dirty ? '#ccc' : '#555', fontSize: '13px', fontWeight: 600,
              cursor: dirty ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}>DISCARD</button>
            <button onClick={handleSave} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 32px',
              background: saved ? 'rgba(34,197,94,0.15)' : '#E8321A',
              border: saved ? '1px solid rgba(34,197,94,0.3)' : 'none',
              borderRadius: '10px',
              color: saved ? '#4ade80' : '#fff',
              fontSize: '13px', fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              boxShadow: saved ? '0 0 16px rgba(34,197,94,0.2)' : '0 0 20px rgba(232,50,26,0.4)',
              transition: 'all 0.3s ease',
              minWidth: '155px', justifyContent: 'center',
            }}>
              {saved ? <><Check size={14} /> SAVED!</> : 'SAVE CHANGES'}
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#E8321A', marginBottom: '4px' }}>{title}</h2>
        <p style={{ fontSize: '13px', color: '#555' }}>{subtitle}</p>
      </div>
      <div style={{
        background: '#111',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '18px',
        padding: '24px',
      }}>
        {children}
      </div>
    </div>
  )
}

function SettingsField({ label, value, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '7px', textTransform: 'uppercase' }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '11px 14px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          color: '#ccc', fontSize: '13px',
        }}
      />
    </div>
  )
}

function ToggleRow({ icon, title, desc, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'rgba(232,50,26,0.1)',
          border: '1px solid rgba(232,50,26,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#E8321A',
        }}>{icon}</div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{desc}</div>
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

function ActionRow({ icon, title, desc, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#666',
        }}>{icon}</div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{desc}</div>
        </div>
      </div>
      <button style={{
        padding: '8px 16px',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        color: '#888', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8321A'; e.currentTarget.style.color = '#E8321A' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#888' }}
      >{action}</button>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '48px', height: '26px',
        borderRadius: '13px',
        background: value ? '#E8321A' : 'rgba(255,255,255,0.1)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.25s',
        boxShadow: value ? '0 0 12px rgba(232,50,26,0.4)' : 'none',
      }}
    >
      <span style={{
        position: 'absolute',
        top: '3px',
        left: value ? '25px' : '3px',
        width: '20px', height: '20px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.25s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

function BlueToggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '52px', height: '28px',
        borderRadius: '14px',
        background: value ? '#2563EB' : 'rgba(255,255,255,0.1)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.25s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: '4px',
        left: value ? '28px' : '4px',
        width: '20px', height: '20px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.25s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}


const COUPON_HISTORY = [
  { code: 'SAVE20', type: 'Percentage', discount: '20%', used: 142, status: 'Expired', date: '01-01-2025' },
  { code: 'FLAT50', type: 'Fixed Amount', discount: '₹50', used: 88, status: 'Expired', date: '15-03-2025' },
  { code: 'AB20', type: 'Percentage', discount: '10%', used: 34, status: 'Active', date: '09-11-2025' },
]

function CouponManagement() {
  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: '#ccc',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: '6px',
    letterSpacing: '0.03em',
  }

  const [coupon, setCoupon] = useState({
    code: 'AB20',
    discountType: 'Percentage',
    discountPct: '10.00',
    minDiscount: '400.00',
    maxDiscount: '100.00',
    active: true,
    validUntil: '2025-11-09',
    expireDate: '2025-10-10',
  })
  const [showHistory, setShowHistory] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [updated, setUpdated] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const stored = localStorage.getItem('exzibo_coupon')
    if (stored) setCoupon(JSON.parse(stored))
  }, [])

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleUpdate = () => {
    localStorage.setItem('exzibo_coupon', JSON.stringify(coupon))
    setUpdated(true)
    setTimeout(() => setUpdated(false), 2000)
  }

  const handleCancel = () => {
    const stored = localStorage.getItem('exzibo_coupon')
    if (stored) setCoupon(JSON.parse(stored))
    else setCoupon({
      code: 'AB20', discountType: 'Percentage', discountPct: '10.00',
      minDiscount: '400.00', maxDiscount: '100.00', active: true,
      validUntil: '2025-11-09', expireDate: '2025-10-10',
    })
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#2563EB', marginBottom: '4px' }}>Coupon Management</h2>
        <p style={{ fontSize: '13px', color: '#555' }}>Create and manage discount coupons for your restaurants.</p>
      </div>

      <div style={{
        background: '#111',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '18px',
        padding: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(37,99,235,0.1)',
            border: '1px solid rgba(37,99,235,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2563EB', cursor: 'pointer',
          }}>
            <ArrowLeft size={16} />
          </div>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>Edit Coupon</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={labelStyle}>Coupon Code <span style={{ color: '#E8321A' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                value={coupon.code}
                onChange={e => setCoupon(p => ({ ...p, code: e.target.value }))}
                style={{ ...inputStyle, paddingRight: '110px' }}
                placeholder="e.g. SAVE20"
              />
              <button
                onClick={() => setCoupon(p => ({ ...p, code: generateCode() }))}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: '#2563EB', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.04em',
                  padding: '4px 8px',
                }}
              >GENERATE</button>
            </div>
            <p style={{ fontSize: '12px', color: '#555', marginTop: '6px' }}>Enter a unique coupon code</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Discount Type <span style={{ color: '#E8321A' }}>*</span></label>
              <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowDropdown(v => !v)}
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${showDropdown ? '#2563EB' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: '8px',
                    color: '#ccc', fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <span>{coupon.discountType}</span>
                  <ChevronDown size={16} style={{ color: '#555', transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {showDropdown && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                    background: '#1a1a1a',
                    border: '1px solid rgba(37,99,235,0.4)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}>
                    {['Percentage', 'Fixed Amount'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => { setCoupon(p => ({ ...p, discountType: opt })); setShowDropdown(false) }}
                        style={{
                          width: '100%', padding: '12px 16px',
                          background: coupon.discountType === opt ? 'rgba(37,99,235,0.2)' : 'transparent',
                          border: 'none',
                          color: coupon.discountType === opt ? '#2563EB' : '#ccc',
                          fontSize: '14px', fontWeight: coupon.discountType === opt ? 600 : 400,
                          cursor: 'pointer', textAlign: 'left',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                      >
                        {opt}
                        {coupon.discountType === opt && <Check size={14} style={{ color: '#2563EB' }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Discount % <span style={{ color: '#E8321A' }}>*</span></label>
              <input
                type="number"
                value={coupon.discountPct}
                onChange={e => setCoupon(p => ({ ...p, discountPct: e.target.value }))}
                style={inputStyle}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Maximum Discount Amount (₹)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <input
                type="number"
                value={coupon.minDiscount}
                onChange={e => setCoupon(p => ({ ...p, minDiscount: e.target.value }))}
                style={inputStyle}
                placeholder="Minimum"
                step="0.01"
              />
              <input
                type="number"
                value={coupon.maxDiscount}
                onChange={e => setCoupon(p => ({ ...p, maxDiscount: e.target.value }))}
                style={inputStyle}
                placeholder="Maximum"
                step="0.01"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <BlueToggle value={coupon.active} onChange={v => setCoupon(p => ({ ...p, active: v }))} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#ccc' }}>Active</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Valid Until</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  value={coupon.validUntil}
                  onChange={e => setCoupon(p => ({ ...p, validUntil: e.target.value }))}
                  style={{ ...inputStyle, paddingRight: '40px', colorScheme: 'dark' }}
                />
              </div>
            </div>
            <div>
              <label style={{ ...labelStyle, textTransform: 'uppercase', fontWeight: 700, fontSize: '12px', color: '#fff', letterSpacing: '0.08em' }}>EXPIRE DATE</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  value={coupon.expireDate}
                  onChange={e => setCoupon(p => ({ ...p, expireDate: e.target.value }))}
                  style={{ ...inputStyle, paddingRight: '40px', colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button
              onClick={handleCancel}
              style={{
                flex: 1, padding: '13px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '10px',
                color: '#888', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.06em',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.color = '#ccc' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#888' }}
            >CANCEL</button>
            <button
              onClick={handleUpdate}
              style={{
                flex: 1, padding: '13px',
                background: updated ? 'rgba(34,197,94,0.15)' : '#2563EB',
                border: updated ? '1px solid rgba(34,197,94,0.3)' : 'none',
                borderRadius: '10px',
                color: updated ? '#4ade80' : '#fff',
                fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.06em',
                transition: 'all 0.25s',
                boxShadow: updated ? '0 0 16px rgba(34,197,94,0.2)' : '0 0 20px rgba(37,99,235,0.35)',
              }}
            >{updated ? '✓ UPDATED!' : 'UPDATE'}</button>
          </div>

          <button
            onClick={() => setShowHistory(v => !v)}
            style={{
              width: '100%', padding: '14px',
              background: '#2563EB',
              border: 'none',
              borderRadius: '10px',
              color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.08em',
              boxShadow: '0 0 20px rgba(37,99,235,0.35)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#2563EB' }}
          >HISTORY</button>

          {showHistory && (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#888', marginBottom: '12px', letterSpacing: '0.05em' }}>COUPON HISTORY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {COUPON_HISTORY.map(h => (
                  <div key={h.code} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{h.code}</div>
                      <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{h.type} • {h.discount} • Used {h.used}x • Until {h.date}</div>
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: h.status === 'Active' ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${h.status === 'Active' ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      color: h.status === 'Active' ? '#2563EB' : '#555',
                      fontSize: '11px', fontWeight: 600,
                    }}>{h.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
