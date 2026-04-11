import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Lock, Shield, ChevronDown, Check, Share2, Globe, ClipboardPaste } from 'lucide-react'
import { FaFacebook, FaInstagram, FaTwitter, FaLinkedin, FaYoutube } from 'react-icons/fa'

const DEFAULTS = {
  profile: { name: 'Julian Vercetti', email: 'j.vercetti@exzibo.com', role: 'General Manager', company: 'Exzibo Group' },
  twoFactor: true,
  theme: 'dark',
  language: 'English',
  notifications: { orders: true, system: true, updates: false },
  social: { facebook: '', instagram: '', twitter: '', website: '', linkedin: '', youtube: '' },
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
      if (s.social) setSocial(s.social)
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
    } else {
      setProfile(DEFAULTS.profile)
      setTwoFactor(DEFAULTS.twoFactor)
      setTheme(DEFAULTS.theme)
      setLanguage(DEFAULTS.language)
      setNotifications(DEFAULTS.notifications)
      setSocial(DEFAULTS.social)
    }
    setDirty(false)
  }

  const handleSave = () => {
    localStorage.setItem('exzibo_settings', JSON.stringify({ profile, twoFactor, theme, language, notifications, social }))
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

            <Section title="Profile" subtitle="Manage your administrative credentials.">
              <div className="settings-profile-avatar-row">
                <div style={{ position: 'relative', flexShrink: 0 }}>
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
              <div className="settings-two-col">
                <SettingsField label="FULL NAME" value={profile.name} onChange={v => { setProfile(p => ({ ...p, name: v })); setDirty(true) }} />
                <SettingsField label="EMAIL ADDRESS" value={profile.email} onChange={v => { setProfile(p => ({ ...p, email: v })); setDirty(true) }} />
                <SettingsField label="ROLE" value={profile.role} onChange={v => { setProfile(p => ({ ...p, role: v })); setDirty(true) }} />
                <SettingsField label="COMPANY" value={profile.company} onChange={v => { setProfile(p => ({ ...p, company: v })); setDirty(true) }} />
              </div>
            </Section>

            <Section title="Add Social Media Links" subtitle="Enter social media profile URLs." icon={<Share2 size={22} />}>
              <div className="social-grid">
                {socialFields.map(({ key, label, placeholder, icon }) => (
                  <SocialField
                    key={key}
                    label={label}
                    icon={icon}
                    value={social[key]}
                    placeholder={placeholder}
                    onChange={v => { setSocial(p => ({ ...p, [key]: v })); setDirty(true) }}
                  />
                ))}
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
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      onChange(text)
    } catch {
      // fallback: do nothing if clipboard permission denied
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
        <button className="paste-btn" onClick={handlePaste} title={`Paste ${label} URL`}>
          <ClipboardPaste size={13} />
          PASTE
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
