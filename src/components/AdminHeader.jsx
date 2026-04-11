import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, User, Search, ArrowRight } from 'lucide-react'

export default function AdminHeader({ title, subtitle, showSearch = true }) {
  const [searchVal, setSearchVal] = useState('')
  const [focused, setFocused] = useState(false)
  const navigate = useNavigate()

  const handleSearch = () => {
    const val = searchVal.trim()
    if (val) navigate(`/menu-editor/${val}`)
  }

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20px 32px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      background: '#0e0e0e',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#E8321A', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Admin Console
        </span>
        {subtitle && (
          <>
            <span style={{ color: '#444', fontSize: '13px' }}>/</span>
            <span style={{ color: '#888', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {subtitle}
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {showSearch && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${focused ? 'rgba(232,50,26,0.4)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '8px',
            padding: '8px 10px 8px 14px',
            width: '240px',
            transition: 'border-color 0.2s',
          }}>
            <Search size={14} color="#555" style={{ flexShrink: 0 }} />
            <input
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Paste Restaurant UID..."
              style={{
                background: 'transparent',
                border: 'none',
                color: '#999',
                fontSize: '13px',
                flex: 1,
                minWidth: 0,
                outline: 'none',
              }}
            />
            {searchVal && (
              <button
                onClick={handleSearch}
                style={{
                  background: '#E8321A',
                  border: 'none',
                  borderRadius: '5px',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: '4px 6px',
                  flexShrink: 0,
                  transition: 'box-shadow 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 10px rgba(232,50,26,0.5)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}

        <button style={{
          background: 'transparent',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
        onMouseLeave={e => e.currentTarget.style.color = '#888'}
        >
          <Bell size={18} />
        </button>

        <button style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#888',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '8px',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        >
          <User size={18} />
        </button>
      </div>
    </header>
  )
}
