import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Globe, Share2, AtSign, MessageCircle, Edit2, Trash2, Plus, Info, Copy, Star, ExternalLink } from 'lucide-react'

const initialMenuItems = {
  starters: [
    { id: 1, name: 'Truffle Beef Carpaccio', desc: 'Thinly sliced wagyu, truffle oil, parmesan shavings, wild arugula.', price: 2100, tags: ['Popular', 'Gluten Free'], img: '🥩' },
    { id: 2, name: 'Atlantic Oysters', desc: 'Half dozen fresh oysters, mignonette sauce, lemon wedges.', price: 2850, tags: ['Seasonal'], img: '🦪' },
    { id: 3, name: 'Heirloom Burrata', desc: 'Creamy burrata, heirloom tomatoes, basil pesto, pine nuts.', price: 1650, tags: ['Vegetarian'], img: '🧀' },
  ],
  mains: [
    { id: 4, name: 'A5 Wagyu Ribeye', desc: 'Japanese A5 wagyu, roasted bone marrow, truffle jus, seasonal vegetables.', price: 15500, tags: ['Popular'], img: '🥩' },
    { id: 5, name: 'Lobster Thermidor', desc: 'Atlantic lobster, cognac cream, gruyère gratin, chive oil.', price: 7950, tags: ['Seasonal'], img: '🦞' },
    { id: 6, name: 'Forest Mushroom Risotto', desc: 'Arborio rice, porcini, chanterelle, truffle oil, aged parmesan.', price: 3500, tags: ['Vegetarian', 'Gluten Free'], img: '🍄' },
  ],
  drinks: [
    { id: 7, name: 'Noir Negroni', desc: 'Aged gin, Campari, premium vermouth, black walnut bitters.', price: 1850, tags: ['Popular'], img: '🍸' },
    { id: 8, name: 'Champagne Selection', desc: 'Curated vintage champagnes by the glass or bottle.', price: 3750, tags: ['Seasonal'], img: '🥂' },
    { id: 9, name: 'Pressed Botanicals', desc: 'House-pressed botanical blend, elderflower, cucumber, tonic.', price: 1350, tags: ['Vegetarian'], img: '🌿' },
  ],
}

const tagColors = {
  Popular: { bg: 'rgba(232,50,26,0.15)', color: '#E8321A', border: 'rgba(232,50,26,0.25)' },
  'Gluten Free': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.2)' },
  Vegetarian: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.2)' },
  Seasonal: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
}

export default function MenuEditor() {
  const [activeTab, setActiveTab] = useState('starters')
  const [isActive, setIsActive] = useState(true)
  const [menuItems, setMenuItems] = useState(initialMenuItems)
  const [restInfo, setRestInfo] = useState({ name: 'Crimson Luxe Brasserie', tables: 24, website: 'https://www.crimsonluxe.com', facebook: 'crimson.luxe.official', instagram: '@crimsonluxe', twitter: '@crimsonluxe_x', googleReview: '' })
  const [showAddModal, setShowAddModal] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', desc: '', price: '', tags: [] })
  const [editingId, setEditingId] = useState(null)

  const tabMap = { starters: 'starters', mains: 'mains', drinks: 'drinks' }
  const tabLabels = [
    { key: 'starters', label: 'STARTERS' },
    { key: 'mains', label: 'MAIN COURSE' },
    { key: 'drinks', label: 'DRINKS' },
  ]

  const deleteItem = (id) => {
    setMenuItems(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].filter(item => item.id !== id)
    }))
  }

  const addItem = () => {
    if (!newItem.name) return
    const item = { id: Date.now(), name: newItem.name, desc: newItem.desc, price: parseFloat(newItem.price) || 0, tags: newItem.tags, img: '🍽️' }
    setMenuItems(prev => ({ ...prev, [activeTab]: [...prev[activeTab], item] }))
    setNewItem({ name: '', desc: '', price: '', tags: [] })
    setShowAddModal(false)
  }

  const currentItems = menuItems[activeTab] || []

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader subtitle="Menu Configuration" />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Menu Editor</h1>
              <p style={{ color: '#666', fontSize: '14px', maxWidth: '380px', lineHeight: 1.6 }}>
                Orchestrate your culinary offerings with precision. Changes are reflected in real-time across all guest interfaces.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '10px 18px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#aaa', fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em',
                cursor: 'pointer',
              }}>
                <Copy size={13} />PASTE UID
              </button>
              <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button onClick={() => setIsActive(true)} style={{
                  padding: '10px 20px',
                  background: isActive ? '#E8321A' : 'rgba(255,255,255,0.04)',
                  border: 'none', color: '#fff', fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.06em',
                  boxShadow: isActive ? '0 0 16px rgba(232,50,26,0.3)' : 'none',
                  transition: 'all 0.2s',
                }}>ACTIVE</button>
                <button onClick={() => setIsActive(false)} style={{
                  padding: '10px 20px',
                  background: !isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none', color: isActive ? '#555' : '#aaa', fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.06em',
                  transition: 'all 0.2s',
                }}>PAUSE</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <InfoPanel icon={<Info size={13} />} title="GENERAL INFO">
                <FormField label="RESTAURANT NAME">
                  <input value={restInfo.name} onChange={e => setRestInfo(p => ({ ...p, name: e.target.value }))}
                    style={inputStyle} />
                </FormField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <FormField label="TABLE COUNT">
                    <input type="number" value={restInfo.tables} onChange={e => setRestInfo(p => ({ ...p, tables: e.target.value }))}
                      style={inputStyle} />
                  </FormField>
                  <FormField label="STATUS">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.6)', display: 'inline-block' }} />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e' }}>ONLINE</span>
                    </div>
                  </FormField>
                </div>
              </InfoPanel>

              <InfoPanel title="PRESENCE & REACH" subtitle="CONNECT YOUR SOCIAL PRESENCE FOR CUSTOMERS">
                <FormField label="WEBSITE URL">
                  <SocialInput icon={<Globe size={13} />} value={restInfo.website} onChange={v => setRestInfo(p => ({ ...p, website: v }))} />
                </FormField>
                <FormField label="FACEBOOK">
                  <SocialInput icon={<Share2 size={13} />} value={restInfo.facebook} onChange={v => setRestInfo(p => ({ ...p, facebook: v }))} />
                </FormField>
                <FormField label="INSTAGRAM">
                  <SocialInput icon={<AtSign size={13} />} value={restInfo.instagram} onChange={v => setRestInfo(p => ({ ...p, instagram: v }))} />
                </FormField>
                <FormField label="X (TWITTER)">
                  <SocialInput icon={<MessageCircle size={13} />} value={restInfo.twitter} onChange={v => setRestInfo(p => ({ ...p, twitter: v }))} />
                </FormField>
              </InfoPanel>

              <div style={{
                background: 'linear-gradient(135deg, rgba(232,50,26,0.06) 0%, rgba(16,16,16,1) 60%)',
                border: '1px solid rgba(232,50,26,0.2)',
                borderRadius: '18px',
                padding: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '7px',
                    background: 'rgba(232,50,26,0.15)',
                    border: '1px solid rgba(232,50,26,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Star size={13} color="#E8321A" fill="rgba(232,50,26,0.4)" />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#E8321A', textTransform: 'uppercase' }}>
                    Google Reviews
                  </span>
                </div>
                <p style={{ fontSize: '10px', color: '#555', letterSpacing: '0.05em', marginBottom: '14px', textTransform: 'uppercase' }}>
                  Link your Google review page for customers
                </p>
                <FormField label="GOOGLE REVIEW LINK">
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(232,50,26,0.2)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      transition: 'border-color 0.2s',
                    }}>
                      <Star size={13} color="#E8321A" />
                      <input
                        value={restInfo.googleReview}
                        onChange={e => setRestInfo(p => ({ ...p, googleReview: e.target.value }))}
                        placeholder="https://g.page/r/your-review-link"
                        style={{
                          background: 'transparent', border: 'none',
                          color: '#ccc', fontSize: '12px', flex: 1,
                        }}
                      />
                      {restInfo.googleReview && (
                        <a
                          href={restInfo.googleReview}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#E8321A', display: 'flex', flexShrink: 0 }}
                          title="Open link"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </FormField>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  marginTop: '12px',
                  padding: '8px 10px',
                  background: 'rgba(232,50,26,0.06)',
                  borderRadius: '8px',
                }}>
                  <span style={{ fontSize: '10px', color: '#666', lineHeight: 1.5 }}>
                    Paste your Google Business review URL. Customers will be directed here to leave a review.
                  </span>
                </div>
              </div>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px' }}>
                  {tabLabels.map(({ key, label }) => (
                    <button key={key} onClick={() => setActiveTab(key)} style={{
                      padding: '8px 18px',
                      borderRadius: '7px',
                      background: activeTab === key ? '#E8321A' : 'transparent',
                      border: 'none',
                      color: activeTab === key ? '#fff' : '#666',
                      fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
                      cursor: 'pointer',
                      boxShadow: activeTab === key ? '0 0 12px rgba(232,50,26,0.3)' : 'none',
                      transition: 'all 0.2s',
                    }}>{label}</button>
                  ))}
                </div>
                <button onClick={() => setShowAddModal(true)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '9px 14px',
                  background: 'rgba(232,50,26,0.12)',
                  border: '1px solid rgba(232,50,26,0.25)',
                  borderRadius: '10px',
                  color: '#E8321A', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#E8321A'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(232,50,26,0.12)'; e.currentTarget.style.color = '#E8321A' }}
                >
                  <Plus size={13} /> ADD NEW ITEM
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {currentItems.map(item => (
                  <MenuItem key={item.id} item={item} onDelete={() => deleteItem(item.id)} />
                ))}
                {currentItems.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#555' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>🍽️</div>
                    <div style={{ fontSize: '14px' }}>No items yet. Add your first dish.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <button onClick={() => setShowAddModal(true)} style={{
        position: 'fixed', bottom: '28px', right: '28px',
        width: '52px', height: '52px', borderRadius: '50%',
        background: '#E8321A', border: 'none', color: '#fff',
        cursor: 'pointer', boxShadow: '0 0 30px rgba(232,50,26,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(232,50,26,0.7)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.5)' }}
      >
        <Plus size={22} />
      </button>

      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100,
        }} onClick={() => setShowAddModal(false)}>
          <div style={{
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px',
            padding: '32px',
            width: '440px',
            maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px' }}>Add New Item</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <FormField label="ITEM NAME">
                <input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Wagyu Tartare" style={inputStyle} />
              </FormField>
              <FormField label="DESCRIPTION">
                <textarea value={newItem.desc} onChange={e => setNewItem(p => ({ ...p, desc: e.target.value }))} placeholder="Describe the dish..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </FormField>
              <FormField label="PRICE (₹)">
                <input type="number" value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} placeholder="0" style={inputStyle} />
              </FormField>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {['Popular', 'Gluten Free', 'Vegetarian', 'Seasonal'].map(tag => {
                  const active = newItem.tags.includes(tag)
                  return (
                    <button key={tag} onClick={() => setNewItem(p => ({ ...p, tags: active ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }))} style={{
                      padding: '6px 14px',
                      borderRadius: '50px',
                      background: active ? tagColors[tag].bg : 'transparent',
                      border: `1px solid ${active ? tagColors[tag].border : 'rgba(255,255,255,0.1)'}`,
                      color: active ? tagColors[tag].color : '#666',
                      fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}>{tag}</button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setShowAddModal(false)} style={{
                flex: 1, padding: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color: '#888', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={addItem} style={{
                flex: 2, padding: '12px',
                background: '#E8321A',
                border: 'none',
                borderRadius: '10px',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(232,50,26,0.4)',
              }}>Add to Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ item, onDelete }) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '14px',
        padding: '16px',
        background: hov ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderRadius: '14px',
        marginBottom: '4px',
        transition: 'background 0.2s',
        cursor: 'default',
      }}>
      <div style={{
        width: '62px', height: '62px', borderRadius: '12px', minWidth: '62px',
        background: 'linear-gradient(135deg, #1e1e1e, #2a2a2a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>{item.img}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>{item.name}</span>
          <span style={{ color: '#E8321A', fontWeight: 800, fontSize: '16px' }}>₹{item.price.toLocaleString('en-IN')}</span>
        </div>
        <p style={{ color: '#666', fontSize: '12px', lineHeight: 1.6, marginBottom: '8px' }}>{item.desc}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {item.tags.map(tag => {
              const style = tagColors[tag] || { bg: 'rgba(255,255,255,0.05)', color: '#888', border: 'rgba(255,255,255,0.1)' }
              return (
                <span key={tag} style={{
                  padding: '3px 9px',
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: '50px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
                  color: style.color,
                  textTransform: 'uppercase',
                }}>{tag}</span>
              )
            })}
          </div>
          {hov && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}><Edit2 size={14} /></button>
              <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#E8321A'}
                onMouseLeave={e => e.currentTarget.style.color = '#666'}
              ><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoPanel({ title, subtitle, children, icon }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '18px',
      padding: '20px',
    }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: subtitle ? '4px' : 0 }}>
          {icon && <span style={{ color: '#555' }}>{icon}</span>}
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#555', textTransform: 'uppercase' }}>{title}</span>
        </div>
        {subtitle && <div style={{ fontSize: '10px', color: '#444', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', marginBottom: '6px', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

function SocialInput({ icon, value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
      padding: '9px 12px',
    }}>
      <span style={{ color: '#555', display: 'flex' }}>{icon}</span>
      <input value={value} onChange={e => onChange(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#ccc', fontSize: '12px', flex: 1 }} />
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '8px',
  color: '#ccc',
  fontSize: '13px',
}
