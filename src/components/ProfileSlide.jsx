import React, { useEffect, useRef, useState } from 'react'
import {
  X, Share2, Power, MapPin, Phone, Store, Users, Image,
  Loader2, AlertCircle, CheckCircle2, Check, XCircle, Mail, Clock,
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

function compressImageToLimit(file, maxKB = 200) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let quality = 0.85
      let scale = 1.0
      const attempt = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.naturalWidth * scale)
          canvas.height = Math.round(img.naturalHeight * scale)
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          const sizeKB = (dataUrl.length * 0.75) / 1024
          if (sizeKB <= maxKB) { resolve(dataUrl); return }
          if (quality > 0.35) { quality = Math.max(quality - 0.1, 0.3); attempt(); return }
          if (scale > 0.35) { scale = Math.max(scale - 0.15, 0.3); quality = 0.7; attempt(); return }
          resolve(null)
        } catch (e) {
          console.error('compressImageToLimit error:', e)
          resolve(null)
        }
      }
      attempt()
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null) }
    img.src = objectUrl
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
  onTeamClick,
}) {
  const fileInputRef = useRef(null)
  const carouselInputRef = useRef(null)
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

  const [hoursModalOpen, setHoursModalOpen] = useState(false)
  const [savedHours, setSavedHours] = useState(null)
  const [tempOpenH, setTempOpenH] = useState(9)
  const [tempOpenM, setTempOpenM] = useState(0)
  const [tempOpenAmPm, setTempOpenAmPm] = useState('AM')
  const [tempCloseH, setTempCloseH] = useState(10)
  const [tempCloseM, setTempCloseM] = useState(0)
  const [tempCloseAmPm, setTempCloseAmPm] = useState('PM')

  const [carouselImages, setCarouselImages] = useState([])
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryErrors, setGalleryErrors] = useState([])
  const [descText, setDescText] = useState('')
  const [badgeText, setBadgeText] = useState('')
  const [restaurantUID, setRestaurantUID] = useState('')

  useEffect(() => { setPreviewUrl(logoUrl || '') }, [logoUrl])
  useEffect(() => { setNameInput(restaurantName || '') }, [restaurantName])

  useEffect(() => {
    if (!restaurantId || restaurantId === 'default') { setRestaurantUID('0000000001'); return }
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const r = all.find(r => r.id === restaurantId)
    setRestaurantUID(r?.uid || '')
  }, [restaurantId])

  useEffect(() => {
    const key = `exzibo_carousel_${restaurantId || 'default'}`
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]')
      setCarouselImages(Array.isArray(stored) ? stored : [])
    } catch { setCarouselImages([]) }
    setCarouselIdx(0)
    const descKey = `exzibo_carousel_desc_${restaurantId || 'default'}`
    setDescText(localStorage.getItem(descKey) || '')
    const badgeKey = `exzibo_carousel_badge_${restaurantId || 'default'}`
    setBadgeText(localStorage.getItem(badgeKey) || '')
  }, [restaurantId])

  async function handleCarouselFiles(files) {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!fileArray.length) return

    setGalleryLoading(true)
    setGalleryErrors([])

    const accepted = []
    const errors = []

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      const num = i + 1
      try {
        const sizeKB = file.size / 1024

        if (sizeKB < 50) {
          errors.push(`Image no. ${num} does not meet the size requirement (50KB–200KB) — file is too small (${sizeKB.toFixed(0)} KB).`)
          continue
        }

        let dataUrl = null

        if (sizeKB > 200) {
          const compressed = await compressImageToLimit(file, 200)
          if (!compressed) {
            errors.push(`Image no. ${num} does not meet the size requirement (50KB–200KB) — too large and could not be compressed.`)
            continue
          }
          const compressedKB = (compressed.length * 0.75) / 1024
          if (compressedKB < 50) {
            errors.push(`Image no. ${num} does not meet the size requirement (50KB–200KB) — compressed result is too small.`)
            continue
          }
          dataUrl = compressed
        } else {
          dataUrl = await fileToBase64(file)
        }

        if (dataUrl) accepted.push(dataUrl)
      } catch (err) {
        console.error(`Gallery: error processing image ${num}:`, err)
        errors.push(`Image no. ${num} could not be processed due to an unexpected error.`)
      }
    }

    if (errors.length) setGalleryErrors(errors)

    if (accepted.length) {
      setCarouselImages(prev => {
        const deduped = accepted.filter(a => !prev.includes(a))
        const updated = [...prev, ...deduped]
        try {
          const key = `exzibo_carousel_${restaurantId || 'default'}`
          localStorage.setItem(key, JSON.stringify(updated))
          window.dispatchEvent(new CustomEvent('exzibo-carousel-changed', { detail: { restaurantId, images: updated } }))
        } catch (storageErr) {
          console.error('Gallery: localStorage write failed:', storageErr)
          errors.push('Storage limit reached — some images could not be saved. Try removing older images first.')
          setGalleryErrors(e => [...e, 'Storage limit reached — some images could not be saved.'])
        }
        return updated
      })
    }

    setGalleryLoading(false)
  }

  function removeCarouselImage(idx) {
    setCarouselImages(prev => {
      const updated = prev.filter((_, i) => i !== idx)
      const key = `exzibo_carousel_${restaurantId || 'default'}`
      localStorage.setItem(key, JSON.stringify(updated))
      return updated
    })
    setCarouselIdx(0)
  }

  useEffect(() => {
    const key = `exzibo_hours_${restaurantId || 'default'}`
    const stored = JSON.parse(localStorage.getItem(key) || 'null')
    if (stored) {
      setSavedHours(stored)
    } else {
      setSavedHours(null)
    }
  }, [restaurantId])

  function openHoursModal() {
    if (savedHours) {
      setTempOpenH(savedHours.openH); setTempOpenM(savedHours.openM); setTempOpenAmPm(savedHours.openAmPm)
      setTempCloseH(savedHours.closeH); setTempCloseM(savedHours.closeM); setTempCloseAmPm(savedHours.closeAmPm)
    } else {
      setTempOpenH(9); setTempOpenM(0); setTempOpenAmPm('AM')
      setTempCloseH(10); setTempCloseM(0); setTempCloseAmPm('PM')
    }
    setHoursModalOpen(true)
  }

  function handleSaveHours() {
    const data = {
      openH: tempOpenH, openM: tempOpenM, openAmPm: tempOpenAmPm,
      closeH: tempCloseH, closeM: tempCloseM, closeAmPm: tempCloseAmPm,
    }
    const key = `exzibo_hours_${restaurantId || 'default'}`
    localStorage.setItem(key, JSON.stringify(data))
    setSavedHours(data)
    window.dispatchEvent(new CustomEvent('exzibo-hours-changed', { detail: { restaurantId, hours: data } }))
    setHoursModalOpen(false)
  }

  function formatTime(h, m, ampm) {
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`
  }

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
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
        transition: 'opacity 0.3s ease',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }} />

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          width: '380px', maxWidth: '92vw',
          maxHeight: '88vh',
          background: '#EFEFF4',
          zIndex: 1001,
          borderRadius: '28px',
          display: 'flex', flexDirection: 'column',
          overflowY: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)',
          opacity: open ? 1 : 0,
          transform: open ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.93)',
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.34,1.1,0.64,1)',
        }}
      >
        {/* Sticky header */}
        <div style={{
          padding: '20px 16px 14px',
          background: '#EFEFF4',
          borderRadius: '28px 28px 0 0',
          flexShrink: 0,
          zIndex: 2,
        }}>
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
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
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
              {restaurantUID && (
                <div style={{ fontWeight: 500, fontSize: '12px', color: '#888', marginTop: '2px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  UID: {restaurantUID}
                </div>
              )}
            </div>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#999', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <Share2 size={18} strokeWidth={1.6} />
            </button>
          </div>
        </div>{/* end sticky header */}

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 32px' }}>

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

            {/* OPENING HOURS */}
            <div
              onClick={openHoursModal}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '13px 10px', borderRadius: '12px',
                background: 'transparent', cursor: 'pointer',
                marginBottom: '2px', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={iconWrap}><Clock size={22} strokeWidth={1.4} /></span>
              <span style={{ ...rowLabel, flex: 1 }}>
                OPENING HOURS
                {savedHours && (
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 500, letterSpacing: '0.02em', color: '#10B981', textTransform: 'none', marginTop: '2px' }}>
                    {formatTime(savedHours.openH, savedHours.openM, savedHours.openAmPm)} – {formatTime(savedHours.closeH, savedHours.closeM, savedHours.closeAmPm)}
                  </span>
                )}
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

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
            <div
              onClick={onTeamClick}
              style={{
                ...rowStyle,
                cursor: onTeamClick ? 'pointer' : 'default',
                borderRadius: '12px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (onTeamClick) e.currentTarget.style.background = 'rgba(99,102,241,0.09)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={iconWrap}><Users size={22} strokeWidth={1.4} /></span>
              <span style={{ ...rowLabel, flex: 1 }}>TEAM MEMBERS</span>
              {onTeamClick && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </div>

          </div>

          {/* Image Gallery */}
          <input
            ref={carouselInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleCarouselFiles(e.target.files); e.target.value = '' }}
          />
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingLeft: '4px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999' }}>
                Image Gallery
              </div>
              {galleryLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={14} color="#6366F1" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#6366F1' }}>Processing…</span>
                </div>
              )}
            </div>

            {/* Gallery validation errors */}
            {galleryErrors.length > 0 && (
              <div style={{
                background: '#FEF2F2', border: '1.5px solid #FECACA',
                borderRadius: '12px', padding: '10px 12px',
                marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px',
              }}>
                {galleryErrors.map((err, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600, lineHeight: 1.4 }}>
                    ⚠ {err}
                  </div>
                ))}
                <button
                  onClick={() => setGalleryErrors([])}
                  style={{
                    alignSelf: 'flex-end', marginTop: '4px',
                    background: 'none', border: 'none',
                    fontSize: '10px', fontWeight: 700,
                    color: '#EF4444', cursor: 'pointer', letterSpacing: '0.05em',
                  }}
                >
                  DISMISS
                </button>
              </div>
            )}

            {/* Size hint */}
            <div style={{ fontSize: '10px', color: '#aaa', fontWeight: 500, marginBottom: '8px', paddingLeft: '2px' }}>
              Accepted image size: 50 KB – 200 KB
            </div>

            {galleryLoading ? (
              <div style={{
                background: '#E2E2E8', borderRadius: '18px', height: '130px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '8px',
              }}>
                <Loader2 size={28} color="#999" style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '11px', color: '#999', fontWeight: 500 }}>Processing images…</span>
              </div>
            ) : carouselImages.length === 0 ? (
              <div
                onClick={() => carouselInputRef.current?.click()}
                style={{
                  background: '#E2E2E8', borderRadius: '18px', height: '130px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative', gap: '6px',
                  border: '2px dashed #ccc',
                }}
              >
                <Image size={28} color="#bbb" strokeWidth={1.2} />
                <span style={{ fontSize: '11px', color: '#bbb', fontWeight: 500 }}>Tap to add photos</span>
                <button
                  onClick={e => { e.stopPropagation(); carouselInputRef.current?.click() }}
                  style={{
                    position: 'absolute', bottom: '10px', right: '10px',
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: '#fff', border: '1.5px solid #d1d1d6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: '18px', color: '#555',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)', zIndex: 2,
                  }}
                >+</button>
              </div>
            ) : (
              <div style={{
                background: '#E2E2E8', borderRadius: '18px', height: '130px',
                position: 'relative', overflow: 'hidden',
              }}>
                <img
                  src={carouselImages[carouselIdx]}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '18px', display: 'block' }}
                />
                {carouselImages.length > 1 && (
                  <>
                    <button
                      onClick={() => setCarouselIdx(i => (i - 1 + carouselImages.length) % carouselImages.length)}
                      style={{
                        position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%',
                        width: '26px', height: '26px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px',
                      }}
                    >‹</button>
                    <button
                      onClick={() => setCarouselIdx(i => (i + 1) % carouselImages.length)}
                      style={{
                        position: 'absolute', right: '42px', top: '50%', transform: 'translateY(-50%)',
                        background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%',
                        width: '26px', height: '26px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px',
                      }}
                    >›</button>
                    <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '4px' }}>
                      {carouselImages.map((_, i) => (
                        <div
                          key={i}
                          onClick={() => setCarouselIdx(i)}
                          style={{
                            width: i === carouselIdx ? '14px' : '5px', height: '5px',
                            borderRadius: '3px', cursor: 'pointer',
                            background: i === carouselIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                            transition: 'all 0.2s',
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
                <button
                  onClick={e => { e.stopPropagation(); carouselInputRef.current?.click() }}
                  style={{
                    position: 'absolute', bottom: '10px', right: '10px',
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.92)', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: '18px', color: '#555',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.15)', zIndex: 2,
                  }}
                >+</button>
                <button
                  onClick={e => { e.stopPropagation(); removeCarouselImage(carouselIdx) }}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: 'rgba(0,0,0,0.5)', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#fff', zIndex: 2,
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Description Text Carousel */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '14px', fontWeight: 900, letterSpacing: '0.05em',
              textTransform: 'uppercase', color: '#111',
              marginBottom: '10px', paddingLeft: '4px',
            }}>
              Description Text&nbsp;&nbsp;Carousel
            </div>
            <div style={{
              background: '#E9E9EF', borderRadius: '18px',
              padding: '14px 14px 16px',
              display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', fontSize: '12px', pointerEvents: 'none', zIndex: 1 }}>🔥</span>
                <input
                  type="text"
                  value={badgeText}
                  onChange={e => {
                    const val = e.target.value
                    setBadgeText(val)
                    const key = `exzibo_carousel_badge_${restaurantId || 'default'}`
                    localStorage.setItem(key, val)
                    window.dispatchEvent(new CustomEvent('exzibo-carousel-badge-changed', {
                      detail: { restaurantId, badge: val }
                    }))
                  }}
                  placeholder="ENTER BADGE TEXT…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#E8321A', border: 'none', borderRadius: '10px',
                    padding: '7px 12px 7px 30px',
                    fontSize: '11px', fontWeight: 700, color: '#fff',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    outline: 'none', caretColor: '#fff', fontFamily: 'inherit',
                  }}
                  onFocus={e => e.target.style.background = '#c42a14'}
                  onBlur={e => e.target.style.background = '#E8321A'}
                />
              </div>

              <textarea
                value={descText}
                onChange={e => {
                  setDescText(e.target.value)
                  const key = `exzibo_carousel_desc_${restaurantId || 'default'}`
                  localStorage.setItem(key, e.target.value)
                  window.dispatchEvent(new CustomEvent('exzibo-carousel-desc-changed', {
                    detail: { restaurantId, text: e.target.value }
                  }))
                }}
                placeholder="WRITE HERE"
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#fff', border: 'none', borderRadius: '12px',
                  padding: '14px 16px',
                  fontSize: '14px', fontWeight: 700, color: '#111',
                  letterSpacing: '0.02em',
                  resize: 'none', fontFamily: 'inherit',
                  outline: 'none', lineHeight: 1.6,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              />
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .drum-hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {hoursModalOpen && (
        <OpeningHoursModal
          openH={tempOpenH} openM={tempOpenM} openAmPm={tempOpenAmPm}
          closeH={tempCloseH} closeM={tempCloseM} closeAmPm={tempCloseAmPm}
          onChangeOpen={(h, m, ap) => { setTempOpenH(h); setTempOpenM(m); setTempOpenAmPm(ap) }}
          onChangeClose={(h, m, ap) => { setTempCloseH(h); setTempCloseM(m); setTempCloseAmPm(ap) }}
          onSave={handleSaveHours}
          onCancel={() => setHoursModalOpen(false)}
        />
      )}
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

const ITEM_H = 44

function DrumPicker({ items, selected, onChange }) {
  const ref = useRef(null)
  const isScrolling = useRef(false)

  const selectedIdx = items.indexOf(selected)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = selectedIdx * ITEM_H
  }, [])

  function handleScroll() {
    const el = ref.current
    if (!el) return
    clearTimeout(isScrolling.current)
    isScrolling.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(items.length - 1, idx))
      el.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' })
      onChange(items[clamped])
    }, 80)
  }

  return (
    <div style={{ position: 'relative', height: ITEM_H * 3, width: '56px', overflow: 'hidden', borderRadius: '12px' }}>
      <div style={{
        position: 'absolute', top: ITEM_H, left: 0, right: 0, height: ITEM_H,
        background: 'rgba(168,230,61,0.18)', borderRadius: '10px',
        pointerEvents: 'none', zIndex: 1,
        border: '1.5px solid rgba(168,230,61,0.45)',
      }} />
      <div
        ref={ref}
        className="drum-hide-scrollbar"
        onScroll={handleScroll}
        style={{
          height: '100%', overflowY: 'scroll', scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          paddingTop: ITEM_H, paddingBottom: ITEM_H,
          boxSizing: 'border-box',
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            onClick={() => {
              ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
              onChange(item)
            }}
            style={{
              height: ITEM_H, scrollSnapAlign: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 700, color: selected === item ? '#111' : '#bbb',
              cursor: 'pointer', transition: 'color 0.15s',
              userSelect: 'none',
            }}
          >
            {typeof item === 'number' ? String(item).padStart(2, '0') : item}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H, background: 'linear-gradient(to bottom, rgba(255,255,255,1), rgba(255,255,255,0))', pointerEvents: 'none', zIndex: 2, borderRadius: '12px 12px 0 0' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H, background: 'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0))', pointerEvents: 'none', zIndex: 2, borderRadius: '0 0 12px 12px' }} />
    </div>
  )
}

const HOURS = [1,2,3,4,5,6,7,8,9,10,11,12]
const MINUTES = [0,5,10,15,20,25,30,35,40,45,50,55]

function TimePicker({ label, h, m, ampm, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flex: 1 }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#888', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <DrumPicker items={HOURS} selected={h} onChange={val => onChange(val, m, ampm)} />
        <span style={{ fontSize: '22px', fontWeight: 800, color: '#ccc', marginBottom: '2px' }}>:</span>
        <DrumPicker
          items={MINUTES}
          selected={m}
          onChange={val => onChange(h, val, ampm)}
        />
      </div>
      <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #E0E0E8' }}>
        {['AM', 'PM'].map(ap => (
          <button
            key={ap}
            onClick={() => onChange(h, m, ap)}
            style={{
              padding: '6px 16px', border: 'none', cursor: 'pointer', fontWeight: 700,
              fontSize: '12px', letterSpacing: '0.06em', transition: 'all 0.15s',
              background: ampm === ap ? '#1a1a1a' : '#F5F5F8',
              color: ampm === ap ? '#fff' : '#999',
            }}
          >{ap}</button>
        ))}
      </div>
    </div>
  )
}

function OpeningHoursModal({ openH, openM, openAmPm, closeH, closeM, closeAmPm, onChangeOpen, onChangeClose, onSave, onCancel }) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          zIndex: 1200,
        }}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '360px', maxWidth: '92vw',
          background: '#fff', borderRadius: '28px',
          zIndex: 1201,
          boxShadow: '0 32px 80px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          animation: 'hoursModalIn 0.25s cubic-bezier(0.34,1.1,0.64,1)',
        }}
      >
        <style>{`
          @keyframes hoursModalIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
            to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Clock size={18} strokeWidth={1.8} color="#555" />
            <span style={{ fontWeight: 800, fontSize: '16px', color: '#111', letterSpacing: '0.02em' }}>Opening Hours</span>
          </div>
          <button onClick={onCancel} style={{
            background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%',
            width: '30px', height: '30px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: '#555',
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Pickers */}
        <div style={{ display: 'flex', padding: '24px 20px 20px', gap: '12px', alignItems: 'flex-start' }}>
          <TimePicker
            label="Opening Time"
            h={openH} m={openM} ampm={openAmPm}
            onChange={onChangeOpen}
          />
          <div style={{ width: '1px', background: '#EBEBF0', alignSelf: 'stretch', marginTop: '32px' }} />
          <TimePicker
            label="Closing Time"
            h={closeH} m={closeM} ampm={closeAmPm}
            onChange={onChangeClose}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', padding: '0 20px 22px' }}>
          <button onClick={onSave} style={{
            flex: 1, padding: '12px 0', borderRadius: '12px',
            background: '#1a1a1a', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          }}>
            <Check size={14} /> SAVE
          </button>
          <button onClick={onCancel} style={{
            padding: '12px 18px', borderRadius: '12px',
            background: '#F0F0F5', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#666',
          }}>
            CANCEL
          </button>
        </div>
      </div>
    </>
  )
}
