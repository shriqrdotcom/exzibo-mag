import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import { LogIn, ShieldCheck, X, ArrowRight, AlertCircle, Image as ImageIcon, CheckCircle2 } from 'lucide-react'

const MAX_GALLERY = 10

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const yieldFrame = () => new Promise(r => setTimeout(r, 0))

function compressToLimit(dataUrl, maxKB) {
  return new Promise(resolve => {
    const img = new window.Image()
    img.onload = async () => {
      try {
        const maxBytes = maxKB * 1024
        const rawBytes = dataUrl.length * 0.75
        const ratio = (maxBytes * 1.3) / rawBytes
        let scale = Math.min(1, Math.sqrt(ratio))
        scale = Math.max(0.03, scale)
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        await yieldFrame()
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        for (const q of [0.82, 0.60, 0.38]) {
          const out = canvas.toDataURL('image/jpeg', q)
          if (out.length * 0.75 <= maxBytes) return resolve(out)
        }
        await yieldFrame()
        canvas.width = Math.max(1, Math.round(w * 0.5))
        canvas.height = Math.max(1, Math.round(h * 0.5))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch (e) { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

const LAST_UID_KEY = 'exzibo_master_last_uid'
const SUPER_ADMIN_KEY = 'exzibo_is_super_admin'
const DEFAULT_SUPER_ADMIN_UID = '0000000001'

function isSuperAdmin() {
  const stored = localStorage.getItem(SUPER_ADMIN_KEY)
  if (stored === null) {
    localStorage.setItem(SUPER_ADMIN_KEY, 'true')
    return true
  }
  return stored === 'true'
}

function resolveAdminTargetByUID(uid) {
  const trimmed = String(uid || '').trim()
  if (!trimmed) return null
  if (trimmed === DEFAULT_SUPER_ADMIN_UID) {
    return { id: 'default' }
  }
  const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
  const found = all.find(r => String(r.uid) === trimmed)
  return found ? { id: String(found.id) } : null
}

export default function MasterControl() {
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [uid, setUid] = useState('')
  const [error, setError] = useState('')
  const [inlineUid, setInlineUid] = useState('')
  const [inlineError, setInlineError] = useState('')

  const carouselInputRef = useRef(null)
  const [carouselImages, setCarouselImages] = useState([])
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [galleryError, setGalleryError] = useState('')
  const [galleryCompressing, setGalleryCompressing] = useState(false)
  const [gallerySuccess, setGallerySuccess] = useState(false)
  const [descText, setDescText] = useState('')
  const [badgeText, setBadgeText] = useState('')

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('exzibo_carousel_default') || '[]')
      setCarouselImages(Array.isArray(stored) ? stored : [])
    } catch { setCarouselImages([]) }
    setDescText(localStorage.getItem('exzibo_carousel_desc_default') || '')
    setBadgeText(localStorage.getItem('exzibo_carousel_badge_default') || '')
  }, [])

  async function handleCarouselFiles(files) {
    setGalleryError(''); setGallerySuccess(false)
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    const valid = Array.from(files).filter(f => allowed.includes(f.type))
    if (!valid.length) { setGalleryError('Only JPG, PNG, or WEBP images are supported.'); return }
    const currentCount = carouselImages.length
    if (currentCount >= MAX_GALLERY) { setGalleryError(`Maximum ${MAX_GALLERY} images allowed.`); return }
    const canAdd = MAX_GALLERY - currentCount
    const toProcess = valid.slice(0, canAdd)
    setGalleryCompressing(true)
    try {
      const results = await Promise.all(toProcess.map(async f => {
        const src = await fileToBase64(f)
        if (f.size / 1024 > 200) { const compressed = await compressToLimit(src, 200); return compressed || src }
        return src
      }))
      const good = results.filter(Boolean)
      if (!good.length) { setGalleryError('Failed to process images.'); return }
      setCarouselImages(prev => {
        const updated = [...prev, ...good]
        localStorage.setItem('exzibo_carousel_default', JSON.stringify(updated))
        window.dispatchEvent(new CustomEvent('exzibo-carousel-changed', { detail: { restaurantId: 'default', images: updated } }))
        return updated
      })
      setCarouselIdx(0)
      if (valid.length > canAdd) {
        setGalleryError(`Only ${canAdd} image${canAdd !== 1 ? 's' : ''} added — gallery is full.`)
      } else { setGallerySuccess(true); setTimeout(() => setGallerySuccess(false), 2500) }
    } catch { setGalleryError('Failed to process images.') }
    finally { setGalleryCompressing(false) }
  }

  function removeCarouselImage(idx) {
    setCarouselImages(prev => {
      const updated = prev.filter((_, i) => i !== idx)
      localStorage.setItem('exzibo_carousel_default', JSON.stringify(updated))
      return updated
    })
    setCarouselIdx(0)
  }

  useEffect(() => {
    const ok = isSuperAdmin()
    setAllowed(ok)
    if (!ok) {
      setTimeout(() => navigate('/dashboard'), 1500)
      return
    }
    const last = localStorage.getItem(LAST_UID_KEY) || ''
    setUid(last)
    setInlineUid(last)
  }, [navigate])

  function accessPanel(value, setErr) {
    const trimmed = String(value || '').trim()
    if (!trimmed) {
      setErr('Please enter a Restaurant UID')
      return
    }
    const target = resolveAdminTargetByUID(trimmed)
    if (!target) {
      setErr('Invalid UID')
      return
    }
    localStorage.setItem(LAST_UID_KEY, trimmed)
    navigate(`/admin/${target.id}?from=master`)
  }

  if (!allowed) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '14px' }}>
          Access denied. Redirecting…
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="Master Control" showSearch={false} />

        <main style={{ flex: 1, overflowY: 'auto', padding: '32px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '24px', right: '32px' }}>
            <button
              onClick={() => { setError(''); setShowModal(true) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                background: '#E8321A',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 0 20px rgba(232,50,26,0.25)',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 30px rgba(232,50,26,0.5)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(232,50,26,0.25)'}
            >
              <LogIn size={15} />
              Login
            </button>
          </div>

          <input ref={carouselInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) handleCarouselFiles(e.target.files); e.target.value = '' }} />

          <div style={{ maxWidth: '640px', margin: '60px auto 0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '16px',
            }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'rgba(232,50,26,0.12)',
                border: '1px solid rgba(232,50,26,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ShieldCheck size={26} color="#E8321A" />
              </div>
              <div>
                <h1 style={{
                  margin: 0,
                  fontSize: '32px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#fff',
                }}>
                  Master Control
                </h1>
                <p style={{ margin: '4px 0 0', color: '#777', fontSize: '13px' }}>
                  Universal restaurant admin loader
                </p>
              </div>
            </div>

            <div style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '32px',
              marginTop: '32px',
            }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: '#888',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}>
                Enter Restaurant UID
              </label>
              <div style={{
                display: 'flex',
                gap: '10px',
              }}>
                <input
                  value={inlineUid}
                  onChange={e => { setInlineUid(e.target.value); setInlineError('') }}
                  onKeyDown={e => e.key === 'Enter' && accessPanel(inlineUid, setInlineError)}
                  placeholder="e.g. 0000000001 or 8472019465"
                  style={{
                    flex: 1,
                    background: '#0A0A0A',
                    border: `1px solid ${inlineError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '12px',
                    padding: '14px 16px',
                    color: '#fff',
                    fontSize: '15px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                />
                <button
                  onClick={() => accessPanel(inlineUid, setInlineError)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#E8321A',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#fff',
                    padding: '14px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 25px rgba(232,50,26,0.45)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  Access Panel
                  <ArrowRight size={14} />
                </button>
              </div>
              {inlineError && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '12px',
                  color: '#EF4444',
                  fontSize: '13px',
                }}>
                  <AlertCircle size={14} />
                  {inlineError}
                </div>
              )}
              <p style={{ margin: '20px 0 0', color: '#555', fontSize: '12px', lineHeight: 1.6 }}>
                Paste a restaurant's UID to instantly load its admin panel. Only Super Admins can use this entry point.
              </p>
            </div>
          </div>

          {/* Gallery & Carousel sections */}
          <div style={{ maxWidth: '640px', margin: '32px auto 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Image Gallery */}
            <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Image Gallery ({carouselImages.length}/{MAX_GALLERY})</span>
                {galleryCompressing && <span style={{ fontSize: '10px', color: '#888', fontWeight: 500 }}>Compressing…</span>}
              </div>
              {galleryError && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '7px 10px', marginBottom: '8px', color: '#EF4444', fontSize: '11px', fontWeight: 600 }}><AlertCircle size={12} /> {galleryError}</div>}
              {gallerySuccess && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '7px 10px', marginBottom: '8px', color: '#10B981', fontSize: '11px', fontWeight: 600 }}><CheckCircle2 size={12} /> Images saved!</div>}
              {carouselImages.length === 0 ? (
                <div onClick={() => carouselInputRef.current?.click()} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '14px', height: '130px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', gap: '6px', border: '2px dashed rgba(255,255,255,0.1)' }}>
                  <ImageIcon size={28} color="#444" strokeWidth={1.2} />
                  <span style={{ fontSize: '11px', color: '#555', fontWeight: 500 }}>Tap to add photos</span>
                  <button onClick={e => { e.stopPropagation(); carouselInputRef.current?.click() }} style={{ position: 'absolute', bottom: '10px', right: '10px', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '18px', color: '#888', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', zIndex: 2 }}>+</button>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '14px', height: '130px', position: 'relative', overflow: 'hidden' }}>
                  <img src={carouselImages[carouselIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '14px', display: 'block' }} />
                  {carouselImages.length > 1 && (
                    <>
                      <button onClick={() => setCarouselIdx(i => (i - 1 + carouselImages.length) % carouselImages.length)} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>‹</button>
                      <button onClick={() => setCarouselIdx(i => (i + 1) % carouselImages.length)} style={{ position: 'absolute', right: '42px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>›</button>
                    </>
                  )}
                  <button onClick={e => { e.stopPropagation(); carouselInputRef.current?.click() }} style={{ position: 'absolute', bottom: '10px', right: '10px', width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(255,255,255,0.9)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '18px', color: '#555', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', zIndex: 2 }}>+</button>
                  <button onClick={e => { e.stopPropagation(); removeCarouselImage(carouselIdx) }} style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', zIndex: 2 }}><X size={12} /></button>
                </div>
              )}
            </div>

            {/* Description Text Carousel */}
            <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px', padding: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff', marginBottom: '14px' }}>
                Description Text&nbsp;&nbsp;Carousel
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '10px', fontSize: '12px', pointerEvents: 'none', zIndex: 1 }}>🔥</span>
                  <input type="text" value={badgeText} onChange={e => { const val = e.target.value; setBadgeText(val); localStorage.setItem('exzibo_carousel_badge_default', val); window.dispatchEvent(new CustomEvent('exzibo-carousel-badge-changed', { detail: { restaurantId: 'default', badge: val } })) }} placeholder="ENTER BADGE TEXT…" style={{ width: '100%', boxSizing: 'border-box', background: '#E8321A', border: 'none', borderRadius: '10px', padding: '7px 12px 7px 30px', fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase', outline: 'none', caretColor: '#fff', fontFamily: 'inherit' }} onFocus={e => e.target.style.background = '#c42a14'} onBlur={e => e.target.style.background = '#E8321A'} />
                </div>
                <textarea value={descText} onChange={e => { setDescText(e.target.value); localStorage.setItem('exzibo_carousel_desc_default', e.target.value); window.dispatchEvent(new CustomEvent('exzibo-carousel-desc-changed', { detail: { restaurantId: 'default', text: e.target.value } })) }} placeholder="WRITE HERE" rows={4} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: 'none', borderRadius: '12px', padding: '14px 16px', fontSize: '14px', fontWeight: 700, color: '#111', letterSpacing: '0.02em', resize: 'none', fontFamily: 'inherit', outline: 'none', lineHeight: 1.6 }} />
              </div>
            </div>

          </div>
        </main>
      </div>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '440px',
              maxWidth: '90vw',
              background: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LogIn size={18} color="#E8321A" />
                <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 700, letterSpacing: '0.02em' }}>
                  Master Login
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: '#888',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              Restaurant UID
            </label>
            <input
              autoFocus
              value={uid}
              onChange={e => { setUid(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && accessPanel(uid, setError)}
              placeholder="Paste Restaurant UID..."
              style={{
                width: '100%',
                background: '#0A0A0A',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '10px',
                color: '#EF4444',
                fontSize: '12px',
              }}>
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            <button
              onClick={() => accessPanel(uid, setError)}
              style={{
                width: '100%',
                marginTop: '20px',
                background: '#E8321A',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                padding: '13px',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              Access Panel
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
