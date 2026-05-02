import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRole } from '../context/RoleContext'
import {
  X, Power, MapPin, Phone, Store, Users, Image,
  Loader2, AlertCircle, CheckCircle2, Check, XCircle, Mail, Clock, UserPlus,
  User, UserX, ChevronRight, Calendar, Star, Link2,
} from 'lucide-react'
import { PiPencilCircle } from 'react-icons/pi'
import { FaFacebook, FaInstagram, FaLinkedinIn, FaYoutube } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
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
  isMasterView = false,
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
  const { activeRole } = useRole()

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

  const [activeTab, setActiveTab] = useState('PROFILE')
  const [stats, setStats] = useState({ members: 0, todayOrders: 0, tables: 0 })

  const [googleReviewOpen, setGoogleReviewOpen] = useState(false)
  const [googleReviewInput, setGoogleReviewInput] = useState('')

  useEffect(() => {
    const key = `exzibo_google_review_${restaurantId || 'default'}`
    setGoogleReviewInput(localStorage.getItem(key) || '')
  }, [restaurantId])

  function handleGoogleReviewSave() {
    const key = `exzibo_google_review_${restaurantId || 'default'}`
    localStorage.setItem(key, googleReviewInput)
    setGoogleReviewOpen(false)
  }

  async function handleGoogleReviewPaste() {
    try {
      const text = await navigator.clipboard.readText()
      setGoogleReviewInput(text)
    } catch {}
  }

  const [facebookModalOpen, setFacebookModalOpen] = useState(false)
  const [facebookUrlInput, setFacebookUrlInput] = useState('')

  useEffect(() => {
    const key = `exzibo_social_facebook_${restaurantId || 'default'}`
    setFacebookUrlInput(localStorage.getItem(key) || '')
  }, [restaurantId])

  function handleFacebookSave() {
    const key = `exzibo_social_facebook_${restaurantId || 'default'}`
    localStorage.setItem(key, facebookUrlInput)
    setFacebookModalOpen(false)
  }

  const [instagramModalOpen, setInstagramModalOpen] = useState(false)
  const [instagramUrlInput, setInstagramUrlInput] = useState('')

  useEffect(() => {
    const key = `exzibo_social_instagram_${restaurantId || 'default'}`
    setInstagramUrlInput(localStorage.getItem(key) || '')
  }, [restaurantId])

  function handleInstagramSave() {
    const key = `exzibo_social_instagram_${restaurantId || 'default'}`
    localStorage.setItem(key, instagramUrlInput)
    setInstagramModalOpen(false)
  }

  const [linkedinModalOpen, setLinkedinModalOpen] = useState(false)
  const [linkedinUrlInput, setLinkedinUrlInput] = useState('')

  useEffect(() => {
    const key = `exzibo_social_linkedin_${restaurantId || 'default'}`
    setLinkedinUrlInput(localStorage.getItem(key) || '')
  }, [restaurantId])

  function handleLinkedinSave() {
    const key = `exzibo_social_linkedin_${restaurantId || 'default'}`
    localStorage.setItem(key, linkedinUrlInput)
    setLinkedinModalOpen(false)
  }

  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false)
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('')

  useEffect(() => {
    const key = `exzibo_social_youtube_${restaurantId || 'default'}`
    setYoutubeUrlInput(localStorage.getItem(key) || '')
  }, [restaurantId])

  function handleYoutubeSave() {
    const key = `exzibo_social_youtube_${restaurantId || 'default'}`
    localStorage.setItem(key, youtubeUrlInput)
    setYoutubeModalOpen(false)
  }

  const [twitterModalOpen, setTwitterModalOpen] = useState(false)
  const [twitterUrlInput, setTwitterUrlInput] = useState('')

  useEffect(() => {
    const key = `exzibo_social_twitter_${restaurantId || 'default'}`
    setTwitterUrlInput(localStorage.getItem(key) || '')
  }, [restaurantId])

  function handleTwitterSave() {
    const key = `exzibo_social_twitter_${restaurantId || 'default'}`
    localStorage.setItem(key, twitterUrlInput)
    setTwitterModalOpen(false)
  }

  useEffect(() => { setPreviewUrl(logoUrl || '') }, [logoUrl])
  useEffect(() => { setNameInput(restaurantName || '') }, [restaurantName])

  useEffect(() => {
    if (!restaurantId || restaurantId === 'default') { setRestaurantUID('0000000001'); return }
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const r = all.find(r => r.id === restaurantId)
    setRestaurantUID(r?.uid || '')
  }, [restaurantId])

  useEffect(() => {
    const storageBase = (!restaurantId || restaurantId === 'default') ? 'default' : restaurantId
    const managers = parseInt(localStorage.getItem(`exzibo_invite_managers_${storageBase}`) || '0', 10)
    const staff = parseInt(localStorage.getItem(`exzibo_invite_staff_${storageBase}`) || '0', 10)
    const members = managers + staff

    let uid = '0000000001'
    if (restaurantId && restaurantId !== 'default') {
      try {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        uid = all.find(r => r.id === restaurantId)?.uid || ''
      } catch {}
    }
    const tables = uid ? parseInt(localStorage.getItem(`exzibo_link_table_count_${uid}`) || '0', 10) : 0

    let todayOrders = 0
    try {
      const raw = localStorage.getItem(`exzibo_orders_${restaurantId || 'default'}`)
      if (raw) {
        const orders = JSON.parse(raw)
        const today = new Date().toDateString()
        todayOrders = Array.isArray(orders) ? orders.filter(o => {
          const d = o.timestamp || o.time || o.date || o.createdAt
          return d ? new Date(d).toDateString() === today : false
        }).length : 0
      }
    } catch {}

    setStats({ members, todayOrders, tables })
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

  if (asPage) {
    const PROFILE_BG = '#EAF1FD'
    const STAT_PILL = '#C8D9F8'
    const STAT_NUM = '#3B6BE8'
    const TAB_ACTIVE = '#3B6BE8'
    const TAB_BG = '#DDE2EC'
    const ICON_ROW_BG = '#F2F4F8'
    const settingsRows = [
      {
        icon: <Clock size={22} strokeWidth={1.5} />,
        title: 'OPENING HOURS',
        sub: 'MANAGE YOUR SCHEDULE',
        onClick: () => {
          if (hoursModalOpen) { setHoursModalOpen(false) }
          else { setEditingLocation(false); setAddressError(''); setEditingContact(false); setContactPhoneError(''); setContactEmailError(''); setGoogleReviewOpen(false); openHoursModal() }
        },
      },
      {
        icon: <MapPin size={22} strokeWidth={1.5} />,
        title: 'ADD LOCATION',
        sub: 'UPDATE YOUR ADDRESS',
        onClick: () => {
          if (editingLocation) { setEditingLocation(false); setAddressError('') }
          else { setHoursModalOpen(false); setEditingContact(false); setContactPhoneError(''); setContactEmailError(''); setGoogleReviewOpen(false); setAddressError(''); setAddressInput(loadLocationAddress(restaurantId)); setEditingLocation(true) }
        },
      },
      {
        icon: <Phone size={22} strokeWidth={1.5} />,
        title: 'EDIT CONTACT',
        sub: 'ADD YOUR CONTACT INFORMATION',
        onClick: () => {
          if (editingContact) { setEditingContact(false); setContactPhoneError(''); setContactEmailError('') }
          else { setHoursModalOpen(false); setEditingLocation(false); setAddressError(''); setGoogleReviewOpen(false); setContactPhoneError(''); setContactEmailError(''); const c = loadContact(restaurantId); setContactPhone(c.phone); setContactEmail(c.email); setEditingContact(true) }
        },
      },
      {
        icon: <Star size={22} strokeWidth={1.5} />,
        title: 'GOOGLE REVIEWS LINK',
        sub: 'GOOGLE REVIEW PROFILE',
        onClick: () => {
          if (googleReviewOpen) { setGoogleReviewOpen(false) }
          else { setHoursModalOpen(false); setEditingLocation(false); setAddressError(''); setEditingContact(false); setContactPhoneError(''); setContactEmailError(''); setGoogleReviewInput(localStorage.getItem(`exzibo_google_review_${restaurantId || 'default'}`) || ''); setGoogleReviewOpen(true) }
        },
      },
    ]
    const socialBtns = [
      { icon: <FaFacebook size={20} />, key: 'facebook' },
      { icon: <FaInstagram size={20} />, key: 'instagram' },
      { icon: <FaLinkedinIn size={20} />, key: 'linkedin' },
      { icon: <FaYoutube size={20} />, key: 'youtube' },
      { icon: <FaXTwitter size={20} />, key: 'twitter' },
    ]

    return (
      <>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = '' }}
        />

        <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', paddingBottom: '32px' }}>

          {/* Blue hero band */}
          <div style={{ background: PROFILE_BG, height: '68px', flexShrink: 0 }} />

          {/* Profile Card */}
          <div style={{ padding: '0 20px 20px', background: '#fff' }}>
            {/* Profile row — image straddles the blue/white boundary */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '22px', marginTop: '-48px', position: 'relative', zIndex: 1 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100px', height: '100px', borderRadius: '22px',
                  background: STAT_PILL, overflow: 'hidden', flexShrink: 0,
                  cursor: 'pointer', position: 'relative',
                }}
              >
                {previewUrl
                  ? <img src={previewUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : null}
                {uploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
              </div>
              {/* Name/UID anchored in the white zone */}
              <div style={{ paddingTop: '52px' }}>
                <div style={{ fontWeight: 800, fontSize: '16px', color: '#111', letterSpacing: '0.01em', lineHeight: 1.2 }}>
                  {restaurantName || 'RESTAURANT NAME'}
                </div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '4px', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                  UID: {restaurantUID || '0000000001'}
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '22px' }}>
              {[
                { value: stats.members, label: 'MEMBERS' },
                { value: stats.todayOrders, label: 'TODAYS ORDER' },
                { value: stats.tables, label: 'TABLES' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px' }}>
                  <div style={{ background: STAT_PILL, borderRadius: '24px', padding: '4px 22px', minWidth: '62px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '22px', color: '#ffffff', lineHeight: 1.3 }}>{s.value}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#888', letterSpacing: '0.07em' }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Social Links */}
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              {socialBtns.map(s => {
                const isActive =
                  (s.key === 'facebook' && facebookModalOpen) ||
                  (s.key === 'instagram' && instagramModalOpen) ||
                  (s.key === 'linkedin' && linkedinModalOpen) ||
                  (s.key === 'youtube' && youtubeModalOpen) ||
                  (s.key === 'twitter' && twitterModalOpen)
                const activeBorder =
                  s.key === 'facebook' ? '#1877F2' :
                  s.key === 'instagram' ? '#E1306C' :
                  s.key === 'linkedin' ? '#0A66C2' :
                  s.key === 'youtube' ? '#FF0000' :
                  s.key === 'twitter' ? '#000000' : 'transparent'
                const activeBg =
                  s.key === 'facebook' ? '#e8f0fe' :
                  s.key === 'instagram' ? '#fce4ec' :
                  s.key === 'linkedin' ? '#e8f0fe' :
                  s.key === 'youtube' ? '#fff0f0' :
                  s.key === 'twitter' ? '#f0f0f0' : '#fff'
                const handleClick =
                  s.key === 'facebook' ? () => { setFacebookModalOpen(o => !o); setInstagramModalOpen(false); setLinkedinModalOpen(false); setYoutubeModalOpen(false); setTwitterModalOpen(false) } :
                  s.key === 'instagram' ? () => { setInstagramModalOpen(o => !o); setFacebookModalOpen(false); setLinkedinModalOpen(false); setYoutubeModalOpen(false); setTwitterModalOpen(false) } :
                  s.key === 'linkedin' ? () => { setLinkedinModalOpen(o => !o); setFacebookModalOpen(false); setInstagramModalOpen(false); setYoutubeModalOpen(false); setTwitterModalOpen(false) } :
                  s.key === 'youtube' ? () => { setYoutubeModalOpen(o => !o); setFacebookModalOpen(false); setInstagramModalOpen(false); setLinkedinModalOpen(false); setTwitterModalOpen(false) } :
                  s.key === 'twitter' ? () => { setTwitterModalOpen(o => !o); setFacebookModalOpen(false); setInstagramModalOpen(false); setLinkedinModalOpen(false); setYoutubeModalOpen(false) } :
                  undefined
                return (
                  <button key={s.key}
                    onClick={handleClick}
                    style={{
                      width: '54px', height: '54px', borderRadius: '14px',
                      background: isActive ? activeBg : '#fff',
                      border: isActive ? `2px solid ${activeBorder}` : 'none',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#444', boxShadow: '0 2px 8px rgba(0,0,0,0.09)',
                      transition: 'transform 0.15s, box-shadow 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.14)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.09)' }}
                  >
                    {s.icon}
                  </button>
                )
              })}
            </div>

            {/* Facebook inline panel */}
            {facebookModalOpen && (
              <div style={{
                margin: '14px 0 0',
                background: '#fff',
                borderRadius: '18px',
                padding: '18px 16px 16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                animation: 'fbPanelIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}>
                <style>{`
                  @keyframes fbPanelIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '10px',
                      background: '#1877F2',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <FaFacebook size={26} color="#fff" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '17px', color: '#0f172a' }}>Facebook</span>
                  </div>
                  <button
                    onClick={handleFacebookSave}
                    style={{
                      padding: '8px 20px',
                      background: '#bbf7d0',
                      border: 'none', borderRadius: '10px',
                      color: '#166534', fontSize: '13px', fontWeight: 800,
                      letterSpacing: '0.05em', cursor: 'pointer',
                    }}
                  >
                    SAVE
                  </button>
                </div>
                {/* URL input pill */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#f1f5f9',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50px',
                  padding: '10px 16px',
                }}>
                  <Link2 size={16} color="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                    Facebook.com
                  </span>
                  <input
                    type="url"
                    value={facebookUrlInput}
                    onChange={e => setFacebookUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleFacebookSave() }}
                    placeholder="https://g.page/..."
                    autoFocus
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      fontSize: '13px', color: '#0f172a', outline: 'none',
                      fontFamily: 'inherit', minWidth: 0,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Instagram inline panel */}
            {instagramModalOpen && (
              <div style={{
                margin: '14px 0 0',
                background: '#fff',
                borderRadius: '18px',
                padding: '18px 16px 16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                animation: 'igPanelIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}>
                <style>{`
                  @keyframes igPanelIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '10px',
                      background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <FaInstagram size={26} color="#fff" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '17px', color: '#0f172a' }}>Instagram</span>
                  </div>
                  <button
                    onClick={handleInstagramSave}
                    style={{
                      padding: '8px 20px',
                      background: '#bbf7d0',
                      border: 'none', borderRadius: '10px',
                      color: '#166534', fontSize: '13px', fontWeight: 800,
                      letterSpacing: '0.05em', cursor: 'pointer',
                    }}
                  >
                    SAVE
                  </button>
                </div>
                {/* URL input pill */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#f1f5f9',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50px',
                  padding: '10px 16px',
                }}>
                  <Link2 size={16} color="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                    Instagram.com
                  </span>
                  <input
                    type="url"
                    value={instagramUrlInput}
                    onChange={e => setInstagramUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleInstagramSave() }}
                    placeholder="https://g.page/..."
                    autoFocus
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      fontSize: '13px', color: '#0f172a', outline: 'none',
                      fontFamily: 'inherit', minWidth: 0,
                    }}
                  />
                </div>
              </div>
            )}

            {/* LinkedIn inline panel */}
            {linkedinModalOpen && (
              <div style={{
                margin: '14px 0 0',
                background: '#fff',
                borderRadius: '18px',
                padding: '18px 16px 16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                animation: 'liPanelIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}>
                <style>{`
                  @keyframes liPanelIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '10px',
                      background: '#0A66C2',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <FaLinkedinIn size={26} color="#fff" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '17px', color: '#0f172a' }}>LinkedIn</span>
                  </div>
                  <button
                    onClick={handleLinkedinSave}
                    style={{
                      padding: '8px 20px',
                      background: '#bbf7d0',
                      border: 'none', borderRadius: '10px',
                      color: '#166534', fontSize: '13px', fontWeight: 800,
                      letterSpacing: '0.05em', cursor: 'pointer',
                    }}
                  >
                    SAVE
                  </button>
                </div>
                {/* URL input pill */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#f1f5f9',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50px',
                  padding: '10px 16px',
                }}>
                  <Link2 size={16} color="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                    LinkedIn.com
                  </span>
                  <input
                    type="url"
                    value={linkedinUrlInput}
                    onChange={e => setLinkedinUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLinkedinSave() }}
                    placeholder="https://linkedin.com/in/..."
                    autoFocus
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      fontSize: '13px', color: '#0f172a', outline: 'none',
                      fontFamily: 'inherit', minWidth: 0,
                    }}
                  />
                </div>
              </div>
            )}

            {/* YouTube inline panel */}
            {youtubeModalOpen && (
              <div style={{
                margin: '14px 0 0',
                background: '#fff',
                borderRadius: '18px',
                padding: '18px 16px 16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                animation: 'ytPanelIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}>
                <style>{`
                  @keyframes ytPanelIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '10px',
                      background: '#FF0000',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <FaYoutube size={26} color="#fff" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '17px', color: '#0f172a' }}>YouTube</span>
                  </div>
                  <button
                    onClick={handleYoutubeSave}
                    style={{
                      padding: '8px 20px',
                      background: '#bbf7d0',
                      border: 'none', borderRadius: '10px',
                      color: '#166534', fontSize: '13px', fontWeight: 800,
                      letterSpacing: '0.05em', cursor: 'pointer',
                    }}
                  >
                    SAVE
                  </button>
                </div>
                {/* URL input pill */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#f1f5f9',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50px',
                  padding: '10px 16px',
                }}>
                  <Link2 size={16} color="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                    YouTube.com
                  </span>
                  <input
                    type="url"
                    value={youtubeUrlInput}
                    onChange={e => setYoutubeUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleYoutubeSave() }}
                    placeholder="https://youtube.com/@..."
                    autoFocus
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      fontSize: '13px', color: '#0f172a', outline: 'none',
                      fontFamily: 'inherit', minWidth: 0,
                    }}
                  />
                </div>
              </div>
            )}

            {/* X (Twitter) inline panel */}
            {twitterModalOpen && (
              <div style={{
                margin: '14px 0 0',
                background: '#fff',
                borderRadius: '18px',
                padding: '18px 16px 16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                animation: 'xPanelIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}>
                <style>{`
                  @keyframes xPanelIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '10px',
                      background: '#000000',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <FaXTwitter size={24} color="#fff" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '17px', color: '#0f172a' }}>X</span>
                  </div>
                  <button
                    onClick={handleTwitterSave}
                    style={{
                      padding: '8px 20px',
                      background: '#bbf7d0',
                      border: 'none', borderRadius: '10px',
                      color: '#166534', fontSize: '13px', fontWeight: 800,
                      letterSpacing: '0.05em', cursor: 'pointer',
                    }}
                  >
                    SAVE
                  </button>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: '#f1f5f9',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50px',
                  padding: '10px 16px',
                }}>
                  <Link2 size={16} color="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                    X.com
                  </span>
                  <input
                    type="url"
                    value={twitterUrlInput}
                    onChange={e => setTwitterUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleTwitterSave() }}
                    placeholder="https://x.com/..."
                    autoFocus
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      fontSize: '13px', color: '#0f172a', outline: 'none',
                      fontFamily: 'inherit', minWidth: 0,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', background: TAB_BG, borderRadius: '14px', margin: '0 16px 16px', padding: '4px' }}>
            {['PROFILE', 'TEAM', 'REMAINING DAY'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, padding: '9px 4px', borderRadius: '10px', border: 'none',
                background: activeTab === tab ? TAB_ACTIVE : 'transparent',
                color: activeTab === tab ? '#fff' : '#666',
                fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em',
                cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
              }}>
                {tab}
              </button>
            ))}
          </div>

          {/* PROFILE Tab */}
          {activeTab === 'PROFILE' && (
            <div style={{ background: '#fff', borderRadius: '16px', margin: '0 16px', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
              {settingsRows.map((row, idx, arr) => (
                <React.Fragment key={row.title}>
                  <div
                    onClick={row.onClick}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '15px 18px', cursor: 'pointer', background: row.title === 'OPENING HOURS' && hoursModalOpen ? 'rgba(0,0,0,0.03)' : 'transparent', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = row.title === 'OPENING HOURS' && hoursModalOpen ? 'rgba(0,0,0,0.03)' : 'transparent'}
                  >
                    <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: ICON_ROW_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', flexShrink: 0 }}>
                      {row.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#111', letterSpacing: '0.04em' }}>{row.title}</div>
                      <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', letterSpacing: '0.03em' }}>{row.sub}</div>
                    </div>
                    <ChevronRight size={16} color={row.title === 'OPENING HOURS' && hoursModalOpen ? '#3B6BE8' : '#C7C7CC'} strokeWidth={2.5} style={{ transform: row.title === 'OPENING HOURS' && hoursModalOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                  {row.title === 'OPENING HOURS' && hoursModalOpen && (
                    <div style={{ background: '#f8fafc', borderTop: '1px solid #F0F0F5', padding: '20px 18px', animation: 'hoursInlineIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                      <style>{`
                        @keyframes hoursInlineIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
                        @keyframes locInlineIn  { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
                      `}</style>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <TimePicker label="Opening Time" h={tempOpenH} m={tempOpenM} ampm={tempOpenAmPm} onChange={(h, m, ap) => { setTempOpenH(h); setTempOpenM(m); setTempOpenAmPm(ap) }} />
                        <div style={{ width: '1px', background: '#EBEBF0', alignSelf: 'stretch', marginTop: '32px' }} />
                        <TimePicker label="Closing Time" h={tempCloseH} m={tempCloseM} ampm={tempCloseAmPm} onChange={(h, m, ap) => { setTempCloseH(h); setTempCloseM(m); setTempCloseAmPm(ap) }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleSaveHours} style={{ flex: 1, padding: '12px 0', borderRadius: '12px', background: '#1a1a1a', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                          <Check size={14} /> SAVE
                        </button>
                        <button onClick={() => setHoursModalOpen(false)} style={{ padding: '12px 18px', borderRadius: '12px', background: '#F0F0F5', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#666' }}>
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}
                  {row.title === 'ADD LOCATION' && editingLocation && (
                    <div style={{ background: '#f8fafc', borderTop: '1px solid #F0F0F5', padding: '20px 18px', animation: 'locInlineIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                      {savedAddress && (
                        <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: '10px', padding: '8px 12px', marginBottom: '12px', display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                          <MapPin size={13} color="#10B981" style={{ marginTop: '2px', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: '#065F46', fontWeight: 600, lineHeight: 1.5 }}>{savedAddress}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                        <MapPin size={11} color="#999" />
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Restaurant Address</span>
                      </div>
                      <textarea
                        ref={addressRef}
                        value={addressInput}
                        onChange={e => { setAddressInput(e.target.value); setAddressError('') }}
                        placeholder="Enter your full restaurant address…"
                        rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: `1.5px solid ${addressError ? '#FECACA' : '#E0E0E8'}`, fontSize: '13px', fontWeight: 500, color: '#111', outline: 'none', background: '#F7F7FA', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, transition: 'border-color 0.15s', marginBottom: addressError ? '6px' : '10px' }}
                        onFocus={e => e.target.style.borderColor = addressError ? '#FECACA' : LIME}
                        onBlur={e => e.target.style.borderColor = addressError ? '#FECACA' : '#E0E0E8'}
                      />
                      {addressError && <div style={{ fontSize: '12px', color: '#EF4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}><AlertCircle size={12} />{addressError}</div>}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleSaveLocation} disabled={locationSaving} style={{ flex: 1, padding: '12px 0', borderRadius: '12px', background: LIME, border: 'none', cursor: locationSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                          {locationSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} SAVE
                        </button>
                        <button onClick={() => { setEditingLocation(false); setAddressError(''); setAddressInput(loadLocationAddress(restaurantId)) }} style={{ padding: '12px 18px', borderRadius: '12px', background: '#F0F0F5', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#666' }}>
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}
                  {row.title === 'EDIT CONTACT' && editingContact && (
                    <div style={{ background: '#f8fafc', borderTop: '1px solid #F0F0F5', padding: '20px 18px', animation: 'locInlineIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                        <Phone size={11} color="#999" />
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Contact Number</span>
                      </div>
                      <input
                        ref={phoneInputRef}
                        type="tel" inputMode="numeric"
                        value={contactPhone}
                        onChange={e => handlePhoneInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingContact(false) }}
                        placeholder="10-digit number"
                        maxLength={10}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: `1.5px solid ${contactPhoneError ? '#FECACA' : '#E0E0E8'}`, fontSize: '13px', fontWeight: 500, color: '#111', outline: 'none', background: '#F7F7FA', fontFamily: 'inherit', transition: 'border-color 0.15s', marginBottom: contactPhoneError ? '6px' : '10px' }}
                        onFocus={e => e.target.style.borderColor = contactPhoneError ? '#FECACA' : LIME}
                        onBlur={e => e.target.style.borderColor = contactPhoneError ? '#FECACA' : '#E0E0E8'}
                      />
                      {contactPhoneError && <div style={{ fontSize: '12px', color: '#EF4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}><AlertCircle size={12} />{contactPhoneError}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                        <Mail size={11} color="#999" />
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#999', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Email Address</span>
                      </div>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={e => { setContactEmail(e.target.value); setContactEmailError('') }}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingContact(false) }}
                        placeholder="example@gmail.com"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', border: `1.5px solid ${contactEmailError ? '#FECACA' : '#E0E0E8'}`, fontSize: '13px', fontWeight: 500, color: '#111', outline: 'none', background: '#F7F7FA', fontFamily: 'inherit', transition: 'border-color 0.15s', marginBottom: contactEmailError ? '6px' : '10px' }}
                        onFocus={e => e.target.style.borderColor = contactEmailError ? '#FECACA' : LIME}
                        onBlur={e => e.target.style.borderColor = contactEmailError ? '#FECACA' : '#E0E0E8'}
                      />
                      {contactEmailError && <div style={{ fontSize: '12px', color: '#EF4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}><AlertCircle size={12} />{contactEmailError}</div>}
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleSaveContact} disabled={contactSaving} style={{ flex: 1, padding: '12px 0', borderRadius: '12px', background: LIME, border: 'none', cursor: contactSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                          {contactSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} SAVE
                        </button>
                        <button onClick={() => { setEditingContact(false); setContactPhoneError(''); setContactEmailError(''); const { phone, email } = loadContact(restaurantId); setContactPhone(phone); setContactEmail(email) }} style={{ padding: '12px 18px', borderRadius: '12px', background: '#F0F0F5', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', letterSpacing: '0.06em', color: '#666' }}>
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}
                  {row.title === 'GOOGLE REVIEWS LINK' && googleReviewOpen && (
                    <div style={{ background: '#f8fafc', borderTop: '1px solid #F0F0F5', padding: '18px 18px 16px', animation: 'locInlineIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fff', border: '1.5px solid #E0E0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>Google Review</span>
                        </div>
                        <button
                          onClick={handleGoogleReviewSave}
                          style={{ padding: '8px 18px', background: '#16a34a', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 400, letterSpacing: '0.05em', cursor: 'pointer' }}
                        >
                          SAVE
                        </button>
                      </div>
                      {/* URL input pill */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: '50px', padding: '10px 16px', marginBottom: '12px' }}>
                        <Link2 size={16} color="#94a3b8" strokeWidth={2} style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>Google Link</span>
                        <input
                          type="url"
                          value={googleReviewInput}
                          onChange={e => setGoogleReviewInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleGoogleReviewSave(); if (e.key === 'Escape') setGoogleReviewOpen(false) }}
                          placeholder="https://g.page/..."
                          autoFocus
                          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', color: '#0f172a', outline: 'none', fontFamily: 'inherit', minWidth: 0 }}
                        />
                      </div>
                    </div>
                  )}
                  {idx < arr.length - 1 && <div style={{ height: '1px', background: '#F0F0F5', marginLeft: '76px' }} />}
                </React.Fragment>
              ))}
            </div>
          )}


          {/* REMAINING DAY Tab */}
          {activeTab === 'REMAINING DAY' && (
            <div style={{ background: '#fff', borderRadius: '16px', margin: '0 16px', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
              <div
                onClick={() => setShowRemainingDays(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '15px 18px', cursor: 'pointer', background: 'transparent', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: ICON_ROW_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', flexShrink: 0 }}>
                  <Calendar size={22} strokeWidth={1.5} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#111', letterSpacing: '0.04em' }}>SUBSCRIPTION STATUS</div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', letterSpacing: '0.03em' }}>VIEW REMAINING DAYS</div>
                </div>
                <ChevronRight size={16} color="#C7C7CC" strokeWidth={2.5} />
              </div>
            </div>
          )}
        </div>

        {/* Status toasts */}
        {(uploadError || uploadSuccess || nameSuccess || contactSuccess || locationSuccess) && (
          <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 3000, width: 'min(360px, 90vw)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {uploadError && <StatusMsg type="error"><AlertCircle size={14} />{uploadError}</StatusMsg>}
            {uploadSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Logo updated successfully!</StatusMsg>}
            {nameSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Name updated!</StatusMsg>}
            {contactSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Contact info updated!</StatusMsg>}
            {locationSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Location updated!</StatusMsg>}
          </div>
        )}

        <AddMembersModal open={showAddMembers} onClose={() => setShowAddMembers(false)} restaurantId={restaurantId} />
        <RemainingDaysModal
          open={showRemainingDays} onClose={() => setShowRemainingDays(false)}
          planName={subscriptionInfo.planName} startDate={subscriptionInfo.startDate}
          endDate={subscriptionInfo.endDate} daysLeft={subscriptionInfo.daysLeft} isActive={true}
        />

        {logoCompressModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '22px', padding: '26px 24px', maxWidth: '340px', width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
              {logoPendingPreview && <img src={logoPendingPreview} alt="preview" style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', display: 'block', margin: '0 auto 16px', border: '2px solid #F0F0F8' }} />}
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#111', textAlign: 'center', marginBottom: '6px' }}>Image Too Large</div>
              <div style={{ fontSize: '13px', color: '#666', textAlign: 'center', lineHeight: 1.5, marginBottom: '20px' }}>This image exceeds the 200 KB limit. Click Confirm to automatically compress it.</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleLogoCompressCancel} disabled={logoCompressing} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#F0F0F5', border: 'none', color: '#555', fontSize: '13px', fontWeight: 700, cursor: logoCompressing ? 'not-allowed' : 'pointer' }}>Cancel</button>
                <button onClick={handleLogoCompressConfirm} disabled={logoCompressing} style={{ flex: 2, padding: '12px', borderRadius: '12px', background: logoCompressing ? '#94a3b8' : LIME, border: 'none', color: '#111', fontSize: '13px', fontWeight: 800, cursor: logoCompressing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {logoCompressing ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Compressing…</> : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingName && (
          <EditFieldModal title="Restaurant Name" icon={<Store size={22} strokeWidth={1.4} />} onClose={() => { setEditingName(false); setNameError(''); setNameInput(restaurantName || '') }}>
            <input ref={nameInputRef} value={nameInput} onChange={e => { setNameInput(e.target.value); setNameError('') }} onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameError('') } }} placeholder="Enter restaurant name…" style={inputStyle(nameError)} onFocus={e => e.target.style.borderColor = LIME} onBlur={e => e.target.style.borderColor = nameError ? '#FECACA' : '#E0E0E8'} />
            {nameError && <InlineError>{nameError}</InlineError>}
            <ActionButtons onSave={handleSaveName} onCancel={() => { setEditingName(false); setNameError(''); setNameInput(restaurantName || '') }} saving={nameSaving} />
          </EditFieldModal>
        )}



        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </>
    )
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
          background: 'transparent',
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
        {/* Sticky header — modal mode only; asPage uses ProfilePage's own header */}
        {!asPage && (
          <div style={{
            padding: '20px 16px 14px',
            background: '#EFEFF4',
            borderRadius: '28px 28px 0 0',
            flexShrink: 0,
            zIndex: 2,
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <button onClick={onClose} style={{
                background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: '#555',
              }}>
                <X size={16} />
              </button>
            </div>

            {/* Profile card — modal mode */}
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
          </div>
        )}

        {/* Scrollable body */}
        <div style={asPage ? { padding: '16px 16px 48px' } : { overflowY: 'auto', flex: 1, padding: '0 16px 32px' }}>

          {/* asPage: Avatar card at top of scrollable area */}
          {asPage && (
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: '14px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              marginBottom: '24px',
            }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '60px', height: '60px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: '22px', letterSpacing: '0.03em',
                  flexShrink: 0, overflow: 'hidden', position: 'relative', cursor: 'pointer',
                }}
              >
                {previewUrl
                  ? <img src={previewUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (restaurantName ? restaurantName.slice(0, 2).toUpperCase() : 'EA')}
                {uploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={20} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '18px', color: '#111', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {restaurantName || 'Exzibo Admin'}
                </div>
                {restaurantUID && (
                  <div style={{ fontWeight: 400, fontSize: '13px', color: '#8E8E93', marginTop: '3px', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                    UID: {restaurantUID}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status banners */}
          {uploadError && <StatusMsg type="error"><AlertCircle size={14} />{uploadError}</StatusMsg>}
          {uploadSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Logo updated successfully!</StatusMsg>}
          {nameSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Restaurant name updated!</StatusMsg>}
          {contactSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Contact info updated successfully!</StatusMsg>}
          {locationSuccess && <StatusMsg type="success"><CheckCircle2 size={14} />Location updated successfully!</StatusMsg>}

          <div style={{
            background: '#fff',
            borderRadius: asPage ? '16px' : '18px',
            padding: asPage ? '0' : '8px 10px',
            marginBottom: '14px',
            overflow: 'hidden',
            boxShadow: asPage ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
          }}>

            {/* PROFILE — opens consolidated modal */}
            <div
              onClick={() => setIsProfileModalOpen(true)}
              style={{
                ...rowStyle,
                transition: 'background 0.15s',
                borderRadius: asPage ? 0 : '12px',
                padding: asPage ? '0 16px' : '13px 10px',
                minHeight: asPage ? '56px' : 'unset',
                marginBottom: asPage ? 0 : '2px',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={iconWrap}><User size={20} strokeWidth={1.5} /></span>
              <span style={{ ...rowLabel, flex: 1 }}>PROFILE</span>
              <ChevronRight size={16} color="#C7C7CC" strokeWidth={2.5} />
            </div>

            {/* Divider */}
            {asPage && <div style={{ height: '1px', background: '#E5E5EA', marginLeft: '52px' }} />}

            {isMasterView && (
              <>
                {/* ADD MEMBERS */}
                <div
                  onClick={() => setShowAddMembers(true)}
                  style={{
                    ...rowStyle,
                    cursor: 'pointer',
                    borderRadius: asPage ? 0 : '12px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={iconWrap}><UserPlus size={20} strokeWidth={1.5} /></span>
                  <span style={{ ...rowLabel, flex: 1 }}>ADD MEMBERS</span>
                  <ChevronRight size={16} color="#C7C7CC" strokeWidth={2.5} />
                </div>

                {/* Divider */}
                {asPage && <div style={{ height: '1px', background: '#E5E5EA', marginLeft: '52px' }} />}
              </>
            )}

            {/* REMAINING DAYS */}
            <div
              onClick={() => setShowRemainingDays(true)}
              style={{
                ...rowStyle,
                cursor: 'pointer',
                borderRadius: asPage ? 0 : '12px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={iconWrap}><Calendar size={20} strokeWidth={1.5} /></span>
              <span style={{ ...rowLabel, flex: 1 }}>REMAINING DAYS</span>
              <ChevronRight size={16} color="#C7C7CC" strokeWidth={2.5} />
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

          {/* Logout */}
          <div style={{
            background: '#fff',
            borderRadius: asPage ? '16px' : '18px',
            padding: asPage ? '0' : '4px 10px',
            boxShadow: asPage ? '0 1px 4px rgba(0,0,0,0.06)' : '0 1px 6px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: asPage ? '0 16px' : '14px 10px',
              minHeight: asPage ? '56px' : 'auto',
              width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              <Power size={20} strokeWidth={1.4} color="#FF3B30" />
              <span style={{ fontWeight: 600, fontSize: asPage ? '15px' : '15px', color: asPage ? '#FF3B30' : '#222', letterSpacing: '0.01em' }}>Logout</span>
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
              background: '#fff', borderRadius: '20px', padding: '20px',
              width: 'min(360px, min(90vw, 86vh))',
              aspectRatio: '1 / 1',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 32px 80px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.15)',
              animation: 'profileModalIn 0.22s cubic-bezier(0.34,1.1,0.64,1)',
              position: 'relative',
              boxSizing: 'border-box',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', gap: '10px' }}>
              <div>
                <h2 style={{
                  margin: '0 0 3px',
                  fontWeight: 800, fontSize: '20px',
                  color: '#0E1B2A', letterSpacing: '-0.02em', lineHeight: 1.1,
                }}>
                  Profile
                </h2>
                <p style={{
                  margin: 0,
                  fontSize: '11.5px', lineHeight: 1.4,
                  color: '#6b7380', maxWidth: '260px',
                }}>
                  Manage your restaurant information and account settings.
                </p>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                style={{
                  background: '#F2F2F2', border: 'none', borderRadius: '50%',
                  width: '32px', height: '32px', minWidth: '32px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#444',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#E5E5E5'}
                onMouseLeave={e => e.currentTarget.style.background = '#F2F2F2'}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
              {[
                {
                  key: 'logo',
                  icon: <User size={20} strokeWidth={1.8} />,
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
                  icon: <Store size={20} strokeWidth={1.6} />,
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
                  icon: <Clock size={20} strokeWidth={1.6} />,
                  label: 'Opening Hours',
                  desc: 'Set your restaurant operating hours',
                  onClick: () => {
                    setIsProfileModalOpen(false)
                    openHoursModal()
                  },
                },
                {
                  key: 'location',
                  icon: <MapPin size={20} strokeWidth={1.6} />,
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
                  icon: <Phone size={20} strokeWidth={1.6} />,
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
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '7px 4px',
                    borderBottom: idx < arr.length - 1 ? '1px solid #EFEFF2' : 'none',
                    background: 'transparent', cursor: 'pointer',
                    transition: 'background 0.15s',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{
                    width: '36px', height: '36px',
                    background: '#F2F2F4', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#222', flexShrink: 0,
                  }}>
                    {row.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 800,
                      color: '#0E1B2A', letterSpacing: '-0.01em',
                      marginBottom: '1px',
                    }}>
                      {row.label}
                    </div>
                    <div style={{
                      fontSize: '11px', color: '#7a8493', lineHeight: 1.3,
                    }}>
                      {row.desc}
                    </div>
                  </div>
                  <ChevronRight size={14} color="#bbb" strokeWidth={2.2} />
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

      {/* LOCATION modal */}

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
  padding: '0 16px', minHeight: '56px', borderRadius: '0',
  background: 'transparent', cursor: 'pointer',
}

const iconWrap = { color: '#555', display: 'flex', alignItems: 'center', width: '22px', flexShrink: 0 }
const rowLabel = { fontWeight: 700, fontSize: '14px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#111' }

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
