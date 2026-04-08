import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Globe, Share2, AtSign, MessageCircle, Edit2, Trash2, Plus, Info, Copy, Star, ExternalLink, Save, Check, X } from 'lucide-react'

const initialMenuItems = {
  starters: [
    { id: 1, name: 'Truffle Beef Carpaccio', desc: 'Thinly sliced wagyu, truffle oil, parmesan shavings, wild arugula.', price: 2100, tags: ['Popular', 'Gluten Free'], img: '/menu/truffle-beef-carpaccio.png' },
    { id: 2, name: 'Atlantic Oysters', desc: 'Half dozen fresh oysters, mignonette sauce, lemon wedges.', price: 2850, tags: ['Seasonal'], img: '/menu/atlantic-oysters.png' },
    { id: 3, name: 'Heirloom Burrata', desc: 'Creamy burrata, heirloom tomatoes, basil pesto, pine nuts.', price: 1650, tags: ['Vegetarian'], img: '/menu/heirloom-burrata.png' },
  ],
  mains: [
    { id: 4, name: 'A5 Wagyu Ribeye', desc: 'Japanese A5 wagyu, roasted bone marrow, truffle jus, seasonal vegetables.', price: 15500, tags: ['Popular'], img: '/menu/wagyu-ribeye.png' },
    { id: 5, name: 'Lobster Thermidor', desc: 'Atlantic lobster, cognac cream, gruyère gratin, chive oil.', price: 7950, tags: ['Seasonal'], img: '/menu/lobster-thermidor.png' },
    { id: 6, name: 'Forest Mushroom Risotto', desc: 'Arborio rice, porcini, chanterelle, truffle oil, aged parmesan.', price: 3500, tags: ['Vegetarian', 'Gluten Free'], img: '/menu/mushroom-risotto.png' },
  ],
  drinks: [
    { id: 7, name: 'Noir Negroni', desc: 'Aged gin, Campari, premium vermouth, black walnut bitters.', price: 1850, tags: ['Popular'], img: '/menu/noir-negroni.png' },
    { id: 8, name: 'Champagne Selection', desc: 'Curated vintage champagnes by the glass or bottle.', price: 3750, tags: ['Seasonal'], img: '/menu/champagne.png' },
    { id: 9, name: 'Pressed Botanicals', desc: 'House-pressed botanical blend, elderflower, cucumber, tonic.', price: 1350, tags: ['Vegetarian'], img: '/menu/pressed-botanicals.png' },
  ],
}

const tagColors = {
  Popular: { bg: 'rgba(232,50,26,0.15)', color: '#E8321A', border: 'rgba(232,50,26,0.25)' },
  'Gluten Free': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.2)' },
  Vegetarian: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.2)' },
  Seasonal: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
}

export default function MenuEditor() {
  const { uid } = useParams()
  const [activeTab, setActiveTab] = useState('starters')
  const [isActive, setIsActive] = useState(true)
  const [menuItems, setMenuItems] = useState(initialMenuItems)
  const [restInfo, setRestInfo] = useState({ name: 'Exzibo Brasserie', tables: 24, website: 'https://www.exzibo.com', facebook: 'exzibo.official', instagram: '@exzibo', twitter: '@exzibo_x', googleReview: '' })
  const [showAddModal, setShowAddModal] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', desc: '', price: '', tags: [] })
  const [editingId, setEditingId] = useState(null)
  const [resolvedName, setResolvedName] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeView, setActiveView] = useState('menu-edit')
  const saveTimer = useRef(null)

  useEffect(() => {
    if (!uid) return
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const match = all.find(r => r.id === uid)
    if (match) {
      setResolvedName(match.name)
      setRestInfo(prev => ({
        ...prev,
        name: match.name,
        tables: parseInt(match.tables) || prev.tables,
        website: match.socialLinks?.website || prev.website,
        facebook: match.socialLinks?.facebook || prev.facebook,
        instagram: match.socialLinks?.instagram || prev.instagram,
        twitter: match.socialLinks?.twitter || prev.twitter,
      }))
      setIsActive(match.status === 'active')
      setNotFound(false)
      const savedMenu = localStorage.getItem(`exzibo_menu_${uid}`)
      if (savedMenu) setMenuItems(JSON.parse(savedMenu))
    } else {
      setNotFound(true)
    }
  }, [uid])

  const saveChanges = () => {
    if (uid) {
      localStorage.setItem(`exzibo_menu_${uid}`, JSON.stringify(menuItems))
      const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
      const updated = all.map(r => r.id === uid
        ? { ...r, status: isActive ? 'active' : 'paused', name: restInfo.name, tables: restInfo.tables,
            socialLinks: { website: restInfo.website, facebook: restInfo.facebook, instagram: restInfo.instagram, twitter: restInfo.twitter } }
        : r
      )
      localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
    } else {
      localStorage.setItem('exzibo_menu_default', JSON.stringify(menuItems))
    }
    setSaved(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(false), 2500)
  }

  const tabMap = { starters: 'starters', mains: 'mains', drinks: 'drinks' }
  const tabLabels = [
    { key: 'starters', label: 'STARTERS' },
    { key: 'mains', label: 'MAIN COURSE' },
    { key: 'drinks', label: 'DRINKS' },
  ]

  const defaultCategoryFilters = {
    starters: [
      { id: 'all', emoji: '🍽️', label: 'All' },
      { id: 'veg', emoji: '🥗', label: 'Veg' },
      { id: 'nonveg', emoji: '🥩', label: 'Non-Veg' },
      { id: 'popular', emoji: '⭐', label: 'Popular' },
      { id: 'seasonal', emoji: '🌿', label: 'Seasonal' },
    ],
    mains: [
      { id: 'all', emoji: '🍽️', label: 'All' },
      { id: 'grill', emoji: '🔥', label: 'Grill' },
      { id: 'seafood', emoji: '🦞', label: 'Seafood' },
      { id: 'vegetarian', emoji: '🥦', label: 'Vegetarian' },
      { id: 'pasta', emoji: '🍝', label: 'Pasta' },
    ],
    drinks: [
      { id: 'all', emoji: '🥤', label: 'All' },
      { id: 'cocktails', emoji: '🍹', label: 'Cocktails' },
      { id: 'wine', emoji: '🍷', label: 'Wine' },
      { id: 'beer', emoji: '🍺', label: 'Beer' },
      { id: 'soft', emoji: '🧃', label: 'Soft' },
    ],
  }

  const [categoryFilters, setCategoryFilters] = useState(defaultCategoryFilters)
  const [activeCategoryFilter, setActiveCategoryFilter] = useState({ starters: 'all', mains: 'all', drinks: 'all' })
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [newCategory, setNewCategory] = useState({ emoji: '', label: '' })
  const [hoveredCatId, setHoveredCatId] = useState(null)

  const addCategoryFilter = () => {
    if (!newCategory.label.trim()) return
    const cat = {
      id: Date.now().toString(),
      emoji: newCategory.emoji || '🏷️',
      label: newCategory.label.trim(),
    }
    setCategoryFilters(prev => ({ ...prev, [activeTab]: [...prev[activeTab], cat] }))
    setNewCategory({ emoji: '', label: '' })
    setShowAddCategoryModal(false)
  }

  const removeCategoryFilter = (catId) => {
    if (catId === 'all') return
    setCategoryFilters(prev => ({ ...prev, [activeTab]: prev[activeTab].filter(c => c.id !== catId) }))
    if (activeCategoryFilter[activeTab] === catId) {
      setActiveCategoryFilter(prev => ({ ...prev, [activeTab]: 'all' }))
    }
  }

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
        <AdminHeader subtitle={resolvedName ? `Menu · ${resolvedName}` : uid ? `Menu · UID ${uid}` : 'Menu Configuration'} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>

          {/* View Toggle Buttons */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
            {[
              { key: 'menu-edit', label: 'MENU EDIT' },
              { key: 'food-card', label: 'FOOD CARD' },
              { key: 'food-window', label: 'FOOD WINDOW' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveView(key)}
                style={{
                  padding: '10px 24px',
                  borderRadius: '10px',
                  background: activeView === key ? '#E8321A' : 'rgba(255,255,255,0.04)',
                  border: activeView === key ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  color: activeView === key ? '#fff' : '#666',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  boxShadow: activeView === key ? '0 0 18px rgba(232,50,26,0.35)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {activeView === 'menu-edit' && <>
          {notFound && (
            <div style={{
              background: 'rgba(232,50,26,0.06)',
              border: '1px solid rgba(232,50,26,0.2)',
              borderRadius: '14px',
              padding: '16px 20px',
              marginBottom: '24px',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8321A', marginBottom: '2px' }}>Restaurant Not Found</div>
                <div style={{ fontSize: '12px', color: '#666' }}>UID <code style={{ color: '#aaa' }}>{uid}</code> doesn't match any restaurant in your account. Editing default template instead.</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>
                {resolvedName ? resolvedName : 'Menu Editor'}
              </h1>
              <p style={{ color: '#666', fontSize: '14px', maxWidth: '380px', lineHeight: 1.6 }}>
                Orchestrate your culinary offerings with precision. Changes are reflected in real-time across all guest interfaces.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={saveChanges}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '10px 22px',
                  background: saved ? 'rgba(34,197,94,0.15)' : '#E8321A',
                  border: saved ? '1px solid rgba(34,197,94,0.3)' : 'none',
                  borderRadius: '10px',
                  color: saved ? '#4ade80' : '#fff',
                  fontSize: '12px', fontWeight: 700, letterSpacing: '0.07em',
                  cursor: 'pointer',
                  boxShadow: saved ? '0 0 16px rgba(34,197,94,0.2)' : '0 0 20px rgba(232,50,26,0.35)',
                  transition: 'all 0.3s ease',
                  minWidth: '148px', justifyContent: 'center',
                }}
              >
                {saved ? <><Check size={13} /> SAVED!</> : <><Save size={13} /> SAVE CHANGES</>}
              </button>
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

              {/* Food Category Filter Strip */}
              <div style={{
                padding: '14px 20px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#555', textTransform: 'uppercase' }}>
                    Category Filters · {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </span>
                  <button
                    onClick={() => setShowAddCategoryModal(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px',
                      background: 'rgba(232,50,26,0.1)',
                      border: '1px solid rgba(232,50,26,0.2)',
                      borderRadius: '6px',
                      color: '#E8321A', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#E8321A'; e.currentTarget.style.color = '#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(232,50,26,0.1)'; e.currentTarget.style.color = '#E8321A' }}
                  >
                    <Plus size={10} /> ADD FILTER
                  </button>
                </div>
                <div style={{
                  display: 'flex', gap: '10px',
                  overflowX: 'auto',
                  paddingBottom: '6px',
                  scrollbarWidth: 'none',
                }}>
                  {(categoryFilters[activeTab] || []).map(cat => {
                    const isActive = activeCategoryFilter[activeTab] === cat.id
                    const isHovered = hoveredCatId === cat.id
                    return (
                      <div
                        key={cat.id}
                        style={{ position: 'relative', flexShrink: 0 }}
                        onMouseEnter={() => setHoveredCatId(cat.id)}
                        onMouseLeave={() => setHoveredCatId(null)}
                      >
                        <button
                          onClick={() => setActiveCategoryFilter(prev => ({ ...prev, [activeTab]: cat.id }))}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                            padding: '10px 8px 8px',
                            width: '74px',
                            background: isActive ? '#fff' : isHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                            border: isActive ? 'none' : '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: isActive ? '0 4px 16px rgba(0,0,0,0.35)' : 'none',
                          }}
                        >
                          <div style={{
                            width: '44px', height: '44px', borderRadius: '12px',
                            background: isActive ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '24px',
                          }}>
                            {cat.emoji}
                          </div>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: isActive ? 700 : 500,
                            color: isActive ? '#111' : '#888',
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                          }}>
                            {cat.label}
                          </span>
                        </button>
                        {cat.id !== 'all' && isHovered && (
                          <button
                            onClick={() => removeCategoryFilter(cat.id)}
                            style={{
                              position: 'absolute', top: '-5px', right: '-5px',
                              width: '18px', height: '18px',
                              background: '#E8321A', border: 'none',
                              borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 2px 8px rgba(232,50,26,0.5)',
                            }}
                            title="Remove filter"
                          >
                            <X size={9} color="#fff" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
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
          </>}

          {activeView === 'food-card' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '18px',
                background: 'rgba(232,50,26,0.1)',
                border: '1px solid rgba(232,50,26,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '28px',
              }}>🃏</div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>Food Card</h2>
                <p style={{ fontSize: '13px', color: '#555', maxWidth: '320px', lineHeight: 1.7 }}>
                  This section is coming soon. Food card layouts and customization will be available here.
                </p>
              </div>
              <div style={{
                padding: '8px 20px',
                borderRadius: '50px',
                background: 'rgba(232,50,26,0.08)',
                border: '1px solid rgba(232,50,26,0.18)',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#E8321A',
              }}>COMING SOON</div>
            </div>
          )}

          {activeView === 'food-window' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '18px',
                background: 'rgba(232,50,26,0.1)',
                border: '1px solid rgba(232,50,26,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '28px',
              }}>🪟</div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>Food Window</h2>
                <p style={{ fontSize: '13px', color: '#555', maxWidth: '320px', lineHeight: 1.7 }}>
                  This section is coming soon. The food window display and configuration will be available here.
                </p>
              </div>
              <div style={{
                padding: '8px 20px',
                borderRadius: '50px',
                background: 'rgba(232,50,26,0.08)',
                border: '1px solid rgba(232,50,26,0.18)',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#E8321A',
              }}>COMING SOON</div>
            </div>
          )}

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

      {showAddCategoryModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 110,
        }} onClick={() => setShowAddCategoryModal(false)}>
          <div style={{
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px',
            padding: '32px',
            width: '360px',
            maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>Add Category Filter</h3>
            <p style={{ fontSize: '12px', color: '#555', marginBottom: '24px', lineHeight: 1.6 }}>
              Adding to <span style={{ color: '#E8321A', fontWeight: 700 }}>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span> section
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <FormField label="EMOJI ICON">
                <input
                  value={newCategory.emoji}
                  onChange={e => setNewCategory(p => ({ ...p, emoji: e.target.value }))}
                  placeholder="e.g. 🥗"
                  style={{ ...inputStyle, fontSize: '22px', textAlign: 'center', letterSpacing: '0.1em' }}
                  maxLength={4}
                />
              </FormField>
              <FormField label="CATEGORY NAME">
                <input
                  value={newCategory.label}
                  onChange={e => setNewCategory(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. Organic, Health, Vegan..."
                  style={inputStyle}
                  onKeyDown={e => e.key === 'Enter' && addCategoryFilter()}
                />
              </FormField>
              {newCategory.label && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '10px 8px 8px',
                    width: '74px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '14px',
                  }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      background: 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '24px',
                    }}>
                      {newCategory.emoji || '🏷️'}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#888', whiteSpace: 'nowrap' }}>
                      {newCategory.label || 'Label'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => { setShowAddCategoryModal(false); setNewCategory({ emoji: '', label: '' }) }} style={{
                flex: 1, padding: '12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                color: '#888', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={addCategoryFilter} style={{
                flex: 2, padding: '12px',
                background: '#E8321A', border: 'none',
                borderRadius: '10px',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(232,50,26,0.4)',
                opacity: newCategory.label.trim() ? 1 : 0.4,
              }}>Add Filter</button>
            </div>
          </div>
        </div>
      )}

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
        overflow: 'hidden',
      }}>
        {item.img && item.img.startsWith('/')
          ? <img src={item.img} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
          : item.img}
      </div>
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
