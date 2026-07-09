import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle, Camera, User } from 'lucide-react'
import { updateRestaurant, uploadLogoViaApi } from '../lib/db'
import { processImageFile, isAcceptedImageType } from '../lib/processImage'
import { useRole } from '../context/RoleContext'

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
const BLUE = '#3B6BE8'
const LIGHT_BLUE = '#EAF1FD'
const LIME = '#A8E63D'


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

  // Only MASTER / ADMIN (activeRole === null) may access this page.
  // Manager and Employee are redirected back immediately.
  const { activeRole } = useRole()
  useEffect(() => {
    if (activeRole !== null && activeRole !== undefined) {
      navigate(-1)
    }
  }, [activeRole, navigate])

  const fileInputRef = useRef(null)

  const [nameInput, setNameInput] = useState(() => loadCurrentName(restaurantId))
  const [nameError, setNameError] = useState('')

  const [previewUrl, setPreviewUrl] = useState(() => loadCurrentLogo(restaurantId))
  const [pendingImageUrl, setPendingImageUrl] = useState(null)
  const [imageError, setImageError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [compressing, setCompressing] = useState(false)

  useEffect(() => {
    setNameInput(loadCurrentName(restaurantId))
    setPreviewUrl(loadCurrentLogo(restaurantId))
    setPendingImageUrl(null)
  }, [restaurantId])

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!isAcceptedImageType(file)) {
      setImageError('Please upload a valid image (JPG, PNG, WEBP, HEIC).')
      return
    }
    setImageError('')
    setCompressing(true)
    try {
      const dataUrl = await processImageFile(file)
      if (dataUrl) {
        setPendingImageUrl(dataUrl)
        setPreviewUrl(dataUrl)
      }
    } catch {
      setImageError('Could not process image. Please try a different file.')
    } finally {
      setCompressing(false)
    }
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
          finalLogoUrl = await uploadLogoViaApi(pendingImageUrl, restaurantId)
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
          accept="image/*"
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
