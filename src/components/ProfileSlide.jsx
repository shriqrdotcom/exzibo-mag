import React, { useEffect, useRef, useState } from 'react'
import {
  X, Share2, Power, MapPin, Phone, Store, Users, Image,
  Loader2, AlertCircle, CheckCircle2, Check, XCircle, Mail,
  Navigation, PenLine
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

function loadLocation(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
    return { address: config.location || '', lat: config.locationLat || null, lng: config.locationLng || null }
  }
  const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
  const r = all.find(r => r.id === restaurantId)
  return { address: r?.location || '', lat: r?.locationLat || null, lng: r?.locationLng || null }
}

export default function ProfileSlide({
  open, onClose,
  restaurantId, logoUrl, onLogoUpdate,
  restaurantName, onNameUpdate,
}) {
  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)
  const phoneInputRef = useRef(null)
  const manualAddressRef = useRef(null)

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
  const [locationAddress, setLocationAddress] = useState('')
  const [locationLat, setLocationLat] = useState(null)
  const [locationLng, setLocationLng] = useState(null)
  const [manualAddress, setManualAddress] = useState('')
  const [detectedAddress, setDetectedAddress] = useState('')
  const [locationDetecting, setLocationDetecting] = useState(false)
  const [locationDetectError, setLocationDetectError] = useState('')
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationSuccess, setLocationSuccess] = useState(false)
  const [locationMode, setLocationMode] = useState('manual')

  useEffect(() => { setPreviewUrl(logoUrl || '') }, [logoUrl])
  useEffect(() => { setNameInput(restaurantName || '') }, [restaurantName])

  useEffect(() => {
    const { phone, email } = loadContact(restaurantId)
    setContactPhone(phone)
    setContactEmail(email)
  }, [restaurantId])

  useEffect(() => {
    const { address } = loadLocation(restaurantId)
    setLocationAddress(address)
    setManualAddress(address)
  }, [restaurantId])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setUploadError('')
      setUploadSuccess(false)
      setEditingName(false)
      setNameError('')
      setNameSuccess(false)
      setEditingContact(false)
      setContactPhoneError('')
      setContactEmailError('')
      setContactSuccess(false)
      setEditingLocation(false)
      setLocationDetectError('')
      setDetectedAddress('')
      setLocationSuccess(false)
      setLocationMode('manual')
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (editingName) setTimeout(() => nameInputRef.current?.focus(), 60)
  }, [editingName])

  useEffect(() => {
    if (editingContact) setTimeout(() => phoneInputRef.current?.focus(), 60)
  }, [editingContact])

  useEffect(() => {
    if (editingLocation && locationMode === 'manual') {
      setTimeout(() => manualAddressRef.current?.focus(), 60)
    }
  }, [editingLocation, locationMode])

  async function handleLogoUpload(file) {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) { setUploadError('Only JPG, PNG, WEBP or GIF images are allowed.'); return }
    if (file.size > 5 * 1024 * 1024) { setUploadError('Image must be smaller than 5 MB.'); return }
    setUploadError('')
    setUploading(true)
    setUploadSuccess(false)
    try {
      const base64 = await fileToBase64(file)
      setPreviewUrl(base64)
      if (!restaurantId || restaurantId === 'default') {
        localStorage.setItem('exzibo_logo_default', base64)
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const updated = all.map(r => r.id === restaurantId ? { ...r, logo: base64 } : r)
        localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
      }
      window.dispatchEvent(new CustomEvent('exzibo-logo-changed', { detail: { restaurantId, logo: base64 } }))
      onLogoUpdate && onLogoUpdate(base64)
      setUploadSuccess(true)
      setTimeout(() => setUploadSuccess(false), 2500)
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameError('Restaurant name cannot be empty.'); return }
    setNameError('')
    setNameSaving(true)
    setNameSuccess(false)
    try {
      await new Promise(r => setTimeout(r, 400))
      if (!restaurantId || restaurantId === 'default') {
        const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
        config.adminTitle = trimmed
        localStorage.setItem('exzibo_admin_global_config', JSON.stringify(config))
        localStorage.setItem('exzibo_name_default', trimmed)
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const updated = all.map(r => r.id === restaurantId ? { ...r, name: trimmed } : r)
        localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
      }
      window.dispatchEvent(new CustomEvent('exzibo-name-changed', { detail: { restaurantId, name: trimmed } }))
      onNameUpdate && onNameUpdate(trimmed)
      setNameSuccess(true)
      setEditingName(false)
      setTimeout(() => setNameSuccess(false), 2500)
    } catch {
      setNameError('Failed to save. Please try again.')
    } finally {
      setNameSaving(false)
    }
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
    setContactSaving(true)
    setContactSuccess(false)
    try {
      await new Promise(r => setTimeout(r, 400))
      const phone = contactPhone.trim()
      const email = contactEmail.trim()
      if (!restaurantId || restaurantId === 'default') {
        const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
        config.phone = phone
        config.email = email
        localStorage.setItem('exzibo_admin_global_config', JSON.stringify(config))
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const updated = all.map(r => r.id === restaurantId ? { ...r, phone, email } : r)
        localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
      }
      window.dispatchEvent(new CustomEvent('exzibo-contact-changed', { detail: { restaurantId, phone, email } }))
      setContactSuccess(true)
      setEditingContact(false)
      setTimeout(() => setContactSuccess(false), 2500)
    } catch {
      setContactPhoneError('Failed to save. Please try again.')
    } finally {
      setContactSaving(false)
    }
  }

  function handlePhoneInput(val) {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    setContactPhone(digits)
    setContactPhoneError('')
  }

  async function handleDetectLocation() {
    if (!navigator.geolocation) {
      setLocationDetectError('Geolocation is not supported by your browser.')
      return
    }
    setLocationDetecting(true)
    setLocationDetectError('')
    setDetectedAddress('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`,
            { headers: { 'User-Agent': 'ExziboApp/1.0' } }
          )
          const data = await res.json()
          const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          setDetectedAddress(addr)
          setLocationLat(lat)
          setLocationLng(lng)
          setManualAddress(addr)
        } catch {
          setLocationDetectError('Could not fetch address. Check your connection.')
        } finally {
          setLocationDetecting(false)
        }
      },
      (err) => {
        setLocationDetecting(false)
        if (err.code === err.PERMISSION_DENIED) {
          setLocationDetectError('Location permission denied. Please allow location access and try again.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationDetectError('Location unavailable. Try entering address manually.')
        } else {
          setLocationDetectError('Could not detect location. Try entering address manually.')
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  async function handleSaveLocation() {
    const address = manualAddress.trim()
    if (!address) return
    setLocationSaving(true)
    try {
      await new Promise(r => setTimeout(r, 400))
      if (!restaurantId || restaurantId === 'default') {
        const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
        config.location = address
        if (locationLat) config.locationLat = locationLat
        if (locationLng) config.locationLng = locationLng
        localStorage.setItem('exzibo_admin_global_config', JSON.stringify(config))
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const updated = all.map(r => r.id === restaurantId
          ? { ...r, location: address, ...(locationLat ? { locationLat } : {}), ...(locationLng ? { locationLng } : {}) }
          : r
        )
        localStorage.setItem('exzibo_restaurants', JSON.stringify(updated))
      }
      window.dispatchEvent(new CustomEvent('exzibo-location-changed', {
        detail: { restaurantId, location: address, locationLat, locationLng }
      }))
      setLocationAddress(address)
      setLocationSuccess(true)
      setEditingLocation(false)
      setTimeout(() => setLocationSuccess(false), 2500)
    } catch {
      setLocationDetectError('Failed to save. Please try again.')
    } finally {
      setLocationSaving(false)
    }
  }

  const InputField = ({ label, icon, children }) => (
    <div style={{ marginBottom: '10px' }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        fontSize: '11px', fontWeight: 700, color: '#888',
        letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px',
      }}>
        {icon} {label}
      </label>
      {children}
    </div>
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleLogoUpload(file)
          e.target.value = ''
        }}
      />

      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 1000, opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.3s ease', backdropFilter: 'blur(2px)',
        }}
      />

      <div style={{
        position: 'fixed', top: 0, left: 0,
        height: '100vh', width: '360px', maxWidth: '95vw',
        background: '#F2F2F7', zIndex: 1001,
        transform: open ? 'translateX(0)' : 'translateX(-110%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        overflowY: 'auto',
        boxShadow: '8px 0 40px rgba(0,0,0,0.35)',
        borderRadius: '0 20px 20px 0',
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
            <div
              onClick={() => fileInputRef.current?.click()}
              title="Click to change logo"
              style={{
                width: '52px', height: '52px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: '20px',
                letterSpacing: '0.03em', flexShrink: 0,
                cursor: 'pointer', overflow: 'hidden', position: 'relative',
              }}
            >
              {previewUrl
                ? <img src={previewUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (restaurantName ? restaurantName.slice(0, 2).toUpperCase() : 'EA')}
              {uploading && (
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Loader2 size={18} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#111', letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {restaurantName || 'Exzibo'}
              </div>
              <div style={{ fontWeight: 400, fontSize: '13px', color: '#888', marginTop: '2px' }}>
                exzibonew@exzibo.com
              </div>
            </div>
            <button style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#999', padding: '4px', display: 'flex', alignItems: 'center',
            }}>
              <Share2 size={18} strokeWidth={1.6} />
            </button>
          </div>

          {/* Status messages */}
          {uploadError && <StatusMsg type="error"><AlertCircle size={14} /> {uploadError}</StatusMsg>}
          {uploadSuccess && <StatusMsg type="success"><CheckCircle2 size={14} /> Logo updated successfully!</StatusMsg>}
          {nameSuccess && <StatusMsg type="success"><CheckCircle2 size={14} /> Restaurant name updated!</StatusMsg>}
          {contactSuccess && <StatusMsg type="success"><CheckCircle2 size={14} /> Contact info updated successfully!</StatusMsg>}
          {locationSuccess && <StatusMsg type="success"><CheckCircle2 size={14} /> Location updated successfully!</StatusMsg>}

          {/* Menu list */}
          <div style={{ background: '#E9E9EF', borderRadius: '18px', padding: '8px 10px', marginBottom: '14px' }}>

            {/* EDIT LOGO */}
            <div
              onClick={() => { setUploadError(''); fileInputRef.current?.click() }}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '13px 10px', borderRadius: '12px',
                background: 'transparent', marginBottom: '2px',
                cursor: 'pointer', transition: 'background 0.15s', position: 'relative',
              }}
            >
              <span style={{ color: '#333', display: 'flex', alignItems: 'center' }}>
                {uploading
                  ? <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                  : <PiPencilCircle size={26} strokeWidth={1.2} />}
              </span>
              <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#222', flex: 1 }}>
                EDIT LOGO
              </span>
              {uploadSuccess && <CheckCircle2 size={16} color="#10B981" />}
            </div>

            {/* EDIT RESTAURANT NAME */}
            <div style={{ marginBottom: '2px' }}>
              <div
                onClick={() => { setEditingName(v => !v); setNameError('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '13px 10px', borderRadius: editingName ? '12px 12px 0 0' : '12px',
                  background: editingName ? 'rgba(168,230,61,0.15)' : 'transparent',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
              >
                <span style={{ color: '#333', display: 'flex', alignItems: 'center' }}>
                  <Store size={22} strokeWidth={1.4} />
                </span>
                <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#222', flex: 1 }}>
                  EDIT RESTAURANT NAME
                </span>
                {nameSuccess && !editingName && <CheckCircle2 size={16} color="#10B981" />}
              </div>
              {editingName && (
                <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', padding: '12px 12px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  <input
                    ref={nameInputRef}
                    value={nameInput}
                    onChange={e => { setNameInput(e.target.value); setNameError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                    placeholder="Enter restaurant name..."
                    style={inputStyle(nameError)}
                    onFocus={e => e.target.style.borderColor = LIME}
                    onBlur={e => e.target.style.borderColor = nameError ? '#FECACA' : '#E0E0E8'}
                  />
                  {nameError && <InlineError>{nameError}</InlineError>}
                  <ActionButtons
                    onSave={handleSaveName} onCancel={() => { setEditingName(false); setNameError(''); setNameInput(restaurantName || '') }}
                    saving={nameSaving}
                  />
                </div>
              )}
            </div>

            {/* CONTACT INFO */}
            <div style={{ marginBottom: '2px' }}>
              <div
                onClick={() => {
                  setEditingContact(v => !v)
                  setContactPhoneError('')
                  setContactEmailError('')
                  if (!editingContact) {
                    const { phone, email } = loadContact(restaurantId)
                    setContactPhone(phone)
                    setContactEmail(email)
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '13px 10px',
                  borderRadius: editingContact ? '12px 12px 0 0' : '12px',
                  background: editingContact ? 'rgba(168,230,61,0.15)' : 'transparent',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
              >
                <span style={{ color: '#333', display: 'flex', alignItems: 'center' }}>
                  <Phone size={22} strokeWidth={1.4} />
                </span>
                <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#222', flex: 1 }}>
                  CONTACT INFO
                </span>
                {contactSuccess && !editingContact && <CheckCircle2 size={16} color="#10B981" />}
              </div>
              {editingContact && (
                <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', padding: '12px 12px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  <InputField label="Contact Number" icon={<Phone size={11} />}>
                    <input
                      ref={phoneInputRef}
                      type="tel"
                      inputMode="numeric"
                      value={contactPhone}
                      onChange={e => handlePhoneInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingContact(false) }}
                      placeholder="10-digit number"
                      maxLength={10}
                      style={inputStyle(contactPhoneError)}
                      onFocus={e => e.target.style.borderColor = contactPhoneError ? '#FECACA' : LIME}
                      onBlur={e => e.target.style.borderColor = contactPhoneError ? '#FECACA' : '#E0E0E8'}
                    />
                  </InputField>
                  {contactPhoneError && <InlineError>{contactPhoneError}</InlineError>}
                  <InputField label="Email Address" icon={<Mail size={11} />}>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={e => { setContactEmail(e.target.value); setContactEmailError('') }}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingContact(false) }}
                      placeholder="example@gmail.com"
                      style={inputStyle(contactEmailError)}
                      onFocus={e => e.target.style.borderColor = contactEmailError ? '#FECACA' : LIME}
                      onBlur={e => e.target.style.borderColor = contactEmailError ? '#FECACA' : '#E0E0E8'}
                    />
                  </InputField>
                  {contactEmailError && <InlineError>{contactEmailError}</InlineError>}
                  <ActionButtons
                    onSave={handleSaveContact}
                    onCancel={() => {
                      setEditingContact(false)
                      setContactPhoneError('')
                      setContactEmailError('')
                      const { phone, email } = loadContact(restaurantId)
                      setContactPhone(phone)
                      setContactEmail(email)
                    }}
                    saving={contactSaving}
                  />
                </div>
              )}
            </div>

            {/* LOCATION */}
            <div style={{ marginBottom: '2px' }}>
              <div
                onClick={() => {
                  setEditingLocation(v => !v)
                  setLocationDetectError('')
                  if (!editingLocation) {
                    const { address } = loadLocation(restaurantId)
                    setManualAddress(address)
                    setDetectedAddress('')
                    setLocationLat(null)
                    setLocationLng(null)
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '13px 10px',
                  borderRadius: editingLocation ? '12px 12px 0 0' : '12px',
                  background: editingLocation ? 'rgba(168,230,61,0.15)' : 'transparent',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
              >
                <span style={{ color: '#333', display: 'flex', alignItems: 'center' }}>
                  <MapPin size={22} strokeWidth={1.4} />
                </span>
                <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#222', flex: 1 }}>
                  LOCATION
                </span>
                {locationSuccess && !editingLocation && <CheckCircle2 size={16} color="#10B981" />}
              </div>

              {editingLocation && (
                <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', padding: '14px 12px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

                  {/* Current saved location */}
                  {locationAddress && (
                    <div style={{
                      background: '#F0FDF4', border: '1px solid #A7F3D0',
                      borderRadius: '10px', padding: '8px 12px', marginBottom: '12px',
                      display: 'flex', alignItems: 'flex-start', gap: '8px',
                    }}>
                      <MapPin size={13} color="#10B981" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: '#065F46', fontWeight: 600, lineHeight: 1.5 }}>
                        {locationAddress}
                      </span>
                    </div>
                  )}

                  {/* Mode tabs */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                    <button
                      onClick={() => { setLocationMode('auto'); setLocationDetectError('') }}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: '10px', border: 'none',
                        background: locationMode === 'auto' ? '#1a1a1a' : '#F0F0F5',
                        color: locationMode === 'auto' ? '#fff' : '#555',
                        fontWeight: 700, fontSize: '11px', letterSpacing: '0.06em',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        transition: 'all 0.15s',
                      }}
                    >
                      <Navigation size={12} /> AUTO DETECT
                    </button>
                    <button
                      onClick={() => { setLocationMode('manual'); setLocationDetectError('') }}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: '10px', border: 'none',
                        background: locationMode === 'manual' ? '#1a1a1a' : '#F0F0F5',
                        color: locationMode === 'manual' ? '#fff' : '#555',
                        fontWeight: 700, fontSize: '11px', letterSpacing: '0.06em',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        transition: 'all 0.15s',
                      }}
                    >
                      <PenLine size={12} /> MANUAL
                    </button>
                  </div>

                  {/* Auto detect section */}
                  {locationMode === 'auto' && (
                    <div>
                      <button
                        onClick={handleDetectLocation}
                        disabled={locationDetecting}
                        style={{
                          width: '100%', padding: '11px 0', borderRadius: '10px',
                          background: locationDetecting ? '#E9E9EF' : '#1a1a1a',
                          border: 'none', color: locationDetecting ? '#999' : '#fff',
                          fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em',
                          cursor: locationDetecting ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          marginBottom: '10px', transition: 'all 0.15s',
                        }}
                      >
                        {locationDetecting
                          ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> DETECTING…</>
                          : <><Navigation size={14} /> USE MY CURRENT LOCATION</>}
                      </button>

                      {locationDetectError && (
                        <div style={{
                          display: 'flex', alignItems: 'flex-start', gap: '7px',
                          background: '#FEF2F2', border: '1px solid #FECACA',
                          borderRadius: '10px', padding: '10px 12px', marginBottom: '10px',
                          color: '#EF4444', fontSize: '12px', fontWeight: 600, lineHeight: 1.4,
                        }}>
                          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                          {locationDetectError}
                        </div>
                      )}

                      {detectedAddress && (
                        <div style={{
                          background: '#F0F9FF', border: '1px solid #BAE6FD',
                          borderRadius: '10px', padding: '10px 12px', marginBottom: '10px',
                        }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: '#0369A1', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Detected Address
                          </div>
                          <div style={{ fontSize: '12px', color: '#0C4A6E', fontWeight: 600, lineHeight: 1.5 }}>
                            {detectedAddress}
                          </div>
                          {locationLat && locationLng && (
                            <a
                              href={`https://www.google.com/maps?q=${locationLat},${locationLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                marginTop: '6px', fontSize: '11px', color: '#2563EB',
                                fontWeight: 600, textDecoration: 'none',
                              }}
                            >
                              <MapPin size={10} /> View on Google Maps ↗
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual section */}
                  {locationMode === 'manual' && (
                    <div>
                      <InputField label="Restaurant Address" icon={<MapPin size={11} />}>
                        <textarea
                          ref={manualAddressRef}
                          value={manualAddress}
                          onChange={e => setManualAddress(e.target.value)}
                          placeholder="Enter your full restaurant address..."
                          rows={3}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '10px 12px', borderRadius: '10px',
                            border: '1.5px solid #E0E0E8',
                            fontSize: '13px', fontWeight: 500, color: '#111',
                            outline: 'none', background: '#F7F7FA',
                            resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
                            transition: 'border-color 0.15s',
                          }}
                          onFocus={e => e.target.style.borderColor = LIME}
                          onBlur={e => e.target.style.borderColor = '#E0E0E8'}
                        />
                      </InputField>
                    </div>
                  )}

                  {locationDetectError && locationMode === 'manual' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      color: '#EF4444', fontSize: '11px', fontWeight: 600, marginBottom: '8px',
                    }}>
                      <AlertCircle size={12} /> {locationDetectError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      onClick={handleSaveLocation}
                      disabled={locationSaving || !manualAddress.trim()}
                      style={{
                        flex: 1, padding: '9px 0', borderRadius: '10px',
                        background: (!manualAddress.trim()) ? '#E9E9EF' : LIME,
                        border: 'none',
                        fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em',
                        color: (!manualAddress.trim()) ? '#aaa' : '#1a1a1a',
                        cursor: (locationSaving || !manualAddress.trim()) ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        opacity: locationSaving ? 0.7 : 1, transition: 'all 0.15s',
                      }}
                    >
                      {locationSaving
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> SAVING…</>
                        : <><Check size={13} /> SAVE LOCATION</>}
                    </button>
                    <button
                      onClick={() => {
                        setEditingLocation(false)
                        setLocationDetectError('')
                        setDetectedAddress('')
                        const { address } = loadLocation(restaurantId)
                        setManualAddress(address)
                      }}
                      style={{
                        padding: '9px 14px', borderRadius: '10px',
                        background: '#EBEBF0', border: 'none',
                        fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em',
                        color: '#555', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '5px',
                      }}
                    >
                      <XCircle size={13} /> CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* TEAM MEMBERS */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '13px 10px', borderRadius: '12px', cursor: 'default',
            }}>
              <span style={{ color: '#333', display: 'flex', alignItems: 'center' }}>
                <Users size={22} strokeWidth={1.4} />
              </span>
              <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#222' }}>
                TEAM MEMBERS
              </span>
            </div>
          </div>

          {/* Image Carousel */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#999', marginBottom: '10px', paddingLeft: '4px',
            }}>
              Image Carousel
            </div>
            <div style={{
              background: '#E9E9EF', borderRadius: '18px', height: '130px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Image size={32} color="#bbb" strokeWidth={1.2} />
            </div>
          </div>

          {/* Logout */}
          <div style={{ background: '#fff', borderRadius: '18px', padding: '4px 10px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 10px', width: '100%',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              <Power size={20} strokeWidth={1.4} color="#555" />
              <span style={{ fontWeight: 600, fontSize: '15px', color: '#222', letterSpacing: '0.01em' }}>
                Logout
              </span>
            </button>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

function StatusMsg({ type, children }) {
  const isError = type === 'error'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: isError ? '#FEF2F2' : '#F0FDF4',
      border: `1px solid ${isError ? '#FECACA' : '#A7F3D0'}`,
      borderRadius: '12px', padding: '10px 14px', marginBottom: '10px',
      color: isError ? '#EF4444' : '#10B981', fontSize: '12px', fontWeight: 600,
    }}>
      {children}
    </div>
  )
}

function InlineError({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      color: '#EF4444', fontSize: '11px', fontWeight: 600, marginBottom: '8px',
    }}>
      <AlertCircle size={12} /> {children}
    </div>
  )
}

function ActionButtons({ onSave, onCancel, saving }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={onSave}
        disabled={saving}
        style={{
          flex: 1, padding: '9px 0', borderRadius: '10px',
          background: '#A8E63D', border: 'none',
          fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em',
          color: '#1a1a1a', cursor: saving ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          opacity: saving ? 0.7 : 1, transition: 'opacity 0.15s',
        }}
      >
        {saving
          ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> SAVING…</>
          : <><Check size={13} /> SAVE</>}
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: '9px 14px', borderRadius: '10px',
          background: '#EBEBF0', border: 'none',
          fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em',
          color: '#555', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}
      >
        <XCircle size={13} /> CANCEL
      </button>
    </div>
  )
}

function inputStyle(hasError) {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: '10px',
    border: `1.5px solid ${hasError ? '#FECACA' : '#E0E0E8'}`,
    fontSize: '14px', fontWeight: 600, color: '#111',
    outline: 'none', background: '#F7F7FA',
    marginBottom: hasError ? '6px' : '10px',
    transition: 'border-color 0.15s',
  }
}
