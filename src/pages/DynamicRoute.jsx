import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'

const ACCENT = '#E8321A'

const inputStyle = {
  width: '100%',
  background: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  padding: '10px 14px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#888',
  marginBottom: '6px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
}

const cardStyle = {
  background: '#141414',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '14px',
  padding: '28px',
  marginBottom: '20px',
}

const cardTitleStyle = {
  color: '#fff',
  fontSize: '16px',
  fontWeight: 700,
  marginBottom: '22px',
}

const saveButtonStyle = {
  marginTop: '20px',
  padding: '10px 22px',
  borderRadius: '8px',
  background: 'transparent',
  border: `1.5px solid ${ACCENT}`,
  color: ACCENT,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.07em',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
}

function RouteCards({ state, setState }) {
  return (
    <>
      {/* Card 1 — Add Subdomain */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Add Sub Domain</div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Subdomain Prefix</label>
          <input
            style={inputStyle}
            placeholder="e.g. restaurant-name"
            value={state.subdomain}
            onChange={e => setState(s => ({ ...s, subdomain: e.target.value }))}
          />
        </div>
        <div>
          <label style={labelStyle}>Generated URL Preview</label>
          <input
            style={{ ...inputStyle, color: '#aaa', cursor: 'default' }}
            readOnly
            value={state.subdomain ? `${state.subdomain}.exzibo.online` : 'your-subdomain.exzibo.online'}
          />
        </div>
        <button
          style={saveButtonStyle}
          onMouseEnter={e => {
            e.currentTarget.style.background = ACCENT
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = ACCENT
          }}
        >
          SAVE SUBDOMAIN
        </button>
      </div>

      {/* Card 2 — Add Dynamic Routing Logic */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Add Dynamic Routing Logic</div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Route Path</label>
          <input
            style={inputStyle}
            placeholder="e.g. /menu"
            value={state.routePath}
            onChange={e => setState(s => ({ ...s, routePath: e.target.value }))}
          />
        </div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Redirect Target URL</label>
          <input
            style={inputStyle}
            placeholder="e.g. https://exzibo.online/menu/xyz"
            value={state.redirectTarget}
            onChange={e => setState(s => ({ ...s, redirectTarget: e.target.value }))}
          />
        </div>
        <div>
          <label style={labelStyle}>Route Type</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={state.routeType}
            onChange={e => setState(s => ({ ...s, routeType: e.target.value }))}
          >
            <option value="301">Permanent (301)</option>
            <option value="302">Temporary (302)</option>
          </select>
        </div>
        <button
          style={saveButtonStyle}
          onMouseEnter={e => {
            e.currentTarget.style.background = ACCENT
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = ACCENT
          }}
        >
          SAVE ROUTE
        </button>
      </div>
    </>
  )
}

const initialTabState = () => ({
  subdomain: '',
  routePath: '',
  redirectTarget: '',
  routeType: '301',
})

const TABS = [
  { id: 'menu', label: 'MENU ROUTE MAPPING' },
  { id: 'dashboard', label: 'DASHBOARD ROUTE MAPPING' },
]

export default function DynamicRoute() {
  const [activeTab, setActiveTab] = useState('menu')
  const [menuState, setMenuState] = useState(initialTabState)
  const [dashboardState, setDashboardState] = useState(initialTabState)

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 700, marginBottom: '28px' }}>
          Dynamic Route
        </h1>

        {/* Tab Bar */}
        <div style={{
          display: 'flex',
          gap: '4px',
          background: '#111',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          padding: '4px',
          width: 'fit-content',
          marginBottom: '32px',
        }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '9px 20px',
                  borderRadius: '7px',
                  border: 'none',
                  background: isActive ? ACCENT : 'transparent',
                  color: isActive ? '#fff' : '#666',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.color = '#ccc'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.color = '#666'
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div style={{ maxWidth: '600px' }}>
          {activeTab === 'menu' && (
            <RouteCards state={menuState} setState={setMenuState} />
          )}
          {activeTab === 'dashboard' && (
            <RouteCards state={dashboardState} setState={setDashboardState} />
          )}
        </div>
      </main>
    </div>
  )
}
