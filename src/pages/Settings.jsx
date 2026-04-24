import React, { useState, useEffect, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { Lock, Shield, ChevronDown, Check, Share2, Globe, ClipboardPaste, Link, Search, User, Phone, Mail, Layers, DollarSign, Clock, Copy } from 'lucide-react'
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
  const [restaurantUidQuery, setRestaurantUidQuery] = useState('')
  const [searchedUid, setSearchedUid] = useState('')
  const [paymentTab, setPaymentTab] = useState('all')
  const [restaurants, setRestaurants] = useState([])
  const [editingRestaurant, setEditingRestaurant] = useState(false)
  const [editForm, setEditForm] = useState({ owner: '', contact1: '', contact2: '', email: '' })
  const [editError, setEditError] = useState('')
  const [restaurantSaved, setRestaurantSaved] = useState(false)
  const [copiedUid, setCopiedUid] = useState('')
  const [paymentData, setPaymentData] = useState({})
  const [amountModalUid, setAmountModalUid] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [monthInput, setMonthInput] = useState('')
  const [yearInput, setYearInput] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pendingMode, setPendingMode] = useState(null)
  const [liveStart, setLiveStart] = useState(null)
  const [customStartDate, setCustomStartDate] = useState('')
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const MONTH_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const fmtDateShort = (input) => {
    if (!input) return ''
    const d = new Date(input)
    if (isNaN(d.getTime())) return ''
    return `${String(d.getDate()).padStart(2,'0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
  }
  const fmtDateLong = (input) => {
    if (!input) return ''
    const d = new Date(input)
    if (isNaN(d.getTime())) return ''
    return `${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`
  }
  const addDays = (input, n) => {
    const d = new Date(input)
    d.setDate(d.getDate() + n)
    return d
  }
  const daysRemaining = (endIso, ref = Date.now()) => {
    const ms = new Date(endIso).getTime() - ref
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
  }

  const normalizeEntry = (raw) => {
    const src = raw || {}
    let months = {}
    if (Array.isArray(src.months)) {
      for (const m of src.months) {
        if (m && m.month && isFinite(parseFloat(m.amount))) {
          months[m.month] = (months[m.month] || 0) + parseFloat(m.amount)
        }
      }
    } else if (src.months && typeof src.months === 'object') {
      for (const k of Object.keys(src.months)) {
        const v = parseFloat(src.months[k])
        if (isFinite(v)) months[k] = v
      }
    }
    const years = Array.isArray(src.years)
      ? src.years.map(y => String(y)).filter(Boolean)
      : []
    const history = Array.isArray(src.history)
      ? src.history
          .filter(h => h && isFinite(parseFloat(h.amount)) && h.startDate && h.endDate)
          .map(h => ({
            id: h.id || `${h.startDate}-${h.loggedAt || ''}-${Math.random().toString(36).slice(2,7)}`,
            amount: parseFloat(h.amount),
            mode: h.mode === 'custom' ? 'custom' : 'live',
            startDate: h.startDate,
            endDate: h.endDate,
            loggedAt: h.loggedAt || new Date().toISOString(),
          }))
      : []
    return { months, years, history }
  }

  const entryTotal = (entry) => {
    const history = (entry && entry.history) || []
    return history.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0)
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('exzibo_payment_amounts') || '{}')
      const normalized = {}
      for (const uid of Object.keys(saved)) {
        normalized[uid] = normalizeEntry(saved[uid])
      }
      setPaymentData(normalized)
    } catch {
      setPaymentData({})
    }
  }, [])

  const persistPaymentData = (next) => {
    setPaymentData(next)
    try { localStorage.setItem('exzibo_payment_amounts', JSON.stringify(next)) } catch {}
  }

  const confirmAddMonth = () => {
    const n = parseFloat(monthInput)
    if (!isFinite(n) || n <= 0 || !selectedMonth || !amountModalUid) return
    const prev = normalizeEntry(paymentData[amountModalUid])
    const nextMonths = { ...prev.months, [selectedMonth]: n }
    const next = {
      ...paymentData,
      [amountModalUid]: { ...prev, months: nextMonths },
    }
    persistPaymentData(next)
    setMonthInput('')
  }

  const removeMonthEntry = (uid, monthKey) => {
    const prev = normalizeEntry(paymentData[uid])
    const nextMonths = { ...prev.months }
    delete nextMonths[monthKey]
    persistPaymentData({ ...paymentData, [uid]: { ...prev, months: nextMonths } })
  }

  const confirmAddYear = () => {
    const y = String(yearInput).trim()
    if (!/^\d{4}$/.test(y) || !amountModalUid) return
    const prev = normalizeEntry(paymentData[amountModalUid])
    if (prev.years.includes(y)) { setYearInput(''); return }
    const next = {
      ...paymentData,
      [amountModalUid]: { ...prev, years: [...prev.years, y] },
    }
    persistPaymentData(next)
    setYearInput('')
  }

  const removeYearEntry = (uid, year) => {
    const prev = normalizeEntry(paymentData[uid])
    const nextYears = prev.years.filter(y => y !== year)
    persistPaymentData({ ...paymentData, [uid]: { ...prev, years: nextYears } })
  }

  const logPayment = (computedDraft) => {
    const n = parseFloat(paymentAmountInput)
    if (!isFinite(n) || n <= 0 || !amountModalUid || !computedDraft) return
    const prev = normalizeEntry(paymentData[amountModalUid])
    const newEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      amount: n,
      mode: computedDraft.mode,
      startDate: new Date(computedDraft.startDate).toISOString(),
      endDate: new Date(computedDraft.endDate).toISOString(),
      loggedAt: new Date().toISOString(),
    }
    persistPaymentData({
      ...paymentData,
      [amountModalUid]: { ...prev, history: [...prev.history, newEntry] },
    })
    setPaymentAmountInput('')
    setPendingMode(null)
    setLiveStart(null)
    setCustomStartDate('')
  }

  const deleteHistoryEntry = (uid, id) => {
    const prev = normalizeEntry(paymentData[uid])
    const nextHistory = prev.history.filter(h => h.id !== id)
    persistPaymentData({ ...paymentData, [uid]: { ...prev, history: nextHistory } })
  }

  const cancelDraft = () => {
    setPendingMode(null)
    setLiveStart(null)
    setCustomStartDate('')
    setPaymentAmountInput('')
  }

  const closeAmountModal = () => {
    setAmountModalUid(null)
    setSelectedMonth('')
    setMonthInput('')
    setYearInput('')
    setHistoryOpen(false)
    setPendingMode(null)
    setLiveStart(null)
    setCustomStartDate('')
    setPaymentAmountInput('')
  }

  useEffect(() => {
    if (!amountModalUid) return
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [amountModalUid])

  const copyUid = async (uid) => {
    try {
      await navigator.clipboard.writeText(uid)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = uid; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopiedUid(uid)
    setTimeout(() => setCopiedUid(c => (c === uid ? '' : c)), 1500)
  }

  useEffect(() => {
    const load = () => {
      try {
        const main = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const demo = JSON.parse(localStorage.getItem('exzibo_demo_restaurants') || '[]')
        setRestaurants([...main, ...demo])
      } catch {
        setRestaurants([])
      }
    }
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])

  function hashStr(s) {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
  }

  const paymentRows = restaurants.map(r => {
    const seed = hashStr(String(r.id || r.uid || r.name || ''))
    const status = seed % 2 === 0 ? 'RECEIVED' : 'PENDING'
    const dateObj = r.createdAt ? new Date(r.createdAt) : new Date()
    const date = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const amount = entryTotal(paymentData[r.uid])
    return {
      uid: r.uid || '—',
      name: r.name || 'Untitled',
      amount,
      status,
      date,
      owner: r.owner || '',
      phone: r.phone || '',
      email: r.email || '',
      active: r.status === 'active',
    }
  })

  const fmtAmount = (n) => {
    if (!n || n <= 0) return '00'
    const rounded = Math.round(n)
    return rounded.toLocaleString('en-US')
  }

  const filteredPayments = paymentTab === 'all'
    ? paymentRows
    : paymentRows.filter(r => r.status.toLowerCase() === paymentTab)

  const totalPayments = paymentRows.length
  const totalReceived = paymentRows.filter(r => r.status === 'RECEIVED').reduce((s, r) => s + r.amount, 0)
  const totalPending  = paymentRows.filter(r => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0)
  const fmtMoney = n => `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const matchedRestaurant = searchedUid
    ? restaurants.find(r => String(r.uid || '').toLowerCase() === searchedUid.toLowerCase())
    : null

  const openEditRestaurant = () => {
    if (!matchedRestaurant) return
    setEditForm({
      owner: matchedRestaurant.owner || '',
      contact1: matchedRestaurant.phone || matchedRestaurant.contact1 || '',
      contact2: matchedRestaurant.contact2 || '',
      email: matchedRestaurant.email || '',
    })
    setEditError('')
    setEditingRestaurant(true)
  }

  const cancelEditRestaurant = () => {
    setEditingRestaurant(false)
    setEditError('')
  }

  const saveEditRestaurant = () => {
    const owner = editForm.owner.trim()
    const email = editForm.email.trim()
    if (!owner) { setEditError('Name is required.'); return }
    if (!email) { setEditError('Gmail ID is required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEditError('Please enter a valid Gmail ID.'); return }

    const updateList = (key) => {
      try {
        const list = JSON.parse(localStorage.getItem(key) || '[]')
        const next = list.map(r => r.uid === matchedRestaurant.uid
          ? { ...r, owner, phone: editForm.contact1.trim(), contact1: editForm.contact1.trim(), contact2: editForm.contact2.trim(), email }
          : r
        )
        localStorage.setItem(key, JSON.stringify(next))
      } catch {}
    }
    updateList('exzibo_restaurants')
    updateList('exzibo_demo_restaurants')

    const main = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const demo = JSON.parse(localStorage.getItem('exzibo_demo_restaurants') || '[]')
    setRestaurants([...main, ...demo])
    setEditingRestaurant(false)
    setEditError('')
    setRestaurantSaved(true)
    setTimeout(() => setRestaurantSaved(false), 2500)
  }

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
                    onKeyDown={e => { if (e.key === 'Enter') setSearchedUid(restaurantUidQuery.trim()) }}
                    placeholder="Enter Restaurant UID"
                    style={{
                      flex: 1, minWidth: 0,
                      padding: '10px 0',
                      background: 'transparent', border: 'none',
                      color: '#ccc', fontSize: '12px', outline: 'none',
                    }}
                  />
                </div>
                <button onClick={() => { setSearchedUid(restaurantUidQuery.trim()); setEditingRestaurant(false) }} style={{
                  padding: '10px 22px',
                  background: '#E8321A', border: 'none',
                  borderRadius: '8px',
                  color: '#fff', fontSize: '11px', fontWeight: 700,
                  letterSpacing: '0.08em', cursor: 'pointer',
                  boxShadow: '0 0 14px rgba(232,50,26,0.35)',
                }}>SEARCH</button>
              </div>

              {!searchedUid && (
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  color: '#666', fontSize: '12px',
                }}>
                  {restaurants.length === 0
                    ? 'No restaurants created yet. Create one from the Restaurant Editor.'
                    : `Enter a UID and press SEARCH. ${restaurants.length} restaurant${restaurants.length === 1 ? '' : 's'} available.`}
                </div>
              )}

              {searchedUid && !matchedRestaurant && (
                <div style={{
                  background: 'rgba(232,50,26,0.06)',
                  border: '1px solid rgba(232,50,26,0.2)',
                  borderRadius: '12px',
                  padding: '16px',
                  color: '#E8321A', fontSize: '12px', fontWeight: 600,
                }}>
                  No restaurant found with UID "{searchedUid}".
                </div>
              )}

              {matchedRestaurant && (
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
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>{matchedRestaurant.uid}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Status</div>
                      <div style={{
                        fontSize: '15px', fontWeight: 800, letterSpacing: '0.04em',
                        color: matchedRestaurant.status === 'active' ? '#4ade80' : '#f59e0b',
                      }}>{(matchedRestaurant.status || 'inactive').toUpperCase()}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#888', flexShrink: 0,
                    }}><User size={14} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Restaurant Name</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{matchedRestaurant.name || '—'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={openEditRestaurant}
                      style={{
                        flexShrink: 0,
                        padding: '7px 16px',
                        background: '#2563eb',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '11px', fontWeight: 700,
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        boxShadow: '0 0 10px rgba(37,99,235,0.35)',
                      }}
                    >EDIT</button>
                  </div>

                  {[
                    { icon: <User size={14} />,  label: 'Owner Name',   value: matchedRestaurant.owner || '—' },
                    { icon: <Phone size={14} />, label: 'Contact No 1', value: matchedRestaurant.contact1 || matchedRestaurant.phone || '—' },
                    { icon: <Phone size={14} />, label: 'Contact No 2', value: matchedRestaurant.contact2 || '—' },
                    { icon: <Mail size={14} />,  label: 'Gmail ID',     value: matchedRestaurant.email || '—' },
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

                  {editingRestaurant && (
                    <div style={{
                      marginTop: '14px',
                      paddingTop: '14px',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#E8321A', letterSpacing: '0.08em', marginBottom: '12px' }}>EDIT RESTAURANT INFO</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {[
                          { key: 'owner',    label: 'Name',         type: 'text',  required: true },
                          { key: 'email',    label: 'Gmail ID',     type: 'email', required: true },
                          { key: 'contact1', label: 'Contact No 1', type: 'tel' },
                          { key: 'contact2', label: 'Contact No 2', type: 'tel' },
                        ].map(f => (
                          <div key={f.key} style={{ minWidth: 0 }}>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: '#666', marginBottom: '6px', textTransform: 'uppercase' }}>
                              {f.label}{f.required && <span style={{ color: '#E8321A' }}> *</span>}
                            </label>
                            <input
                              type={f.type}
                              value={editForm[f.key]}
                              onChange={e => setEditForm(s => ({ ...s, [f.key]: e.target.value }))}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px',
                                color: '#fff', fontSize: '12px',
                                outline: 'none', boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      {editError && (
                        <div style={{ marginTop: '10px', fontSize: '11px', color: '#E8321A', fontWeight: 600 }}>{editError}</div>
                      )}

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px', flexWrap: 'wrap' }}>
                        <button onClick={cancelEditRestaurant} style={{
                          padding: '9px 18px',
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          color: '#ccc', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                          cursor: 'pointer',
                        }}>CANCEL</button>
                        <button onClick={saveEditRestaurant} style={{
                          padding: '9px 22px',
                          background: '#E8321A',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                          cursor: 'pointer',
                          boxShadow: '0 0 12px rgba(232,50,26,0.35)',
                        }}>SAVE</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {restaurantSaved && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  background: 'rgba(34,197,94,0.1)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: '8px',
                  color: '#4ade80', fontSize: '12px', fontWeight: 600,
                }}>
                  ✓ Restaurant info updated successfully
                </div>
              )}
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
                  { icon: <Layers size={16} />, label: 'Total Payments', value: String(totalPayments), sub: 'All Time', color: '#3b82f6' },
                  { icon: <DollarSign size={16} />, label: 'Total Received', value: fmtMoney(totalReceived), sub: 'All Time', color: '#4ade80' },
                  { icon: <Clock size={16} />, label: 'Total Pending', value: fmtMoney(totalPending), sub: 'All Time', color: '#f59e0b' },
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
                        <td style={{ padding: '10px 12px', color: '#888', fontFamily: 'monospace' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {row.uid}
                            <button
                              type="button"
                              onClick={() => copyUid(row.uid)}
                              title={copiedUid === row.uid ? 'Copied!' : 'Copy UID'}
                              style={{
                                width: '20px', height: '20px',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: copiedUid === row.uid ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${copiedUid === row.uid ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.1)'}`,
                                borderRadius: '4px',
                                color: copiedUid === row.uid ? '#4ade80' : '#888',
                                cursor: 'pointer',
                                padding: 0,
                                transition: 'all 0.15s',
                              }}
                            >
                              {copiedUid === row.uid ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#ddd', fontWeight: 600 }}>{row.name}</td>
                        <td style={{ padding: '10px 12px', color: '#ccc' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <span>{fmtAmount(row.amount)}</span>
                            <button
                              type="button"
                              onClick={() => { setAmountModalUid(row.uid); setSelectedMonth(''); setMonthInput(''); setYearInput(''); setHistoryOpen(false); setPendingMode(null); setLiveStart(null); setCustomStartDate(''); setPaymentAmountInput(''); setNow(Date.now()) }}
                              style={{
                                padding: '3px 10px',
                                background: '#FF69B4',
                                border: 'none',
                                borderRadius: '999px',
                                color: '#fff',
                                fontSize: '9px', fontWeight: 800,
                                letterSpacing: '0.08em',
                                cursor: 'pointer',
                                boxShadow: '0 0 8px rgba(255,105,180,0.35)',
                              }}
                            >ADD</button>
                          </span>
                        </td>
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

      {amountModalUid && (() => {
        const entry = normalizeEntry(paymentData[amountModalUid])
        const total = entryTotal(entry)
        const today = new Date(now)

        let computedDraft = null
        if (pendingMode === 'live' && liveStart) {
          const start = new Date(liveStart)
          const end = addDays(start, 30)
          computedDraft = { mode: 'live', startDate: start, endDate: end }
        } else if (pendingMode === 'custom' && customStartDate) {
          const start = new Date(`${customStartDate}T00:00:00`)
          if (!isNaN(start.getTime())) {
            const end = addDays(start, 30)
            computedDraft = { mode: 'custom', startDate: start, endDate: end }
          }
        }

        const sortedHistory = [...entry.history].sort(
          (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
        )

        return (
          <div
            onClick={closeAmountModal}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#141414',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                width: '100%', maxWidth: '560px',
                maxHeight: '90vh', overflowY: 'auto',
                padding: '22px',
                color: '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#FF69B4' }}>AMOUNT MANAGER</div>
                  <div style={{ fontSize: '13px', color: '#888', marginTop: '2px', fontFamily: 'monospace' }}>UID: {amountModalUid}</div>
                </div>
                <button onClick={closeAmountModal} style={{
                  width: '30px', height: '30px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#ccc', cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                }}>✕</button>
              </div>

              <div style={{
                background: 'rgba(255,105,180,0.08)',
                border: '1px solid rgba(255,105,180,0.25)',
                borderRadius: '16px',
                padding: '24px', marginBottom: '20px',
                position: 'relative',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: '#FF69B4', marginBottom: '12px' }}>TOTAL AMOUNT</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '78px', fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>{fmtAmount(total)}</div>
                  <span style={{ fontSize: '16px', color: '#888', fontWeight: 700, letterSpacing: '0.08em' }}>INR</span>
                </div>
                <button
                  onClick={() => setHistoryOpen(o => !o)}
                  style={{
                    padding: '8px 14px',
                    background: historyOpen ? 'rgba(255,255,255,0.06)' : '#FF69B4',
                    border: historyOpen ? '1px solid rgba(255,255,255,0.12)' : 'none',
                    borderRadius: '8px',
                    color: '#fff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
                    cursor: 'pointer',
                    boxShadow: historyOpen ? 'none' : '0 0 14px rgba(255,105,180,0.45)',
                  }}
                >{historyOpen ? '✕ CLOSE HISTORY' : 'HISTORY'}</button>
              </div>

              {historyOpen ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.14em', color: '#fff' }}>PAYMENT HISTORY</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{sortedHistory.length} {sortedHistory.length === 1 ? 'entry' : 'entries'}</div>
                  </div>

                  {sortedHistory.length === 0 ? (
                    <div style={{
                      padding: '24px', textAlign: 'center',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px dashed rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      fontSize: '13px', color: '#666',
                    }}>No payment history yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {sortedHistory.map(h => {
                        const expired = new Date(h.endDate).getTime() <= now
                        const remaining = daysRemaining(h.endDate, now)
                        return (
                          <div key={h.id} style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '12px',
                            padding: '14px',
                            display: 'flex', flexDirection: 'column', gap: '8px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                <span style={{ color: '#FF69B4', fontSize: '14px', fontWeight: 800 }}>₹{fmtAmount(h.amount)}</span>
                                <span style={{ color: '#888', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em' }}>INR</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  padding: '3px 8px', borderRadius: '999px',
                                  fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em',
                                  background: h.mode === 'live' ? 'rgba(255,105,180,0.12)' : 'rgba(255,255,255,0.06)',
                                  color: h.mode === 'live' ? '#FF69B4' : '#ccc',
                                  border: `1px solid ${h.mode === 'live' ? 'rgba(255,105,180,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                }}>{h.mode === 'live' ? 'LIVE' : 'CUSTOM'}</span>
                                {expired && (
                                  <span style={{
                                    padding: '3px 8px', borderRadius: '999px',
                                    fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em',
                                    background: 'rgba(239,68,68,0.12)',
                                    color: '#ef4444',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                  }}>🔴 EXPIRED</span>
                                )}
                                <button
                                  onClick={() => deleteHistoryEntry(amountModalUid, h.id)}
                                  title="Delete entry"
                                  style={{
                                    width: '24px', height: '24px', borderRadius: '6px',
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.2)',
                                    color: '#ef4444', cursor: 'pointer',
                                    fontSize: '12px', fontWeight: 700,
                                  }}
                                >✕</button>
                              </div>
                            </div>
                            <div style={{ fontSize: '11px', color: '#aaa', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                              <span><span style={{ color: '#666' }}>Start:</span> {fmtDateShort(h.startDate)}</span>
                              <span><span style={{ color: '#666' }}>End:</span> {fmtDateShort(h.endDate)}</span>
                              {!expired && <span style={{ color: '#4ade80' }}>{remaining} {remaining === 1 ? 'day' : 'days'} remaining</span>}
                            </div>
                            <div style={{ fontSize: '10px', color: '#555' }}>Logged on {fmtDateShort(h.loggedAt)}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px',
                    marginBottom: '14px',
                    fontSize: '12px', color: '#bbb',
                  }}>
                    <span style={{ color: '#666', fontWeight: 700, letterSpacing: '0.08em', fontSize: '10px' }}>TODAY: </span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{fmtDateLong(today)}</span>
                  </div>

                  {!computedDraft && (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#ccc', marginBottom: '10px' }}>SELECT MODE</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: pendingMode === 'custom' ? '14px' : '10px' }}>
                        <button
                          onClick={() => { setPendingMode('live'); setLiveStart(new Date().toISOString()); setCustomStartDate(''); setPaymentAmountInput('') }}
                          style={{
                            padding: '18px 12px',
                            background: pendingMode === 'live' ? '#FF69B4' : 'rgba(255,105,180,0.08)',
                            border: `1px solid ${pendingMode === 'live' ? '#FF69B4' : 'rgba(255,105,180,0.3)'}`,
                            borderRadius: '12px',
                            color: '#fff', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                            boxShadow: pendingMode === 'live' ? '0 0 18px rgba(255,105,180,0.45)' : 'none',
                          }}
                        >
                          <span style={{ fontSize: '20px' }}>⚡</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em' }}>LIVE MONTH</span>
                          <span style={{ fontSize: '10px', color: pendingMode === 'live' ? 'rgba(255,255,255,0.85)' : '#888' }}>Starts today · 30 days</span>
                        </button>
                        <button
                          onClick={() => { setPendingMode('custom'); setLiveStart(null); setPaymentAmountInput('') }}
                          style={{
                            padding: '18px 12px',
                            background: pendingMode === 'custom' ? '#FF69B4' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${pendingMode === 'custom' ? '#FF69B4' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: '12px',
                            color: '#fff', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                            boxShadow: pendingMode === 'custom' ? '0 0 18px rgba(255,105,180,0.45)' : 'none',
                          }}
                        >
                          <span style={{ fontSize: '20px' }}>📅</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em' }}>CUSTOM MONTH</span>
                          <span style={{ fontSize: '10px', color: pendingMode === 'custom' ? 'rgba(255,255,255,0.85)' : '#888' }}>Pick a start date</span>
                        </button>
                      </div>

                      {pendingMode === 'custom' && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#888', marginBottom: '6px' }}>START DATE</div>
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={e => setCustomStartDate(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '8px',
                              color: '#fff', fontSize: '13px', outline: 'none',
                              colorScheme: 'dark',
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {computedDraft && (() => {
                    const startTs = computedDraft.startDate.getTime()
                    const endTs = computedDraft.endDate.getTime()
                    const periodDays = Math.round((endTs - startTs) / (1000 * 60 * 60 * 24))
                    const expired = endTs <= now
                    const remaining = daysRemaining(computedDraft.endDate, now)
                    const totalSpan = endTs - startTs
                    const elapsed = Math.min(Math.max(now - startTs, 0), totalSpan)
                    const progressPct = totalSpan > 0 ? Math.round((elapsed / totalSpan) * 100) : 0
                    return (
                      <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginBottom: '12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', color: '#FF69B4' }}>
                            {computedDraft.mode === 'live' ? '⚡ LIVE SUBSCRIPTION' : '📅 CUSTOM SUBSCRIPTION'}
                          </div>
                          {expired && (
                            <span style={{
                              padding: '3px 9px', borderRadius: '999px',
                              fontSize: '9px', fontWeight: 800, letterSpacing: '0.1em',
                              background: 'rgba(239,68,68,0.12)',
                              color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.3)',
                            }}>🔴 EXPIRED</span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontSize: '9px', color: '#666', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '2px' }}>START DATE</div>
                            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>{fmtDateShort(computedDraft.startDate)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', color: '#666', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '2px' }}>END DATE</div>
                            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>{fmtDateShort(computedDraft.endDate)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', color: '#666', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '2px' }}>DAYS IN PERIOD</div>
                            <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>{periodDays} days</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', color: '#666', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '2px' }}>DAYS REMAINING</div>
                            <div style={{ fontSize: '13px', color: expired ? '#ef4444' : '#4ade80', fontWeight: 700 }}>{remaining} {remaining === 1 ? 'day' : 'days'}</div>
                          </div>
                        </div>

                        <div style={{
                          height: '6px', borderRadius: '999px',
                          background: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden', marginBottom: expired ? '12px' : '0',
                        }}>
                          <div style={{
                            width: `${progressPct}%`, height: '100%',
                            background: expired ? '#ef4444' : '#FF69B4',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>

                        {expired && (
                          <div style={{
                            padding: '8px 12px',
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '8px',
                            fontSize: '11px', color: '#fca5a5',
                          }}>This subscription has expired. Pick a new start date or use Live Month to renew.</div>
                        )}
                      </div>
                    )
                  })()}

                  {computedDraft && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#888', marginBottom: '6px' }}>SUBSCRIPTION AMOUNT (INR)</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          value={paymentAmountInput}
                          onChange={e => setPaymentAmountInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') logPayment(computedDraft) }}
                          placeholder="e.g. 500"
                          style={{
                            flex: 1, minWidth: '140px',
                            padding: '10px 12px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#fff', fontSize: '13px', outline: 'none',
                          }}
                        />
                        <button
                          onClick={() => logPayment(computedDraft)}
                          style={{
                            padding: '10px 18px',
                            background: '#FF69B4', border: 'none', borderRadius: '8px',
                            color: '#fff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
                            cursor: 'pointer',
                            boxShadow: '0 0 14px rgba(255,105,180,0.45)',
                          }}
                        >LOG PAYMENT</button>
                        <button
                          onClick={cancelDraft}
                          style={{
                            padding: '10px 14px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#ccc', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                            cursor: 'pointer',
                          }}
                        >RESET</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#ccc', marginBottom: '10px' }}>YEAR-WISE</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={yearInput}
                    onChange={e => setYearInput(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAddYear() }}
                    placeholder="e.g. 2024"
                    style={{
                      flex: 1, minWidth: '140px',
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      color: '#fff', fontSize: '13px', outline: 'none',
                    }}
                  />
                  <button onClick={confirmAddYear} style={{
                    padding: '10px 16px',
                    background: '#FF69B4', border: 'none', borderRadius: '8px',
                    color: '#fff', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em',
                    cursor: 'pointer',
                    boxShadow: '0 0 12px rgba(255,105,180,0.4)',
                  }}>ADD YEAR</button>
                </div>

                {entry.years.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {entry.years.map(y => (
                      <div key={y} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '5px 10px',
                        background: 'rgba(255,105,180,0.08)',
                        border: '1px solid rgba(255,105,180,0.25)',
                        borderRadius: '999px',
                        fontSize: '11px', fontWeight: 700,
                        color: '#FF69B4',
                        letterSpacing: '0.04em',
                      }}>
                        <span>{y}</span>
                        <button
                          onClick={() => removeYearEntry(amountModalUid, y)}
                          title="Remove"
                          style={{
                            background: 'transparent', border: 'none',
                            color: '#888', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 700, padding: 0, marginLeft: '2px',
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: '#555' }}>No years added yet.</div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
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
