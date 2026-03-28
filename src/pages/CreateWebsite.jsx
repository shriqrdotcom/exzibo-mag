import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Zap, BarChart2, Layout } from 'lucide-react'

export default function CreateWebsite() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', owner: '', tables: '' })
  const [creating, setCreating] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleCreate = () => {
    if (!form.name) return
    setCreating(true)
    setTimeout(() => {
      setCreating(false)
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    }, 2000)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse 70% 60% at 50% 20%, rgba(232,50,26,0.08) 0%, #0A0A0A 60%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '60px 24px',
    }}>
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          padding: '8px 20px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px dashed rgba(232,50,26,0.4)',
          borderRadius: '8px',
          fontSize: '14px', fontWeight: 900, letterSpacing: '0.1em',
        }}>
          CRIMSON<span style={{ color: '#E8321A' }}>LUXE</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#E8321A', marginBottom: '16px', textTransform: 'uppercase' }}>
          Deployment Console
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, lineHeight: 1.1, marginBottom: '16px' }}>
          Establish Your{' '}
          <span style={{ color: '#E8321A', textShadow: '0 0 40px rgba(232,50,26,0.4)' }}>Digital</span>
          <br />
          <span style={{ color: '#E8321A', textShadow: '0 0 40px rgba(232,50,26,0.4)' }}>Presence</span>
        </h1>
        <p style={{ fontSize: '15px', color: '#666', maxWidth: '380px', margin: '0 auto', lineHeight: 1.7 }}>
          Configure your high-performance restaurant interface in seconds. Technical precision meets aesthetic excellence.
        </p>
      </div>

      {success ? (
        <div style={{
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: '20px',
          padding: '40px 60px',
          textAlign: 'center',
          animation: 'fade-in 0.5s ease',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>✓</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80', marginBottom: '8px' }}>Website Created!</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Redirecting to dashboard...</div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px',
          padding: '40px',
          width: '100%',
          maxWidth: '520px',
          backdropFilter: 'blur(10px)',
          marginBottom: '40px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <FormField label="RESTAURANT NAME">
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. L'Atelier Noir"
                style={inputStyle}
              />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="OWNER NAME">
                <input
                  value={form.owner}
                  onChange={e => setForm(p => ({ ...p, owner: e.target.value }))}
                  placeholder="Full legal name"
                  style={inputStyle}
                />
              </FormField>
              <FormField label="NUMBER OF TABLES">
                <input
                  type="number"
                  value={form.tables}
                  onChange={e => setForm(p => ({ ...p, tables: e.target.value }))}
                  placeholder="24"
                  style={inputStyle}
                />
              </FormField>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !form.name}
              style={{
                padding: '18px',
                background: form.name ? '#E8321A' : 'rgba(232,50,26,0.3)',
                border: `2px solid ${form.name ? '#E8321A' : 'rgba(232,50,26,0.3)'}`,
                borderRadius: '12px',
                color: '#fff',
                fontSize: '14px', fontWeight: 800, letterSpacing: '0.1em',
                cursor: form.name ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: form.name ? '0 0 30px rgba(232,50,26,0.4)' : 'none',
                transition: 'all 0.25s',
              }}
            >
              {creating ? (
                <>
                  <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                  CONFIGURING...
                </>
              ) : (
                <>
                  CREATE MY WEBSITE
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', width: '100%', maxWidth: '520px' }}>
        {[
          { icon: <Zap size={20} />, label: 'Instant Deploy' },
          { icon: <BarChart2 size={20} />, label: 'Live Analytics' },
          { icon: <Layout size={20} />, label: 'Custom Layout' },
        ].map(({ icon, label }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '10px',
              background: 'rgba(232,50,26,0.1)',
              border: '1px solid rgba(232,50,26,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#E8321A',
            }}>{icon}</div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#777', textAlign: 'center' }}>{label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/')}
        style={{
          marginTop: '32px',
          background: 'none', border: 'none',
          color: '#555', fontSize: '13px',
          cursor: 'pointer',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#888'}
        onMouseLeave={e => e.currentTarget.style.color = '#555'}
      >
        ← Back to home
      </button>
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '13px 16px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  color: '#ccc',
  fontSize: '14px',
}
