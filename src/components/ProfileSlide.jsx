import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Power, MapPin, Phone, Store, Users, Image,
  Loader2, AlertCircle, CheckCircle2, Check, XCircle, Mail, Clock, UserPlus,
  User, UserX, ChevronRight, Calendar,
} from 'lucide-react'
import { PiPencilCircle } from 'react-icons/pi'
import AddMembersModal from './AddMembersModal'
import RemainingDaysModal from './RemainingDaysModal'

const LIME = '#A8E63D'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Single yield to keep the UI alive without adding loop overhead.
const yieldFrame = () => new Promise(r => setTimeout(r, 0))

// Fast single-pass compression — no binary search loop.
// Pre-scales the canvas so 2–3 fixed quality values cover every case.
// Works instantly on any device including low-end phones.
function compressToLimit(dataUrl, maxKB) {
  return new Promise(resolve => {
    const img = new window.Image()
    img.onload = async () => {
      try {
        const maxBytes = maxKB * 1024
        const rawBytes = dataUrl.length * 0.75

        // Scale so the canvas is ~1.3× target — quality 0.82 almost always fits.
        const ratio = (maxBytes * 1.3) / rawBytes
        let scale = Math.min(1, Math.sqrt(ratio))
        scale = Math.max(0.03, scale)

        const w = Math.max(1, Math.round(img.naturalWidth  * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))

        // One yield before the heavy drawImage — page stays alive
        await yieldFrame()

        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)

        // Try 3 fixed quality levels — instant, no loop
        for (const q of [0.82, 0.60, 0.38]) {
          const out = canvas.toDataURL('image/jpeg', q)
          if (out.length * 0.75 <= maxBytes) return resolve(out)
        }

        // Rare fallback: halve canvas once and try again
        await yieldFrame()
        canvas.width  = Math.max(1, Math.round(w * 0.5))
        canvas.height = Math.max(1, Math.round(h * 0.5))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch (e) {
        console.error('compress error', e)
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

const MAX_GALLERY = 10

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
  asPage = false,
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

  // Logo compression popup state
  const logoPendingSrcRef = useRef(null)
  const [logoPendingPreview, setLogoPendingPreview] = useState(null)
  const [logoCompressModal, setLogoCompressModal] = useState(false)
  const [logoCompressing, setLogoCompressing] = useState(false)

  // Gallery state
  const [galleryError, setGalleryError] = useState('')
  const [galleryCompressing, setGalleryCompressing] = useState(false)
  const [gallerySuccess, setGallerySuccess] = useState(false)

  const [showAddMembers, setShowAddMembers] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [showRemainingDays, setShowRemainingDays] = useState(false)

  const subscriptionInfo = {
    planName: 'Growth',
    startDate: '22-04-2026',
    endDate: '03-05-2026',
    daysLeft: 24,
  }

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
    setGalleryError(''); setGallerySuccess(false)
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    const valid = Array.from(files).filter(f => allowed.includes(f.type))
    if (!valid.length) { setGalleryError('Only JPG, PNG, or WEBP images are supported.'); return }

    // Enforce max-10 limit
    const currentCount = carouselImages.length
    if (currentCount >= MAX_GALLERY) {
      setGalleryError(`Maximum ${MAX_GALLERY} images allowed in the gallery.`)
      return
    }
    const canAdd = MAX_GALLERY - currentCount
    const toProcess = valid.slice(0, canAdd)

    setGalleryCompressing(true)
    try {
      const results = await Promise.all(toProcess.map(async f => {
        const src = await fileToBase64(f)
        // Auto-compress anything over 200 KB; accept smaller images as-is
        if (f.size / 1024 > 200) {
          const compressed = await compressToLimit(src, 200)
          return compressed || src
        }
        return src
      }))

      // Filter out any null/failed results
      const good = results.filter(Boolean)
      if (!good.length) { setGalleryError('Failed to process images. Please try again.'); return }

      setCarouselImages(prev => {
        const updated = [...prev, ...good]
        const key = `exzibo_carousel_${restaurantId || 'default'}`
        localStorage.setItem(key, JSON.stringify(updated))
        window.dispatchEvent(new CustomEvent('exzibo-carousel-changed', { detail: { restaurantId, images: updated } }))
        return updated
      })
      setCarouselIdx(0)

      if (valid.length > canAdd) {
        setGalleryError(`Only ${canAdd} image${canAdd !== 1 ? 's' : ''} added — gallery is now full (max ${MAX_GALLERY}).`)
      } else {
        setGallerySuccess(true)
        setTimeout(() => setGallerySuccess(false), 2500)
      }
    } catch (err) {
      console.error('Gallery upload error:', err)
      setGalleryError('Failed to process images. Please try again.')
    } finally { setGalleryCompressing(false) }
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
    if (asPage) return
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
  }, [open, asPage])

  useEffect(() => { if (editingName) setTimeout(() => nameInputRef.current?.focus(), 60) }, [editingName])
  useEffect(() => { if (editingContact) setTimeout(() => phoneInputRef.current?.focus(), 60) }, [editingContact])
  useEffect(() => { if (editingLocation) setTimeout(() => addressRef.current?.focus(), 60) }, [editingLocation])

  function handleLogoUpload(file) {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { setUploadError('Only JPG, PNG, or WEBP images are allowed.'); return }
    setUploadError(''); setUploadSuccess(false)

    const sizeKB = file.size / 1024
    if (sizeKB < 60) { setUploadError('Image quality too low. Please upload a better image (min 60 KB).'); return }

    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target.result
      if (sizeKB > 200) {
        logoPendingSrcRef.current = src
        setLogoPendingPreview(src)
        setLogoCompressModal(true)
      } else {
        saveLogo(src)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleLogoCompressConfirm() {
    const src = logoPendingSrcRef.current
    if (!src) return
    setLogoCompressing(true)
    let result = null
    try {
      result = await compressToLimit(src, 200)
    } catch {}
    logoPendingSrcRef.current = null
    setLogoPendingPreview(null)
    setLogoCompressing(false)
    setLogoCompressModal(false)
    if (result) saveLogo(result)
  }

  function handleLogoCompressCancel() {
    logoPendingSrcRef.current = null
    setLogoPendingPreview(null)
    setLogoCompressModal(false)
  }

  function saveLogo(base64) {
    setUploading(true)
    try {
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
    } catch { setUploadError('Failed to save logo. Please try again.') }
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
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = '' }}
      />

      {!asPage && (
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.3s ease',
        }} />
      )}

      <div
        onClick={asPage ? undefined : e => e.stopPropagation()}
        style={asPage ? {
          background: '#EFEFF4',
          display: 'flex', flexDirection: 'column',
          flex: 1,
        } : {
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
          padding: asPage ? '16px 16px 14px' : '20px 16px 14px',
          background: '#EFEFF4',
          borderRadius: asPage ? 0 : '28px 28px 0 0',
          flexShrink: 0,
          zIndex: 2,
        }}>
          {/* Close — modal mode only */}
          {!asPage && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <button onClick={onClose} style={{
                background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: '#555',
              }}>
                <X size={16} />
              </button>
            </div>
          )}

          {/* Profile card */}
          <div style={{
            background: '#fff', borderRadius: '18px', padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: '14px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '20px', letterSpacing: '0.03em',
              flexShrink: 0, overflow: 'hidden', position: 'relative',
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
          </div>
        </div>{/* end sticky header */}

        {/* Scrollable body */}
        <div style={asPage ? { overflowY: 'auto', padding: '0 16px 48px' } : { overflowY: 'auto', flex: 1, padding: '0 16px 32px' }}>

          {/* Status banners */}
          {uploadError && <StatusMsg type="error"><AlertCircle size={14} />{uploadError}</StatusMsg>}
          {uploadSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Logo updated successfully!</StatusMsg>}
          {nameSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Restaurant name updated!</StatusMsg>}
          {contactSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Contact info updated successfully!</StatusMsg>}
          {locationSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Location updated successfully!</StatusMsg>}

          <div style={{ background: '#E9E9EF', borderRadius: '18px', padding: '8px 10px', marginBottom: '14px' }}>

            {/* PROFILE — opens consolidated modal */}
            <div
              onClick={() => setIsProfileModalOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '13px 10px', borderRadius: '12px',
                background: 'transparent', cursor: 'pointer',
                marginBottom: '2px', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={iconWrap}><User size={22} strokeWidth={1.4} /></span>
              <span style={{ ...rowLabel, flex: 1 }}>PROFILE</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

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

            {/* ADD MEMBERS */}
            <div
              onClick={() => setShowAddMembers(true)}
              style={{
                ...rowStyle,
                cursor: 'pointer',
                borderRadius: '12px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,56,13,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={iconWrap}><UserPlus size={22} strokeWidth={1.4} /></span>
              <span style={{ ...rowLabel, flex: 1 }}>ADD MEMBERS</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            {/* REMAINING DAYS */}
            <div
              onClick={() => setShowRemainingDays(true)}
              style={{
                ...rowStyle,
                cursor: 'pointer',
                borderRadius: '12px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={iconWrap}><Calendar size={22} strokeWidth={1.4} /></span>
              <span style={{ ...rowLabel, flex: 1 }}>REMAINING DAYS</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

          </div>

          <AddMembersModal
            open={showAddMembers}
            onClose={() => setShowAddMembers(false)}
            restaurantId={restaurantId}
          />

          <RemainingDaysModal
            open={showRemainingDays}
            onClose={() => setShowRemainingDays(false)}
            planName={subscriptionInfo.planName}
            startDate={subscriptionInfo.startDate}
            endDate={subscriptionInfo.endDate}
            daysLeft={subscriptionInfo.daysLeft}
            isActive={true}
          />

          {/* Image Gallery */}
          <input
            ref={carouselInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) handleCarouselFiles(e.target.files); e.target.value = '' }}
          />
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', marginBottom: '6px', paddingLeft: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Image Gallery ({carouselImages.length}/{MAX_GALLERY})</span>
              {galleryCompressing && <span style={{ fontSize: '10px', color: '#888', fontWeight: 500, letterSpacing: '0.04em' }}>Compressing…</span>}
            </div>
            {galleryError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', color: '#EF4444', fontSize: '11px', fontWeight: 600 }}>
                <AlertCircle size={12} /> {galleryError}
              </div>
            )}
            {gallerySuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', color: '#10B981', fontSize: '11px', fontWeight: 600 }}>
                <CheckCircle2 size={12} /> Images saved successfully!
              </div>
            )}

            {carouselImages.length === 0 ? (
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

      {/* Profile modal — consolidated entry to existing handlers */}
      {isProfileModalOpen && createPortal(
        <div
          onClick={() => setIsProfileModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'profileBackdropIn 0.2s ease-out',
          }}
        >
          <style>{`
            @keyframes profileBackdropIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes profileModalIn {
              from { opacity: 0; transform: scale(0.95); }
              to   { opacity: 1; transform: scale(1); }
            }
            .profile-modal-row:hover { background: rgba(0,0,0,0.035) !important; }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '20px', padding: '24px',
              maxWidth: '420px', width: '90%', maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 32px 80px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.15)',
              animation: 'profileModalIn 0.22s cubic-bezier(0.34,1.1,0.64,1)',
              position: 'relative',
              boxSizing: 'border-box',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', gap: '12px' }}>
              <div>
                <h2 style={{
                  margin: '0 0 6px',
                  fontWeight: 800, fontSize: '26px',
                  color: '#0E1B2A', letterSpacing: '-0.02em', lineHeight: 1.1,
                }}>
                  Profile
                </h2>
                <p style={{
                  margin: 0,
                  fontSize: '13.5px', lineHeight: 1.5,
                  color: '#6b7380', maxWidth: '360px',
                }}>
                  Manage your restaurant information and account settings.
                </p>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                style={{
                  background: '#F2F2F2', border: 'none', borderRadius: '50%',
                  width: '40px', height: '40px', minWidth: '40px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#444',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#E5E5E5'}
                onMouseLeave={e => e.currentTarget.style.background = '#F2F2F2'}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Rows */}
            <div>
              {[
                {
                  key: 'logo',
                  icon: <User size={24} strokeWidth={1.8} />,
                  label: 'Logo',
                  desc: 'Update your restaurant logo',
                  onClick: () => {
                    setIsProfileModalOpen(false)
                    setUploadError('')
                    fileInputRef.current?.click()
                  },
                },
                {
                  key: 'name',
                  icon: <Store size={24} strokeWidth={1.6} />,
                  label: 'Restaurant Name',
                  desc: 'Edit your restaurant name',
                  onClick: () => {
                    setIsProfileModalOpen(false)
                    setNameError('')
                    setEditingName(true)
                  },
                },
                {
                  key: 'hours',
                  icon: <Clock size={24} strokeWidth={1.6} />,
                  label: 'Opening Hours',
                  desc: 'Set your restaurant operating hours',
                  onClick: () => {
                    setIsProfileModalOpen(false)
                    openHoursModal()
                  },
                },
                {
                  key: 'location',
                  icon: <MapPin size={24} strokeWidth={1.6} />,
                  label: 'Location',
                  desc: 'Manage your restaurant address',
                  onClick: () => {
                    setIsProfileModalOpen(false)
                    setAddressError('')
                    setAddressInput(loadLocationAddress(restaurantId))
                    setEditingLocation(true)
                  },
                },
                {
                  key: 'contact',
                  icon: <Phone size={24} strokeWidth={1.6} />,
                  label: 'Contact Info',
                  desc: 'Update phone number and other contact details',
                  onClick: () => {
                    setIsProfileModalOpen(false)
                    setContactPhoneError('')
                    setContactEmailError('')
                    const { phone, email } = loadContact(restaurantId)
                    setContactPhone(phone)
                    setContactEmail(email)
                    setEditingContact(true)
                  },
                },
              ].map((row, idx, arr) => (
                <div
                  key={row.key}
                  className="profile-modal-row"
                  onClick={row.onClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '12px 8px',
                    borderBottom: idx < arr.length - 1 ? '1px solid #EFEFF2' : 'none',
                    background: 'transparent', cursor: 'pointer',
                    transition: 'background 0.15s',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{
                    width: '46px', height: '46px',
                    background: '#F2F2F4', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#222', flexShrink: 0,
                  }}>
                    {row.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '16px', fontWeight: 800,
                      color: '#0E1B2A', letterSpacing: '-0.01em',
                      marginBottom: '2px',
                    }}>
                      {row.label}
                    </div>
                    <div style={{
                      fontSize: '12.5px', color: '#7a8493', lineHeight: 1.4,
                    }}>
                      {row.desc}
                    </div>
                  </div>
                  <ChevronRight size={18} color="#bbb" strokeWidth={2.2} />
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Logo compression modal */}
      {logoCompressModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: '#fff', borderRadius: '22px', padding: '26px 24px',
            maxWidth: '340px', width: '100%',
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          }}>
            {logoPendingPreview && (
              <img src={logoPendingPreview} alt="preview" style={{
                width: '80px', height: '80px', borderRadius: '12px',
                objectFit: 'cover', display: 'block', margin: '0 auto 16px',
                border: '2px solid #F0F0F8',
              }} />
            )}
            <div style={{ fontWeight: 800, fontSize: '16px', color: '#111', textAlign: 'center', marginBottom: '6px' }}>
              Image Too Large
            </div>
            <div style={{ fontSize: '13px', color: '#666', textAlign: 'center', lineHeight: 1.5, marginBottom: '20px' }}>
              This image exceeds the 200 KB limit. Click Confirm to automatically compress it.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleLogoCompressCancel}
                disabled={logoCompressing}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px',
                  background: '#F0F0F5', border: 'none',
                  color: '#555', fontSize: '13px', fontWeight: 700,
                  cursor: logoCompressing ? 'not-allowed' : 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={handleLogoCompressConfirm}
                disabled={logoCompressing}
                style={{
                  flex: 2, padding: '12px', borderRadius: '12px',
                  background: logoCompressing ? '#94a3b8' : LIME,
                  border: 'none', color: '#111', fontSize: '13px', fontWeight: 800,
                  cursor: logoCompressing ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                {logoCompressing
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Compressing…</>
                  : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* RESTAURANT NAME modal */}
      {editingName && (
        <EditFieldModal
          title="Restaurant Name"
          icon={<Store size={22} strokeWidth={1.4} />}
          onClose={() => { setEditingName(false); setNameError(''); setNameInput(restaurantName || '') }}
        >
          <input ref={nameInputRef} value={nameInput}
            onChange={e => { setNameInput(e.target.value); setNameError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameError('') } }}
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
        </EditFieldModal>
      )}

      {/* CONTACT INFO modal */}
      {editingContact && (
        <EditFieldModal
          title="Contact Info"
          icon={<Phone size={22} strokeWidth={1.4} />}
          onClose={() => {
            setEditingContact(false); setContactPhoneError(''); setContactEmailError('')
            const { phone, email } = loadContact(restaurantId); setContactPhone(phone); setContactEmail(email)
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
        </EditFieldModal>
      )}

      {/* LOCATION modal */}
      {editingLocation && (
        <EditFieldModal
          title="Location"
          icon={<MapPin size={22} strokeWidth={1.4} />}
          onClose={() => { setEditingLocation(false); setAddressError(''); setAddressInput(loadLocationAddress(restaurantId)) }}
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
            onCancel={() => { setEditingLocation(false); setAddressError(''); setAddressInput(loadLocationAddress(restaurantId)) }}
            saving={locationSaving}
          />
        </EditFieldModal>
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

function EditFieldModal({ title, icon, onClose, children }) {
  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'profileModalOverlayIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '20px', padding: '22px',
          maxWidth: '380px', width: '100%', maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.15)',
          animation: 'profileModalIn 0.22s cubic-bezier(0.34,1.1,0.64,1)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, background: '#F0F0F5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
              {icon}
            </span>
            <div style={{ fontWeight: 800, fontSize: '17px', color: '#111', letterSpacing: '0.01em' }}>
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%',
              width: '32px', height: '32px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#555',
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
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
