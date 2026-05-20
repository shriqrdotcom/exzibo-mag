import React, { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import { getRouteConfig, setRouteConfig } from '../lib/routeConfig'
import { supabase } from '../lib/supabase'

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

const ghostButtonStyle = {
  ...saveButtonStyle,
  marginTop: '20px',
  background: '#1a1a1a',
}

const whiteButtonStyle = {
  padding: '10px 18px',
  borderRadius: '8px',
  background: '#ffffff',
  border: '1.5px solid #ffffff',
  color: '#111111',
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.07em',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  flex: '1 1 auto',
  minWidth: '120px',
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-')
}

function RestaurantSlugList() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('restaurants')
      .select('id, name')
      .order('name')
      .then(({ data }) => { setRestaurants(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ color: '#555', fontSize: '13px', fontStyle: 'italic', padding: '10px 0' }}>
        Loading restaurants…
      </div>
    )
  }

  if (!restaurants.length) {
    return (
      <div style={{ ...inputStyle, color: '#555', fontStyle: 'italic', cursor: 'default' }}>
        /your-restaurant-name/
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {restaurants.map(r => (
        <div key={r.id} style={{
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#555', letterSpacing: '0.05em', flexShrink: 0 }}>
            CONNECTED WITH UID
          </span>
          <span style={{ color: ACCENT, fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}>
            /{slugify(r.name)}/
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#444', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {r.name}
          </span>
        </div>
      ))}
    </div>
  )
}

function TableNumberList() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('restaurants')
      .select('id, name, table_numbers')
      .order('name')
      .then(({ data }) => { setRestaurants(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ color: '#555', fontSize: '13px', fontStyle: 'italic', padding: '10px 0' }}>
        Loading tables…
      </div>
    )
  }

  const hasAny = restaurants.some(r => Array.isArray(r.table_numbers) && r.table_numbers.length > 0)

  if (!hasAny) {
    return (
      <div style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#555', letterSpacing: '0.05em', flexShrink: 0 }}>
          CONNECTED WITH UID
        </span>
        <span style={{ color: ACCENT, fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}>/1/</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {restaurants.map(r => {
        const nums = Array.isArray(r.table_numbers) && r.table_numbers.length > 0
          ? r.table_numbers
          : ['1']
        return nums.map(n => (
          <div key={`${r.id}-${n}`} style={{
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#555', letterSpacing: '0.05em', flexShrink: 0 }}>
              CONNECTED WITH UID
            </span>
            <span style={{ color: ACCENT, fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}>
              /{n}/
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#444', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {r.name} · Table {n}
            </span>
          </div>
        ))
      })}
    </div>
  )
}

function Toast({ msg, type }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#b91c1c' : '#15803d',
      color: '#fff', padding: '11px 26px', borderRadius: '10px',
      fontSize: '13px', fontWeight: 600, zIndex: 9999,
      boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
      whiteSpace: 'nowrap', pointerEvents: 'none',
      animation: 'fadeInUp 0.2s ease',
    }}>
      {msg}
    </div>
  )
}

function MenuTab() {
  const [subdomain, setSubdomain] = useState('')
  const [savedSubdomain, setSavedSubdomain] = useState('')
  const [routePattern, setRoutePattern] = useState('')
  const [card2State, setCard2State] = useState({ routePath: '', redirectTarget: '', routeType: '301' })
  const [savingSubdomain, setSavingSubdomain] = useState(false)
  const [savingPattern, setSavingPattern] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    async function load() {
      try {
        const [sd, rp] = await Promise.all([
          getRouteConfig('menu_subdomain'),
          getRouteConfig('menu_route_pattern'),
        ])
        if (sd) { setSubdomain(sd); setSavedSubdomain(sd) }
        if (rp) setRoutePattern(rp)
        else if (sd) setRoutePattern(`${sd}.exzibo.online/{restaurantName}/{tableNumber}/menu`)
      } catch (err) {
        console.warn('[route_config] load error:', err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function handleSubdomainChange(raw) {
    const sanitized = raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSubdomain(sanitized)
    setRoutePattern(prev => {
      const suffix = prev.includes('/')
        ? prev.substring(prev.indexOf('/'))
        : '/{restaurantName}/{tableNumber}/menu'
      return sanitized ? `${sanitized}.exzibo.online${suffix}` : ''
    })
  }

  async function handleSaveSubdomain() {
    const val = subdomain.trim()
    if (!val) { showToast('Subdomain prefix cannot be empty.', 'error'); return }
    if (!/^[a-z0-9-]+$/.test(val)) { showToast('Only lowercase letters, numbers, and hyphens allowed.', 'error'); return }
    if (val.startsWith('-') || val.endsWith('-')) { showToast('Subdomain cannot start or end with a hyphen.', 'error'); return }
    setSavingSubdomain(true)
    try {
      await setRouteConfig('menu_subdomain', val)
      setSavedSubdomain(val)
      showToast(`Menu subdomain updated successfully. All menu pages will now use ${val}.exzibo.online`)
    } catch (err) {
      showToast('Failed to save subdomain: ' + err.message, 'error')
    } finally {
      setSavingSubdomain(false)
    }
  }

  async function handleSaveRoutePattern() {
    const val = routePattern.trim()
    if (!val) { showToast('Route pattern cannot be empty.', 'error'); return }
    setSavingPattern(true)
    try {
      await setRouteConfig('menu_route_pattern', val)
      showToast('Route pattern saved successfully')
    } catch (err) {
      showToast('Failed to save route pattern: ' + err.message, 'error')
    } finally {
      setSavingPattern(false)
    }
  }

  if (loading) {
    return (
      <div style={{ color: '#555', fontSize: '14px', padding: '20px 0', letterSpacing: '0.04em' }}>
        Loading…
      </div>
    )
  }

  const isDirty = subdomain.trim() !== savedSubdomain

  return (
    <>
      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translate(-50%,8px) } to { opacity:1; transform:translate(-50%,0) } }`}</style>
      <Toast msg={toast?.msg} type={toast?.type} />

      {/* Card 1 — Add Sub Domain */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Add Sub Domain</div>
        <div style={{ marginBottom: '8px' }}>
          <label style={labelStyle}>Subdomain Prefix</label>
          <input
            style={{ ...inputStyle, borderColor: isDirty ? 'rgba(232,50,26,0.4)' : 'rgba(255,255,255,0.08)' }}
            placeholder="e.g. menu"
            value={subdomain}
            onChange={e => handleSubdomainChange(e.target.value)}
          />
        </div>

        {/* Currently active subdomain badge */}
        {savedSubdomain ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '18px', padding: '8px 12px',
            background: 'rgba(21,128,61,0.12)',
            border: '1px solid rgba(21,128,61,0.25)',
            borderRadius: '8px',
          }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: '#86efac', fontWeight: 600 }}>
              Currently active:&nbsp;
            </span>
            <span style={{ fontSize: '12px', color: '#22c55e', fontFamily: 'monospace', fontWeight: 700 }}>
              {savedSubdomain}.exzibo.online
            </span>
          </div>
        ) : (
          <div style={{ marginBottom: '18px', fontSize: '12px', color: '#555', fontStyle: 'italic' }}>
            No subdomain configured yet. Menu pages use the default domain.
          </div>
        )}

        <div style={{ marginBottom: '6px' }}>
          <label style={labelStyle}>Dynamic Route Pattern</label>
          <input
            style={inputStyle}
            placeholder="e.g. menu.exzibo.online/{restaurantName}/{tableNumber}/menu"
            value={routePattern}
            onChange={e => setRoutePattern(e.target.value)}
          />
        </div>

        {/* Full URL preview */}
        {subdomain && (
          <div style={{
            marginTop: '10px', marginBottom: '4px',
            padding: '8px 12px',
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            fontSize: '12px', color: '#888',
          }}>
            Full URL:&nbsp;
            <span style={{ color: ACCENT, fontFamily: 'monospace', fontWeight: 600 }}>
              https://{subdomain}.exzibo.online
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '20px' }}>
          <button
            style={ghostButtonStyle}
            onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = ACCENT }}
            onClick={() => handleSubdomainChange('menu')}
          >
            DEFAULT MENU
          </button>
          <button
            style={{ ...saveButtonStyle, opacity: savingPattern ? 0.65 : 1, cursor: savingPattern ? 'default' : 'pointer' }}
            disabled={savingPattern}
            onMouseEnter={e => { if (!savingPattern) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' } }}
            onMouseLeave={e => { if (!savingPattern) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ACCENT } }}
            onClick={handleSaveRoutePattern}
          >
            {savingPattern ? 'SAVING…' : 'SAVE ROUTE PATTERN'}
          </button>
          <button
            style={{ ...saveButtonStyle, opacity: savingSubdomain ? 0.65 : 1, cursor: savingSubdomain ? 'default' : 'pointer' }}
            disabled={savingSubdomain}
            onMouseEnter={e => { if (!savingSubdomain) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' } }}
            onMouseLeave={e => { if (!savingSubdomain) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ACCENT } }}
            onClick={handleSaveSubdomain}
          >
            {savingSubdomain ? 'SAVING…' : 'SAVE SUBDOMAIN'}
          </button>
        </div>
      </div>

      {/* Card 2 — Add Dynamic Routing Logic (UI only, same as before) */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Add Dynamic Routing Logic</div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>NAME OF THE RESTAURANT CONNECTED WITH UID</label>
          <RestaurantSlugList />
        </div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>TABLE NUMBER LOGIC</label>
          <TableNumberList />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            style={ghostButtonStyle}
            onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = ACCENT }}
            onClick={() => setCard2State(s => ({ ...s, routePath: '/restaurant', redirectTarget: 'https://exzibo.online/restaurant', routeType: '301' }))}
          >
            DEFAULT RESTAURANT
          </button>
          <button
            style={ghostButtonStyle}
            onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = ACCENT }}
            onClick={() => setCard2State(s => ({ ...s, routePath: '/table', redirectTarget: 'https://exzibo.online/table', routeType: '301' }))}
          >
            DEFAULT TABLE
          </button>
          <button
            style={ghostButtonStyle}
            onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = ACCENT }}
            onClick={() => setCard2State(s => ({ ...s, routePath: '/menu', redirectTarget: 'https://exzibo.online/menu', routeType: '301' }))}
          >
            DEFAULT MENU
          </button>
        </div>
        <button
          style={{ ...saveButtonStyle, marginTop: '20px' }}
          onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ACCENT }}
        >
          SAVE ROUTE
        </button>
      </div>
    </>
  )
}

function RouteCards({ state, setState, showDefaults, isDashboard }) {
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {showDefaults && (
            <button
              style={ghostButtonStyle}
              onMouseEnter={e => {
                e.currentTarget.style.background = ACCENT
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#1a1a1a'
                e.currentTarget.style.color = ACCENT
              }}
              onClick={() => setState(s => ({ ...s, subdomain: 'menu' }))}
            >
              DEFAULT MENU
            </button>
          )}
          {isDashboard && (
            <button
              style={ghostButtonStyle}
              onMouseEnter={e => {
                e.currentTarget.style.background = ACCENT
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#1a1a1a'
                e.currentTarget.style.color = ACCENT
              }}
              onClick={() => setState(s => ({ ...s, subdomain: 'dashboard' }))}
            >
              DEFAULT DASHBOARD
            </button>
          )}
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
      </div>

      {/* Card 2 — Add Dynamic Routing Logic */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Add Dynamic Routing Logic</div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>NAME OF THE RESTAURANT CONNECTED WITH UID</label>
          <RestaurantSlugList />
        </div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>TABLE NUMBER LOGIC</label>
          <TableNumberList />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {showDefaults && (
            <>
              <button
                style={ghostButtonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.background = ACCENT
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#1a1a1a'
                  e.currentTarget.style.color = ACCENT
                }}
                onClick={() => setState(s => ({
                  ...s,
                  routePath: '/restaurant',
                  redirectTarget: 'https://exzibo.online/restaurant',
                  routeType: '301',
                }))}
              >
                DEFAULT RESTAURANT
              </button>
              <button
                style={ghostButtonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.background = ACCENT
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#1a1a1a'
                  e.currentTarget.style.color = ACCENT
                }}
                onClick={() => setState(s => ({
                  ...s,
                  routePath: '/table',
                  redirectTarget: 'https://exzibo.online/table',
                  routeType: '301',
                }))}
              >
                DEFAULT TABLE
              </button>
            </>
          )}
          {isDashboard && (
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
              {[
                { label: 'DEFAULT MASTER',   path: '/master',   target: 'https://exzibo.online/master' },
                { label: 'DEFAULT OWNER',    path: '/owner',    target: 'https://exzibo.online/owner' },
                { label: 'DEFAULT ADMIN',    path: '/admin',    target: 'https://exzibo.online/admin' },
                { label: 'DEFAULT EMPLOYEE', path: '/employee', target: 'https://exzibo.online/employee' },
              ].map(({ label, path, target }) => (
                <button
                  key={label}
                  style={whiteButtonStyle}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#e0e0e0'
                    e.currentTarget.style.borderColor = '#e0e0e0'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#ffffff'
                    e.currentTarget.style.borderColor = '#ffffff'
                  }}
                  onClick={() => setState(s => ({
                    ...s,
                    routePath: path,
                    redirectTarget: target,
                    routeType: '301',
                  }))}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            style={{ ...saveButtonStyle, marginTop: isDashboard ? '0' : '20px' }}
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
      </div>
    </>
  )
}

function DashboardTab() {
  const [prefix, setPrefix]         = useState('')
  const [savedPrefix, setSavedPrefix] = useState('')
  const [saving, setSaving]         = useState(false)
  const [resetting, setResetting]   = useState(false)
  const [loading, setLoading]       = useState(true)
  const [toast, setToast]           = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    getRouteConfig('dashboard_route_prefix')
      .then(val => {
        const v = val || ''
        setPrefix(v)
        setSavedPrefix(v)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handlePrefixChange(raw) {
    const sanitized = raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setPrefix(sanitized)
  }

  async function handleSave() {
    const val = prefix.trim()
    if (!val) { showToast('Prefix cannot be empty.', 'error'); return }
    setSaving(true)
    try {
      await setRouteConfig('dashboard_route_prefix', val)
      setSavedPrefix(val)
      showToast('Dashboard route prefix saved successfully')
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDefault() {
    setResetting(true)
    try {
      await setRouteConfig('dashboard_route_prefix', '')
      setPrefix('')
      setSavedPrefix('')
      showToast('Reverted to default dashboard route')
    } catch (err) {
      showToast('Failed to reset: ' + err.message, 'error')
    } finally {
      setResetting(false)
    }
  }

  const previewUrl = 'dashboard.exzibo.online'

  const isDirty = prefix.trim() !== savedPrefix

  if (loading) {
    return <div style={{ color: '#555', fontSize: '14px', padding: '20px 0' }}>Loading…</div>
  }

  return (
    <>
      <style>{`@keyframes fadeInUpDB { from { opacity:0; transform:translate(-50%,8px) } to { opacity:1; transform:translate(-50%,0) } }`}</style>
      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#b91c1c' : '#15803d',
          color: '#fff', padding: '11px 26px', borderRadius: '10px',
          fontSize: '13px', fontWeight: 600, zIndex: 9999,
          boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
          animation: 'fadeInUpDB 0.2s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Card 1 — Add Sub Domain */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Add Sub Domain</div>

        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Subdomain Prefix</label>
          <input
            style={{ ...inputStyle, borderColor: isDirty ? 'rgba(232,50,26,0.4)' : 'rgba(255,255,255,0.08)' }}
            placeholder="e.g. restaurant-name"
            value={prefix}
            onChange={e => handlePrefixChange(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Generated URL Preview</label>
          <input
            style={{ ...inputStyle, color: '#aaa', cursor: 'default' }}
            readOnly
            value={previewUrl}
          />
        </div>

        {savedPrefix && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '18px', padding: '8px 12px',
            background: 'rgba(21,128,61,0.12)',
            border: '1px solid rgba(21,128,61,0.25)',
            borderRadius: '8px',
          }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: '#86efac', fontWeight: 600 }}>Currently active:&nbsp;</span>
            <span style={{ fontSize: '12px', color: '#22c55e', fontFamily: 'monospace', fontWeight: 700 }}>
              dashboard.exzibo.online/{savedPrefix}/
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            style={{ ...ghostButtonStyle, opacity: resetting ? 0.65 : 1, cursor: resetting ? 'default' : 'pointer' }}
            disabled={resetting}
            onClick={handleDefault}
            onMouseEnter={e => { if (!resetting) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' } }}
            onMouseLeave={e => { if (!resetting) { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = ACCENT } }}
          >
            {resetting ? 'RESETTING…' : 'DEFAULT DASHBOARD'}
          </button>
          <button
            style={{ ...saveButtonStyle, opacity: saving ? 0.65 : 1, cursor: saving ? 'default' : 'pointer' }}
            disabled={saving}
            onClick={handleSave}
            onMouseEnter={e => { if (!saving) { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = '#fff' } }}
            onMouseLeave={e => { if (!saving) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ACCENT } }}
          >
            {saving ? 'SAVING…' : 'SAVE SUBDOMAIN'}
          </button>
        </div>
      </div>

      {/* Card 2 — Dynamic Routing Logic */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>Add Dynamic Routing Logic</div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Name of the Restaurant Connected with UID</label>
          <RestaurantSlugList />
        </div>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Table Number Logic</label>
          <TableNumberList />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {[
            { label: 'DEFAULT MASTER' },
            { label: 'DEFAULT OWNER' },
            { label: 'DEFAULT ADMIN' },
            { label: 'DEFAULT EMPLOYEE' },
          ].map(({ label }) => (
            <button
              key={label}
              style={whiteButtonStyle}
              onMouseEnter={e => { e.currentTarget.style.background = '#e0e0e0'; e.currentTarget.style.borderColor = '#e0e0e0' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fff' }}
            >
              {label}
            </button>
          ))}
        </div>
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
            <MenuTab />
          )}
          {activeTab === 'dashboard' && (
            <DashboardTab />
          )}
        </div>
      </main>
    </div>
  )
}
