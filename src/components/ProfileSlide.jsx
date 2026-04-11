import React, { useEffect, useRef, useState } from 'react'
import {
  X, Share2, Power, MapPin, Phone, Store, Users, Image,
  Loader2, AlertCircle, CheckCircle2, Check, XCircle, Mail,
} from 'lucide-react'
import { PiPencilCircle } from 'react-icons/pi'

const LIME = '#A8E63D'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadContact(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
    return { phone: config.phone || '', email: config.email || '' }
  }
  const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
  const r = all.find(r => r.id === restaurantId)
  return { phone: r?.phone || '', email: r?.email || '' }
}

function loadLocationAddress(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
    return config.location || ''
  }
  const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
  const r = all.find(r => r.id === restaurantId)
  return r?.location || ''
}

export default function ProfileSlide({
  open, onClose,
  restaurantId, logoUrl, onLogoUpdate,
  restaurantName, onNameUpdate,
}) {
  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)
  const phoneInputRef = useRef(null)
  const addressRef = useRef(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(logoUrl || '')

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(restaurantName || '')
  const [nameError, setNameError] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)

  const [editingContact, setEditingContact] = useState(false)
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhoneError, setContactPhoneError] = useState('')
  const [contactEmailError, setContactEmailError] = useState('')
  const [contactSaving, setContactSaving] = useState(false)
  const [contactSuccess, setContactSuccess] = useState(false)

  const [editingLocation, setEditingLocation] = useState(false)
  const [savedAddress, setSavedAddress] = useState('')
  const [addressInput, setAddressInput] = useState('')
  const [addressError, setAddressError] = useState('')
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationSuccess, setLocationSuccess] = useState(false)

  useEffect(() => { setPreviewUrl(logoUrl || '') }, [logoUrl])
  useEffect(() => { setNameInput(restaurantName || '') }, [restaurantName])

  useEffect(() => {
    const { phone, email } = loadContact(restaurantId)
    setContactPhone(phone)
    setContactEmail(email)
  }, [restaurantId])

  useEffect(() => {
    const addr = loadLocationAddress(restaurantId)
    setSavedAddress(addr)
    setAddressInput(addr)
  }, [restaurantId])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setUploadError(''); setUploadSuccess(false)
      setEditingName(false); setNameError(''); setNameSuccess(false)
      setEditingContact(false); setContactPhoneError(''); setContactEmailError(''); setContactSuccess(false)
      setEditingLocation(false); setAddressError(''); setLocationSuccess(false)
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => { if (editingName) setTimeout(() => nameInputRef.current?.focus(), 60) }, [editingName])
  useEffect(() => { if (editingContact) setTimeout(() => phoneInputRef.current?.focus(), 60) }, [editingContact])
  useEffect(() => { if (editingLocation) setTimeout(() => addressRef.current?.focus(), 60) }, [editingLocation])

  async function handleLogoUpload(file) {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) { setUploadError('Only JPG, PNG, WEBP or GIF images are allowed.'); return }
    if (file.size > 5 * 1024 * 1024) { setUploadError('Image must be smaller than 5 MB.'); return }
    setUploadError(''); setUploading(true); setUploadSuccess(false)
    try {
      const base64 = await fileToBase64(file)
      setPreviewUrl(base64)
      if (!restaurantId || restaurantId === 'default') {
        localStorage.setItem('exzibo_logo_default', base64)
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        localStorage.setItem('exzibo_restaurants', JSON.stringify(all.map(r => r.id === restaurantId ? { ...r, logo: base64 } : r)))
      }
      window.dispatchEvent(new CustomEvent('exzibo-logo-changed', { detail: { restaurantId, logo: base64 } }))
      onLogoUpdate && onLogoUpdate(base64)
      setUploadSuccess(true); setTimeout(() => setUploadSuccess(false), 2500)
    } catch { setUploadError('Upload failed. Please try again.') }
    finally { setUploading(false) }
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameError('Restaurant name cannot be empty.'); return }
    setNameError(''); setNameSaving(true); setNameSuccess(false)
    try {
      await new Promise(r => setTimeout(r, 400))
      if (!restaurantId || restaurantId === 'default') {
        const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
        config.adminTitle = trimmed
        localStorage.setItem('exzibo_admin_global_config', JSON.stringify(config))
        localStorage.setItem('exzibo_name_default', trimmed)
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        localStorage.setItem('exzibo_restaurants', JSON.stringify(all.map(r => r.id === restaurantId ? { ...r, name: trimmed } : r)))
      }
      window.dispatchEvent(new CustomEvent('exzibo-name-changed', { detail: { restaurantId, name: trimmed } }))
      onNameUpdate && onNameUpdate(trimmed)
      setNameSuccess(true); setEditingName(false); setTimeout(() => setNameSuccess(false), 2500)
    } catch { setNameError('Failed to save. Please try again.') }
    finally { setNameSaving(false) }
  }

  function validateContact() {
    let valid = true
    const phoneDigits = contactPhone.replace(/\D/g, '')
    if (!contactPhone.trim()) { setContactPhoneError('Contact number is required.'); valid = false }
    else if (!/^\d+$/.test(contactPhone.trim())) { setContactPhoneError('Only numbers are allowed.'); valid = false }
    else if (phoneDigits.length !== 10) { setContactPhoneError('Must be exactly 10 digits.'); valid = false }
    else setContactPhoneError('')
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!contactEmail.trim()) { setContactEmailError('Email address is required.'); valid = false }
    else if (!emailRegex.test(contactEmail.trim())) { setContactEmailError('Enter a valid email address.'); valid = false }
    else setContactEmailError('')
    return valid
  }

  async function handleSaveContact() {
    if (!validateContact()) return
    setContactSaving(true); setContactSuccess(false)
    try {
      await new Promise(r => setTimeout(r, 400))
      const phone = contactPhone.trim(); const email = contactEmail.trim()
      if (!restaurantId || restaurantId === 'default') {
        const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
        config.phone = phone; config.email = email
        localStorage.setItem('exzibo_admin_global_config', JSON.stringify(config))
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        localStorage.setItem('exzibo_restaurants', JSON.stringify(all.map(r => r.id === restaurantId ? { ...r, phone, email } : r)))
      }
      window.dispatchEvent(new CustomEvent('exzibo-contact-changed', { detail: { restaurantId, phone, email } }))
      setContactSuccess(true); setEditingContact(false); setTimeout(() => setContactSuccess(false), 2500)
    } catch { setContactPhoneError('Failed to save. Please try again.') }
    finally { setContactSaving(false) }
  }

  function handlePhoneInput(val) {
    setContactPhone(val.replace(/\D/g, '').slice(0, 10)); setContactPhoneError('')
  }

  async function handleSaveLocation() {
    const address = addressInput.trim()
    if (!address) { setAddressError('Please enter a restaurant address.'); return }
    setAddressError(''); setLocationSaving(true)
    try {
      await new Promise(r => setTimeout(r, 400))
      if (!restaurantId || restaurantId === 'default') {
        const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
        config.location = address
        localStorage.setItem('exzibo_admin_global_config', JSON.stringify(config))
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        localStorage.setItem('exzibo_restaurants', JSON.stringify(all.map(r => r.id === restaurantId ? { ...r, location: address } : r)))
      }
      window.dispatchEvent(new CustomEvent('exzibo-location-changed', { detail: { restaurantId, location: address } }))
      setSavedAddress(address)
      setLocationSuccess(true); setEditingLocation(false); setTimeout(() => setLocationSuccess(false), 2500)
    } catch { setAddressError('Failed to save. Please try again.') }
    finally { setLocationSaving(false) }
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = '' }}
      />

      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
        transition: 'opacity 0.3s ease', backdropFilter: 'blur(2px)',
      }} />

      <div style={{
        position: 'fixed', top: 0, left: 0, height: '100vh', width: '360px', maxWidth: '95vw',
        background: '#F2F2F7', zIndex: 1001,
        transform: open ? 'translateX(0)' : 'translateX(-110%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        overflowY: 'auto', boxShadow: '8px 0 40px rgba(0,0,0,0.35)', borderRadius: '0 20px 20px 0',
      }}>
        <div style={{ padding: '20px 16px 32px' }}>

          {/* Close */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button onClick={onClose} style={{
              background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#555',
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Profile card */}
          <div style={{
            background: '#fff', borderRadius: '18px', padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: '14px',
            marginBottom: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            <div onClick={() => fileInputRef.current?.click()} title="Click to change logo" style={{
              width: '52px', height: '52px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '20px', letterSpacing: '0.03em',
              flexShrink: 0, cursor: 'pointer', overflow: 'hidden', position: 'relative',
            }}>
              {previewUrl
                ? <img src={previewUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (restaurantName ? restaurantName.slice(0, 2).toUpperCase() : 'EA')}
              {uploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={18} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#111', letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {restaurantName || 'Exzibo'}
              </div>
              <div style={{ fontWeight: 400, fontSize: '13px', color: '#888', marginTop: '2px' }}>exzibonew@exzibo.com</div>
            </div>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#999', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <Share2 size={18} strokeWidth={1.6} />
            </button>
          </div>

          {/* Status banners */}
          {uploadError && <StatusMsg type="error"><AlertCircle size={14} />{uploadError}</StatusMsg>}
          {uploadSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Logo updated successfully!</StatusMsg>}
          {nameSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Restaurant name updated!</StatusMsg>}
          {contactSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Contact info updated successfully!</StatusMsg>}
          {locationSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Location updated successfully!</StatusMsg>}

          <div style={{ background: '#E9E9EF', borderRadius: '18px', padding: '8px 10px', marginBottom: '14px' }}>

            {/* EDIT LOGO */}
            <div onClick={() => { setUploadError(''); fileInputRef.current?.click() }} style={rowStyle}>
              <span style={iconWrap}>
                {uploading
                  ? <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                  : <PiPencilCircle size={26} strokeWidth={1.2} />}
              </span>
              <span style={rowLabel}>EDIT LOGO</span>
              {uploadSuccess && <CheckCircle2 size={16} color="#10B981" />}
            </div>

            {/* EDIT RESTAURANT NAME */}
            <ExpandableRow
              icon={<Store size={22} strokeWidth={1.4} />}
              label="EDIT RESTAURANT NAME"
              open={editingName}
              success={nameSuccess && !editingName}
              onToggle={() => { setEditingName(v => !v); setNameError('') }}
            >
              <input ref={nameInputRef} value={nameInput}
                onChange={e => { setNameInput(e.target.value); setNameError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                placeholder="Enter restaurant name…"
                style={inputStyle(nameError)}
                onFocus={e => e.target.style.borderColor = LIME}
                onBlur={e => e.target.style.borderColor = nameError ? '#FECACA' : '#E0E0E8'}
              />
              {nameError && <InlineError>{nameError}</InlineError>}
              <ActionButtons
                onSave={handleSaveName}
                onCancel={() => { setEditingName(false); setNameError(''); setNameInput(restaurantName || '') }}
                saving={nameSaving}
              />
            </ExpandableRow>

            {/* CONTACT INFO */}
            <ExpandableRow
              icon={<Phone size={22} strokeWidth={1.4} />}
              label="CONTACT INFO"
              open={editingContact}
              success={contactSuccess && !editingContact}
              onToggle={() => {
                setEditingContact(v => !v); setContactPhoneError(''); setContactEmailError('')
                if (!editingContact) { const { phone, email } = loadContact(restaurantId); setContactPhone(phone); setContactEmail(email) }
              }}
            >
              <FieldLabel icon={<Phone size={11} />} label="Contact Number" />
              <input ref={phoneInputRef} type="tel" inputMode="numeric" value={contactPhone}
                onChange={e => handlePhoneInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setEditingContact(false) }}
                placeholder="10-digit number" maxLength={10}
                style={inputStyle(contactPhoneError)}
                onFocus={e => e.target.style.borderColor = contactPhoneError ? '#FECACA' : LIME}
                onBlur={e => e.target.style.borderColor = contactPhoneError ? '#FECACA' : '#E0E0E8'}
              />
              {contactPhoneError && <InlineError>{contactPhoneError}</InlineError>}
              <FieldLabel icon={<Mail size={11} />} label="Email Address" />
              <input type="email" value={contactEmail}
                onChange={e => { setContactEmail(e.target.value); setContactEmailError('') }}
                onKeyDown={e => { if (e.key === 'Escape') setEditingContact(false) }}
                placeholder="example@gmail.com"
                style={inputStyle(contactEmailError)}
                onFocus={e => e.target.style.borderColor = contactEmailError ? '#FECACA' : LIME}
                onBlur={e => e.target.style.borderColor = contactEmailError ? '#FECACA' : '#E0E0E8'}
              />
              {contactEmailError && <InlineError>{contactEmailError}</InlineError>}
              <ActionButtons
                onSave={handleSaveContact}
                onCancel={() => {
                  setEditingContact(false); setContactPhoneError(''); setContactEmailError('')
                  const { phone, email } = loadContact(restaurantId); setContactPhone(phone); setContactEmail(email)
                }}
                saving={contactSaving}
              />
            </ExpandableRow>

            {/* LOCATION */}
            <ExpandableRow
              icon={<MapPin size={22} strokeWidth={1.4} />}
              label="LOCATION"
              open={editingLocation}
              success={locationSuccess && !editingLocation}
              onToggle={() => {
                setEditingLocation(v => !v); setAddressError('')
                if (!editingLocation) { setAddressInput(loadLocationAddress(restaurantId)) }
              }}
            >
              {savedAddress && (
                <div style={{
                  background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: '10px',
                  padding: '8px 12px', marginBottom: '12px',
                  display: 'flex', alignItems: 'flex-start', gap: '7px',
                }}>
                  <MapPin size={13} color="#10B981" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#065F46', fontWeight: 600, lineHeight: 1.5 }}>{savedAddress}</span>
                </div>
              )}
              <FieldLabel icon={<MapPin size={11} />} label="Restaurant Address" />
              <textarea
                ref={addressRef}
                value={addressInput}
                onChange={e => { setAddressInput(e.target.value); setAddressError('') }}
                placeholder="Enter your full restaurant address…"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', borderRadius: '10px',
                  border: `1.5px solid ${addressError ? '#FECACA' : '#E0E0E8'}`,
                  fontSize: '13px', fontWeight: 500, color: '#111',
                  outline: 'none', background: '#F7F7FA',
                  resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
                  transition: 'border-color 0.15s', marginBottom: addressError ? '6px' : '10px',
                }}
                onFocus={e => e.target.style.borderColor = addressError ? '#FECACA' : LIME}
                onBlur={e => e.target.style.borderColor = addressError ? '#FECACA' : '#E0E0E8'}
              />
              {addressError && <InlineError>{addressError}</InlineError>}
              <ActionButtons
                onSave={handleSaveLocation}
                onCancel={() => {
                  setEditingLocation(false); setAddressError('')
                  setAddressInput(loadLocationAddress(restaurantId))
                }}
                saving={locationSaving}
              />
            </ExpandableRow>

            {/* TEAM MEMBERS */}
            <div style={rowStyle}>
              <span style={iconWrap}><Users size={22} strokeWidth={1.4} /></span>
              <span style={rowLabel}>TEAM MEMBERS</span>
            </div>

          </div>

          {/* Image Carousel */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', marginBottom: '10px', paddingLeft: '4px' }}>
              Image Carousel
            </div>
            <div style={{ background: '#E9E9EF', borderRadius: '18px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Image size={32} color="#bbb" strokeWidth={1.2} />
            </div>
          </div>

          {/* Logout */}
          <div style={{ background: '#fff', borderRadius: '18px', padding: '4px 10px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 10px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Power size={20} strokeWidth={1.4} color="#555" />
              <span style={{ fontWeight: 600, fontSize: '15px', color: '#222', letterSpacing: '0.01em' }}>Logout</span>
            </button>
          </div>

        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

function ExpandableRow({ icon, label, open, success, onToggle, children }) {
  return (
    <div style={{ marginBottom: '2px' }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '13px 10px',
        borderRadius: open ? '12px 12px 0 0' : '12px',
        background: open ? 'rgba(168,230,61,0.15)' : 'transparent',
        cursor: 'pointer', transition: 'background 0.15s',
      }}>
        <span style={iconWrap}>{icon}</span>
        <span style={{ ...rowLabel, flex: 1 }}>{label}</span>
        {success && <CheckCircle2 size={16} color="#10B981" />}
      </div>
      {open && (
        <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', padding: '12px 12px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function StatusMsg({ type, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: type === 'error' ? '#FEF2F2' : '#F0FDF4',
      border: `1px solid ${type === 'error' ? '#FECACA' : '#A7F3D0'}`,
      borderRadius: '12px', padding: '10px 14px', marginBottom: '10px',
      color: type === 'error' ? '#EF4444' : '#10B981', fontSize: '12px', fontWeight: 600,
    }}>
      {children}
    </div>
  )
}

function InlineError({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#EF4444', fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>
      <AlertCircle size={12} /> {children}
    </div>
  )
}

function FieldLabel({ icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: '#888', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>
      {icon} {label}
    </div>
  )
}

function ActionButtons({ onSave, onCancel, saving }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button onClick={onSave} disabled={saving} style={{
        flex: 1, padding: '9px 0', borderRadius: '10px', background: LIME, border: 'none',
        fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em', color: '#1a1a1a',
        cursor: saving ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        opacity: saving ? 0.7 : 1, transition: 'opacity 0.15s',
      }}>
        {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> SAVING…</> : <><Check size={13} /> SAVE</>}
      </button>
      <button onClick={onCancel} style={{
        padding: '9px 14px', borderRadius: '10px', background: '#EBEBF0', border: 'none',
        fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em', color: '#555',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
      }}>
        <XCircle size={13} /> CANCEL
      </button>
    </div>
  )
}

function inputStyle(hasError) {
  return {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px',
    border: `1.5px solid ${hasError ? '#FECACA' : '#E0E0E8'}`,
    fontSize: '14px', fontWeight: 600, color: '#111', outline: 'none', background: '#F7F7FA',
    marginBottom: hasError ? '6px' : '10px', transition: 'border-color 0.15s',
  }
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: '14px',
  padding: '13px 10px', borderRadius: '12px',
  background: 'transparent', cursor: 'pointer',
  marginBottom: '2px',
}

const iconWrap = { color: '#333', display: 'flex', alignItems: 'center' }
const rowLabel = { fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#222' }
