import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle, Camera, ChevronLeft, User } from 'lucide-react'
import { updateRestaurant, uploadDataUrlToStorage } from '../lib/db'

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
const BLUE = '#3B6BE8'
const LIGHT_BLUE = '#EAF1FD'
const LIME = '#A8E63D'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

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
        await new Promise(r => setTimeout(r, 0))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        for (const q of [0.82, 0.60, 0.38]) {
          const out = canvas.toDataURL('image/jpeg', q)
          if (out.length * 0.75 <= maxBytes) return resolve(out)
        }
        await new Promise(r => setTimeout(r, 0))
        canvas.width = Math.max(1, Math.round(w * 0.5))
        canvas.height = Math.max(1, Math.round(h * 0.5))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

function loadCurrentName(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    try {
      const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
      return config.adminTitle || localStorage.getItem('exzibo_name_default') || 'Exzibo Admin'
    } catch { return 'Exzibo Admin' }
  }
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    return all.find(r => r.id === restaurantId)?.name || 'Restaurant'
  } catch { return 'Restaurant' }
}

function loadCurrentLogo(restaurantId) {
  if (!restaurantId || restaurantId === 'default') {
    return localStorage.getItem('exzibo_logo_default') || ''
  }
  try {
    const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    return all.find(r => r.id === restaurantId)?.logo || ''
  } catch { return '' }
}

export default function EditProfile() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const restaurantId = searchParams.get('restaurantId') || 'default'

  const fileInputRef = useRef(null)

  const [nameInput, setNameInput] = useState(() => loadCurrentName(restaurantId))
  const [nameError, setNameError] = useState('')

  const [previewUrl, setPreviewUrl] = useState(() => loadCurrentLogo(restaurantId))
  const [pendingImageUrl, setPendingImageUrl] = useState(null)
  const [imageError, setImageError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [compressModal, setCompressModal] = useState(false)
  const [compressSrc, setCompressSrc] = useState(null)
  const [compressPreview, setCompressPreview] = useState(null)
  const [compressing, setCompressing] = useState(false)

  useEffect(() => {
    setNameInput(loadCurrentName(restaurantId))
    setPreviewUrl(loadCurrentLogo(restaurantId))
    setPendingImageUrl(null)
  }, [restaurantId])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setImageError('Only JPG, PNG, or WEBP images are allowed.')
      return
    }
    setImageError('')
    const sizeKB = file.size / 1024
    if (sizeKB < 60) {
      setImageError('Image quality too low. Please upload a better image (min 60 KB).')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target.result
      if (sizeKB > 200) {
        setCompressSrc(src)
        setCompressPreview(src)
        setCompressModal(true)
      } else {
        setPendingImageUrl(src)
        setPreviewUrl(src)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleCompressConfirm() {
    if (!compressSrc) return
    setCompressing(true)
    try {
      const result = await compressToLimit(compressSrc, 200)
      if (result) {
        setPendingImageUrl(result)
        setPreviewUrl(result)
      } else {
        setImageError('Compression failed. Please try a different image.')
      }
    } catch {
      setImageError('Compression failed. Please try a different image.')
    } finally {
      setCompressing(false)
      setCompressModal(false)
      setCompressSrc(null)
      setCompressPreview(null)
    }
  }

  function handleCompressCancel() {
    setCompressModal(false)
    setCompressSrc(null)
    setCompressPreview(null)
  }

  async function handleSave() {
    const trimmedName = nameInput.trim()
    if (!trimmedName) {
      setNameError('Name cannot be empty.')
      return
    }
    setNameError('')
    setSaveError('')
    setSaving(true)

    try {
      let finalLogoUrl = pendingImageUrl || previewUrl

      if (pendingImageUrl && restaurantId && restaurantId !== 'default' && restaurantId !== 'demo') {
        try {
          finalLogoUrl = await uploadDataUrlToStorage(pendingImageUrl, 'restaurant-images', `${restaurantId}/logo`)
          await updateRestaurant(restaurantId, { logo: finalLogoUrl, name: trimmedName })
        } catch (e) {
          console.warn('[EditProfile] Supabase save failed, using local fallback:', e.message)
          finalLogoUrl = pendingImageUrl
        }
      } else if (!pendingImageUrl && restaurantId && restaurantId !== 'default' && restaurantId !== 'demo') {
        try {
          await updateRestaurant(restaurantId, { name: trimmedName })
        } catch (e) {
          console.warn('[EditProfile] Supabase name update failed:', e.message)
        }
      }

      if (!restaurantId || restaurantId === 'default') {
        const config = JSON.parse(localStorage.getItem('exzibo_admin_global_config') || '{}')
        config.adminTitle = trimmedName
        localStorage.setItem('exzibo_admin_global_config', JSON.stringify(config))
        localStorage.setItem('exzibo_name_default', trimmedName)
        if (finalLogoUrl) localStorage.setItem('exzibo_logo_default', finalLogoUrl)
      } else {
        const all = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        localStorage.setItem('exzibo_restaurants', JSON.stringify(
          all.map(r => r.id === restaurantId
            ? { ...r, name: trimmedName, ...(finalLogoUrl ? { logo: finalLogoUrl } : {}) }
            : r
          )
        ))
      }

      window.dispatchEvent(new CustomEvent('exzibo-name-changed', { detail: { restaurantId, name: trimmedName } }))
      if (finalLogoUrl) {
        window.dispatchEvent(new CustomEvent('exzibo-logo-changed', { detail: { restaurantId, logo: finalLogoUrl } }))
      }

      setSaveSuccess(true)
      setTimeout(() => navigate(-1), 900)
    } catch (err) {
      setSaveError('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const displayUrl = previewUrl || ''

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(to bottom, ${LIGHT_BLUE} 180px, #ffffff 180px)`,
      display: 'flex',
      justifyContent: 'center',
      fontFamily: FONT,
    }}>
      <div style={{
        width: '100%',
        maxWidth: '390px',
        minHeight: '100dvh',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflowX: 'hidden',
      }}>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* ── Sticky header ── */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: LIGHT_BLUE,
          padding: '16px 20px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(0,0,0,0.06)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
            aria-label="Go back"
          >
            <ChevronLeft size={18} color="#333" strokeWidth={2.5} />
          </button>
          <span style={{
            fontWeight: 800, fontSize: '20px', color: '#111',
            letterSpacing: '-0.01em', lineHeight: 1,
          }}>
            EDIT PROFILE
          </span>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Blue hero band */}
          <div style={{ background: LIGHT_BLUE, height: '80px', flexShrink: 0 }} />

          {/* Profile image centered straddling the boundary */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: '-64px',
            paddingBottom: '8px',
            position: 'relative',
            zIndex: 1,
          }}>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <div style={{
                width: '120px', height: '120px', borderRadius: '28px',
                background: '#C8D9F8',
                overflow: 'hidden',
                border: '4px solid #fff',
                boxShadow: '0 4px 20px rgba(59,107,232,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {displayUrl
                  ? <img src={displayUrl} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <User size={44} color="#7fa8e8" strokeWidth={1.5} />
                }
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  position: 'absolute',
                  bottom: '-6px', right: '-6px',
                  width: '36px', height: '36px',
                  borderRadius: '50%',
                  background: BLUE,
                  border: '3px solid #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(59,107,232,0.35)',
                }}
                aria-label="Change profile image"
              >
                <Camera size={15} color="#fff" strokeWidth={2.2} />
              </button>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'transparent',
                border: `1.5px solid ${BLUE}`,
                borderRadius: '20px',
                padding: '7px 20px',
                color: BLUE,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              CHANGE IMAGE
            </button>

            {imageError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginTop: '10px', padding: '8px 14px',
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '10px',
                maxWidth: '300px',
              }}>
                <AlertCircle size={13} color="#EF4444" />
                <span style={{ fontSize: '12px', color: '#EF4444', fontWeight: 500 }}>{imageError}</span>
              </div>
            )}

            {pendingImageUrl && !imageError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginTop: '10px',
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>New image selected</span>
              </div>
            )}
          </div>

          {/* Form section */}
          <div style={{ padding: '24px 20px 32px' }}>

            {/* Name field */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '11px', fontWeight: 700, color: '#888',
                letterSpacing: '0.08em', marginBottom: '8px',
              }}>
                RESTAURANT NAME
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setNameError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                placeholder="Enter restaurant name…"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  border: `1.5px solid ${nameError ? '#FECACA' : '#E0E0E8'}`,
                  background: nameError ? 'rgba(239,68,68,0.03)' : '#F8F9FC',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#111',
                  outline: 'none',
                  fontFamily: FONT,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = BLUE }}
                onBlur={e => { e.target.style.borderColor = nameError ? '#FECACA' : '#E0E0E8' }}
              />
              {nameError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  marginTop: '8px',
                }}>
                  <AlertCircle size={13} color="#EF4444" />
                  <span style={{ fontSize: '12px', color: '#EF4444', fontWeight: 500 }}>{nameError}</span>
                </div>
              )}
            </div>

            {/* Save error */}
            {saveError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 14px', borderRadius: '12px',
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)',
                marginBottom: '16px',
              }}>
                <AlertCircle size={14} color="#EF4444" />
                <span style={{ fontSize: '13px', color: '#EF4444', fontWeight: 500 }}>{saveError}</span>
              </div>
            )}

            {/* Success feedback */}
            {saveSuccess && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 14px', borderRadius: '12px',
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
                marginBottom: '16px',
              }}>
                <CheckCircle2 size={14} color="#22c55e" />
                <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600 }}>Changes saved successfully!</span>
              </div>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || saveSuccess}
              style={{
                width: '100%',
                padding: '15px',
                borderRadius: '16px',
                background: saveSuccess ? '#22c55e' : saving ? '#94a3b8' : BLUE,
                border: 'none',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                cursor: saving || saveSuccess ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: saving || saveSuccess ? 'none' : `0 4px 16px rgba(59,107,232,0.3)`,
                transition: 'background 0.2s, box-shadow 0.2s',
                fontFamily: FONT,
              }}
            >
              {saving ? (
                <><Loader2 size={15} style={{ animation: 'editSpin 1s linear infinite' }} /> SAVING…</>
              ) : saveSuccess ? (
                <><CheckCircle2 size={15} /> SAVED!</>
              ) : (
                'SAVE CHANGES'
              )}
            </button>

          </div>
        </div>

        {/* ── Compress Confirm Modal ── */}
        {compressModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
            <div style={{
              width: '100%', maxWidth: '390px',
              background: '#fff', borderRadius: '24px 24px 0 0',
              padding: '28px 24px 36px',
            }}>
              <div style={{ fontWeight: 800, fontSize: '17px', color: '#111', marginBottom: '8px' }}>
                Compress Image?
              </div>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '20px', lineHeight: 1.5 }}>
                This image is over 200 KB. Compress it before saving to keep things fast.
              </div>
              {compressPreview && (
                <div style={{
                  width: '80px', height: '80px', borderRadius: '16px',
                  overflow: 'hidden', margin: '0 auto 20px', background: '#f1f5f9',
                }}>
                  <img src={compressPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleCompressCancel}
                  disabled={compressing}
                  style={{
                    flex: 1, padding: '13px', borderRadius: '13px',
                    background: '#F0F0F5', border: 'none',
                    color: '#555', fontSize: '13px', fontWeight: 700,
                    cursor: compressing ? 'not-allowed' : 'pointer',
                    fontFamily: FONT,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompressConfirm}
                  disabled={compressing}
                  style={{
                    flex: 2, padding: '13px', borderRadius: '13px',
                    background: compressing ? '#94a3b8' : LIME,
                    border: 'none', color: '#111', fontSize: '13px', fontWeight: 800,
                    cursor: compressing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    fontFamily: FONT,
                  }}
                >
                  {compressing
                    ? <><Loader2 size={14} style={{ animation: 'editSpin 1s linear infinite' }} /> Compressing…</>
                    : 'Compress & Use'}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes editSpin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
