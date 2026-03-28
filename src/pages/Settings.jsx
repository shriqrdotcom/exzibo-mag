import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Lock, Shield, Smartphone, Save, X, ChevronDown } from 'lucide-react'

export default function Settings() {
  const [profile, setProfile] = useState({ name: 'Julian Vercetti', email: 'j.vercetti@crimsonluxe.c', role: 'General Manager', company: 'Crimson Luxe Group' })
  const [twoFactor, setTwoFactor] = useState(true)
  const [theme, setTheme] = useState('dark')
  const [language, setLanguage] = useState('English')
  const [notifications, setNotifications] = useState({ orders: true, system: true, updates: false })
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
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
                  fontSize: '28px', fontWeight: 800,
                  border: '3px solid rgba(232,50,26,0.3)',
                }}>JV</div>
                <button style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: '#E8321A', border: 'none',
                  color: '#fff', fontSize: '12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✎</button>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{profile.name}</div>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{profile.role} • {profile.company}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <SettingsField label="FULL NAME" value={profile.name} onChange={v => setProfile(p => ({ ...p, name: v }))} />
              <SettingsField label="EMAIL ADDRESS" value={profile.email} onChange={v => setProfile(p => ({ ...p, email: v }))} />
              <SettingsField label="ROLE" value={profile.role} onChange={v => setProfile(p => ({ ...p, role: v }))} />
              <SettingsField label="COMPANY" value={profile.company} onChange={v => setProfile(p => ({ ...p, company: v }))} />
            </div>
          </Section>

          <Section title="Security" subtitle="Protect your account with enterprise-grade authentication protocols.">
            <ToggleRow
              icon={<Shield size={18} />}
              title="Two-Factor Authentication"
              desc="Add an extra layer of security to your management console."
              value={twoFactor}
              onChange={setTwoFactor}
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
                    <button key={t} onClick={() => setTheme(t)} style={{
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
                  <select value={language} onChange={e => setLanguage(e.target.value)} style={{
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
                  <Toggle value={notifications[key]} onChange={v => setNotifications(p => ({ ...p, [key]: v }))} />
                </div>
              ))}
            </div>
          </Section>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingBottom: '32px' }}>
            <button style={{
              padding: '12px 28px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: '#888', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
            }}>DISCARD</button>
            <button onClick={handleSave} style={{
              padding: '12px 32px',
              background: '#E8321A',
              border: 'none',
              borderRadius: '10px',
              color: '#fff', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              boxShadow: '0 0 20px rgba(232,50,26,0.4)',
              transition: 'box-shadow 0.2s',
            }}>SAVE CHANGES</button>
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
