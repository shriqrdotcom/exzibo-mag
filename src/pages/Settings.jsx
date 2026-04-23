import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Lock, Shield, ChevronDown, Check, Share2, Globe, ClipboardPaste, Link, Search, User, Phone, Mail, Layers, DollarSign, Clock } from 'lucide-react'
import { FaFacebook, FaInstagram, FaTwitter, FaLinkedin, FaYoutube } from 'react-icons/fa'

const DEFAULTS = {
  profile: { name: 'Julian Vercetti', email: 'j.vercetti@exzibo.com', role: 'General Manager', company: 'Exzibo Group' },
  twoFactor: true,
  theme: 'dark',
  language: 'English',
  notifications: { orders: true, system: true, updates: false },
  social: { facebook: '', instagram: '', twitter: '', website: '', linkedin: '', youtube: '' },
  googleReview: '',
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
  const [social, setSocial] = useState(DEFAULTS.social)
  const [googleReview, setGoogleReview] = useState(DEFAULTS.googleReview)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const saveTimer = useRef(null)
  const [restaurantUidQuery, setRestaurantUidQuery] = useState('0000000001')
  const [paymentTab, setPaymentTab] = useState('all')

  const restaurantInfo = {
    uid: '0000000001',
    status: 'ACTIVE',
    ownerName: 'Michael Chen (Owner)',
    contact1: '+1 555-010-1234',
    contact2: '+1 555-010-5678',
    email: 'm.chen@goldenwoks.com',
  }

  const paymentRows = [
    { uid: '0000000001', name: 'Burger Hub',    amount: 250.00, status: 'RECEIVED', date: '12 May 2025' },
    { uid: '0000000002', name: 'Pizza Point',   amount: 180.00, status: 'PENDING',  date: '12 May 2025' },
    { uid: '0000000003', name: 'Sushi House',   amount: 300.00, status: 'RECEIVED', date: '12 May 2025' },
    { uid: '0000000004', name: 'Taco Town',     amount: 120.00, status: 'PENDING',  date: '12 May 2025' },
    { uid: '0000000005', name: 'Pasta Palace',  amount: 200.00, status: 'RECEIVED', date: '12 May 2025' },
    { uid: '0000000006', name: 'Curry Corner',  amount: 150.00, status: 'PENDING',  date: '12 May 2025' },
    { uid: '0000000007', name: 'Grill Master',  amount: 320.00, status: 'RECEIVED', date: '12 May 2025' },
    { uid: '0000000008', name: 'Coffee Café',   amount:  90.00, status: 'PENDING',  date: '12 May 2025' },
  ]

  const filteredPayments = paymentTab === 'all'
    ? paymentRows
    : paymentRows.filter(r => r.status.toLowerCase() === paymentTab)

  useEffect(() => {
    const stored = localStorage.getItem('exzibo_settings')
    if (stored) {
      const s = JSON.parse(stored)
      if (s.profile) setProfile(s.profile)
      if (s.twoFactor !== undefined) setTwoFactor(s.twoFactor)
      if (s.theme) setTheme(s.theme)
      if (s.language) setLanguage(s.language)
      if (s.notifications) setNotifications(s.notifications)
      if (s.social) setSocial(s.social)
      if (s.googleReview !== undefined) setGoogleReview(s.googleReview)
    }
  }, [])

  const handleDiscard = () => {
    const stored = localStorage.getItem('exzibo_settings')
    if (stored) {
      const s = JSON.parse(stored)
      if (s.profile) setProfile(s.profile)
      if (s.twoFactor !== undefined) setTwoFactor(s.twoFactor)
      if (s.theme) setTheme(s.theme)
      if (s.language) setLanguage(s.language)
      if (s.notifications) setNotifications(s.notifications)
      if (s.social) setSocial(s.social)
      if (s.googleReview !== undefined) setGoogleReview(s.googleReview)
    } else {
      setProfile(DEFAULTS.profile)
      setTwoFactor(DEFAULTS.twoFactor)
      setTheme(DEFAULTS.theme)
      setLanguage(DEFAULTS.language)
      setNotifications(DEFAULTS.notifications)
      setSocial(DEFAULTS.social)
      setGoogleReview(DEFAULTS.googleReview)
    }
    setDirty(false)
  }

  const handleSave = () => {
    localStorage.setItem('exzibo_settings', JSON.stringify({ profile, twoFactor, theme, language, notifications, social, googleReview }))
    setDirty(false)
    setSaved(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(false), 2500)
  }

  const socialFields = [
    { key: 'facebook',  label: 'Facebook',    placeholder: 'https://facebook.com/yourpage',    icon: <FaFacebook  size={20} color="#1877F2" /> },
    { key: 'instagram', label: 'Instagram',   placeholder: 'https://instagram.com/yourhandle', icon: <FaInstagram size={20} color="#E1306C" /> },
    { key: 'twitter',   label: 'Twitter / X', placeholder: 'https://twitter.com/yourhandle',   icon: <FaTwitter   size={20} color="#1DA1F2" /> },
    { key: 'website',   label: 'Website',     placeholder: 'https://yourwebsite.com',           icon: <Globe       size={20} color="#4ade80" /> },
    { key: 'linkedin',  label: 'LinkedIn',    placeholder: 'https://linkedin.com/in/yourname', icon: <FaLinkedin  size={20} color="#0A66C2" /> },
    { key: 'youtube',   label: 'YouTube',     placeholder: 'https://youtube.com/yourchannel',  icon: <FaYoutube   size={20} color="#FF0000" /> },
  ]

  return (
    <>
      <style>{`
        .settings-main {
          flex: 1;
          overflow-y: auto;
          padding: 32px;
          width: 100%;
          max-width: 800px;
          box-sizing: border-box;
        }
        .settings-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .settings-profile-avatar-row {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .settings-pref-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .settings-save-row {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          align-items: center;
          padding-bottom: 32px;
          flex-wrap: wrap;
        }
        .social-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .social-input-row {
          display: flex;
          align-items: center;
          gap: 0;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          overflow: hidden;
        }
        .social-input-row input {
          flex: 1;
          min-width: 0;
          padding: 11px 10px;
          background: transparent;
          border: none;
          color: #ccc;
          font-size: 13px;
          outline: none;
        }
        .paste-btn {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 0 12px;
          height: 42px;
          background: rgba(232,50,26,0.12);
          border: none;
          border-left: 1px solid rgba(255,255,255,0.08);
          color: #E8321A;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
        }
        .paste-btn:hover {
          background: rgba(232,50,26,0.22);
        }
        .session-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: rgba(255,255,255,0.03);
          border-radius: 10px;
          margin-bottom: 8px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .section-card {
          background: #111;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px;
          padding: 24px;
        }
        @media (max-width: 600px) {
          .settings-main {
            padding: 16px;
          }
          .settings-two-col {
            grid-template-columns: 1fr;
          }
          .settings-pref-grid {
            grid-template-columns: 1fr;
          }
          .social-grid {
            grid-template-columns: 1fr;
          }
          .settings-save-row {
            justify-content: stretch;
          }
          .settings-save-row button {
            flex: 1;
          }
          .section-card {
            padding: 16px;
          }
          .settings-profile-avatar-row {
            gap: 14px;
          }
          .session-row {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
      <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <AdminHeader subtitle="Global Settings" showSearch={false} />
          <main className="settings-main">
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

            <GoogleReviewCard
              value={googleReview}
              onChange={v => { setGoogleReview(v); setDirty(true) }}
            />

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
                  <div key={session.device} className="session-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '20px', flexShrink: 0 }}>{session.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.device} • {session.location}</div>
                        <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.06em', marginTop: '2px' }}>{session.sub}</div>
                      </div>
                    </div>
                    <button style={{
                      padding: '6px 14px',
                      background: 'transparent',
                      border: 'none',
                      color: session.status === 'ACTIVE' ? '#4ade80' : '#E8321A',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                      cursor: 'pointer', flexShrink: 0,
                    }}>{session.status}</button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Preferences" subtitle="Customize your administrative experience and regional settings.">
              <div className="settings-pref-grid">
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>Interface Theme</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                    gap: '12px',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{desc}</div>
                    </div>
                    <Toggle value={notifications[key]} onChange={v => { setNotifications(p => ({ ...p, [key]: v })); setDirty(true) }} />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="SECTION 1 — RESTAURANT INFO" subtitle="Search by Restaurant UID to view details.">
              <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
                <div style={{
                  flex: 1, minWidth: '180px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                }}>
                  <Search size={14} color="#555" />
                  <input
                    type="text"
                    value={restaurantUidQuery}
                    onChange={e => setRestaurantUidQuery(e.target.value)}
                    placeholder="Enter Restaurant UID"
                    style={{
                      flex: 1, minWidth: 0,
                      padding: '10px 0',
                      background: 'transparent', border: 'none',
                      color: '#ccc', fontSize: '12px', outline: 'none',
                    }}
                  />
                </div>
                <button style={{
                  padding: '10px 22px',
                  background: '#E8321A', border: 'none',
                  borderRadius: '8px',
                  color: '#fff', fontSize: '11px', fontWeight: 700,
                  letterSpacing: '0.08em', cursor: 'pointer',
                  boxShadow: '0 0 14px rgba(232,50,26,0.35)',
                }}>SEARCH</button>
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '18px',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', gap: '12px',
                  paddingBottom: '14px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  marginBottom: '14px',
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Restaurant UID</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>{restaurantInfo.uid}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Status</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#4ade80', letterSpacing: '0.04em' }}>{restaurantInfo.status}</div>
                  </div>
                </div>

                {[
                  { icon: <User size={14} />, label: 'Owner Name', value: restaurantInfo.ownerName },
                  { icon: <Phone size={14} />, label: 'Contact No 1', value: restaurantInfo.contact1 },
                  { icon: <Phone size={14} />, label: 'Contact No 2', value: restaurantInfo.contact2 },
                  { icon: <Mail size={14} />, label: 'Email ID', value: restaurantInfo.email },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#888', flexShrink: 0,
                    }}>{row.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>{row.label}</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{row.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="SECTION 2 — PAYMENT INFO" subtitle="View all pending and received payments.">
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'ALL PAYMENTS' },
                  { key: 'pending', label: 'PENDING' },
                  { key: 'received', label: 'RECEIVED' },
                ].map(tab => {
                  const active = paymentTab === tab.key
                  return (
                    <button key={tab.key} onClick={() => setPaymentTab(tab.key)} style={{
                      flex: 1, minWidth: '110px',
                      padding: '10px 14px',
                      background: active ? '#E8321A' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? '#E8321A' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '8px',
                      color: active ? '#fff' : '#777',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                      cursor: 'pointer',
                      boxShadow: active ? '0 0 12px rgba(232,50,26,0.3)' : 'none',
                      transition: 'all 0.2s',
                    }}>{tab.label}</button>
                  )
                })}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '10px',
                marginBottom: '18px',
              }}>
                {[
                  { icon: <Layers size={16} />, label: 'Total Payments', value: '128', sub: 'All Time', color: '#3b82f6' },
                  { icon: <DollarSign size={16} />, label: 'Total Received', value: '$ 24,680.00', sub: 'All Time', color: '#4ade80' },
                  { icon: <Clock size={16} />, label: 'Total Pending', value: '$ 3,520.00', sub: 'All Time', color: '#f59e0b' },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex', gap: '10px', alignItems: 'center',
                  }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: `${card.color}1f`,
                      border: `1px solid ${card.color}33`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: card.color, flexShrink: 0,
                    }}>{card.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>{card.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', margin: '2px 0' }}>{card.value}</div>
                      <div style={{ fontSize: '9px', color: '#555', letterSpacing: '0.06em' }}>{card.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
                overflowX: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '520px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Restaurant UID', 'Restaurant Name', 'Amount', 'Status', 'Date'].map(h => (
                        <th key={h} style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          fontSize: '9px', fontWeight: 700,
                          color: '#666', letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 12px', color: '#888', fontFamily: 'monospace' }}>{row.uid}</td>
                        <td style={{ padding: '10px 12px', color: '#ddd', fontWeight: 600 }}>{row.name}</td>
                        <td style={{ padding: '10px 12px', color: '#ccc' }}>{row.amount.toFixed(2)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
                            color: row.status === 'RECEIVED' ? '#4ade80' : '#f59e0b',
                            background: row.status === 'RECEIVED' ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)',
                            border: `1px solid ${row.status === 'RECEIVED' ? 'rgba(74,222,128,0.25)' : 'rgba(245,158,11,0.25)'}`,
                          }}>{row.status}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#888' }}>{row.date}</td>
                      </tr>
                    ))}
                    {filteredPayments.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: '18px', textAlign: 'center', color: '#555', fontSize: '11px' }}>No payments found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>

            <div className="settings-save-row">
              {dirty && (
                <span style={{ fontSize: '12px', color: '#555', marginRight: '4px', flexShrink: 0 }}>
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
                display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
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
                minWidth: '155px',
              }}>
                {saved ? <><Check size={14} /> SAVED!</> : 'SAVE CHANGES'}
              </button>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

function Section({ title, subtitle, icon, children }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: icon ? '14px' : '0' }}>
        {icon && (
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'rgba(232,50,26,0.1)',
            border: '1px solid rgba(232,50,26,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#E8321A', flexShrink: 0,
          }}>{icon}</div>
        )}
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#E8321A', marginBottom: '4px' }}>{title}</h2>
          <p style={{ fontSize: '13px', color: '#555' }}>{subtitle}</p>
        </div>
      </div>
      <div className="section-card">
        {children}
      </div>
    </div>
  )
}

function SocialField({ label, icon, value, placeholder, onChange }) {
  const [pasted, setPasted] = useState(false)

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        onChange(text)
        setPasted(true)
        setTimeout(() => setPasted(false), 1500)
      }
    } catch {
      setPasted(false)
    }
  }

  return (
    <div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em',
        color: '#555', marginBottom: '8px', textTransform: 'uppercase',
      }}>
        {icon}
        {label}
      </label>
      <div className="social-input-row">
        <input
          type="url"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
        <button
          className="paste-btn"
          onClick={handlePaste}
          title={`Paste ${label} URL`}
          style={{ background: pasted ? 'rgba(34,197,94,0.2)' : undefined, color: pasted ? '#4ade80' : undefined }}
        >
          <ClipboardPaste size={13} />
          {pasted ? '✓ PASTED' : 'PASTE'}
        </button>
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
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function ToggleRow({ icon, title, desc, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'rgba(232,50,26,0.1)',
          border: '1px solid rgba(232,50,26,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#E8321A', flexShrink: 0,
        }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', gap: '12px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#666', flexShrink: 0,
        }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
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
        transition: 'all 0.2s', flexShrink: 0,
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
        flexShrink: 0,
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

function GoogleReviewCard({ value, onChange }) {
  const [pasted, setPasted] = useState(false)

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        onChange(text)
        setPasted(true)
        setTimeout(() => setPasted(false), 1500)
      }
    } catch {}
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{
        background: '#fff',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '20px 22px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg viewBox="0 0 24 24" width="28" height="28">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Google Review</span>
          </div>
          <button
            onClick={handlePaste}
            style={{
              padding: '8px 18px',
              background: pasted ? '#16a34a' : '#16a34a',
              border: 'none', borderRadius: '8px',
              color: '#fff', fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.06em',
              transition: 'opacity 0.2s',
              opacity: pasted ? 0.85 : 1,
            }}
          >
            {pasted ? '✓ PASTED' : 'PASTE'}
          </button>
        </div>
        <div style={{ height: '1px', background: '#f1f5f9', marginBottom: '16px' }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px',
          padding: '10px 14px',
        }}>
          <Link size={18} color="#64748b" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Google Link</span>
          <input
            type="url"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="https://g.page/..."
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: '13px', color: '#0f172a', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>
    </div>
  )
}
