import React, { useEffect, useRef, useState } from 'react'
import {
  X, Share2, Power, MapPin, Phone, Store, Users, Image, Loader2, AlertCircle, CheckCircle2
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

export default function ProfileSlide({ open, onClose, restaurantId, logoUrl, onLogoUpdate }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(logoUrl || '')

  useEffect(() => {
    setPreviewUrl(logoUrl || '')
  }, [logoUrl])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setUploadError('')
      setUploadSuccess(false)
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleLogoUpload(file) {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      setUploadError('Only JPG, PNG, WEBP or GIF images are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be smaller than 5 MB.')
      return
    }
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

  const menuItems = [
    {
      id: 'edit-logo',
      label: 'EDIT LOGO',
      icon: <PiPencilCircle size={26} strokeWidth={1.2} />,
      active: false,
      onClick: () => {
        setUploadError('')
        fileInputRef.current?.click()
      },
    },
    {
      id: 'edit-name',
      label: 'EDIT RESTAURANT NAME',
      icon: <Store size={22} strokeWidth={1.4} />,
      active: false,
      onClick: null,
    },
    {
      id: 'contact',
      label: 'CONTACT INFO',
      icon: <Phone size={22} strokeWidth={1.4} />,
      active: false,
      onClick: null,
    },
    {
      id: 'location',
      label: 'LOCATION',
      icon: <MapPin size={22} strokeWidth={1.4} />,
      active: true,
      onClick: null,
    },
    {
      id: 'team',
      label: 'TEAM MEMBERS',
      icon: <Users size={22} strokeWidth={1.4} />,
      active: false,
      onClick: null,
    },
  ]

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
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 1000,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.3s ease',
          backdropFilter: 'blur(2px)',
        }}
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: '360px',
          maxWidth: '95vw',
          background: '#F2F2F7',
          zIndex: 1001,
          transform: open ? 'translateX(0)' : 'translateX(-110%)',
          transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
          boxShadow: '8px 0 40px rgba(0,0,0,0.35)',
          borderRadius: '0 20px 20px 0',
        }}
      >
        <div style={{ padding: '20px 16px 32px' }}>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(0,0,0,0.07)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#555',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Profile card */}
          <div style={{
            background: '#fff',
            borderRadius: '18px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '14px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              title="Click to change logo"
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: '20px',
                letterSpacing: '0.03em',
                flexShrink: 0,
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : 'EA'}
              {uploading && (
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Loader2 size={18} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#111', letterSpacing: '0.01em' }}>
                Exzibo
              </div>
              <div style={{ fontWeight: 400, fontSize: '13px', color: '#888', marginTop: '2px' }}>
                exzibonew@exzibo.com
              </div>
            </div>
            <button style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#999',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}>
              <Share2 size={18} strokeWidth={1.6} />
            </button>
          </div>

          {/* Status messages */}
          {uploadError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: '12px', padding: '10px 14px', marginBottom: '10px',
              color: '#EF4444', fontSize: '12px', fontWeight: 600,
            }}>
              <AlertCircle size={14} /> {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: '#F0FDF4', border: '1px solid #A7F3D0',
              borderRadius: '12px', padding: '10px 14px', marginBottom: '10px',
              color: '#10B981', fontSize: '12px', fontWeight: 600,
            }}>
              <CheckCircle2 size={14} /> Logo updated successfully!
            </div>
          )}

          {/* Menu items */}
          <div style={{
            background: '#E9E9EF',
            borderRadius: '18px',
            padding: '8px 10px',
            marginBottom: '14px',
          }}>
            {menuItems.map((item, idx) => (
              <div
                key={item.id}
                onClick={item.onClick || undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '13px 10px',
                  borderRadius: '12px',
                  background: item.active ? LIME : 'transparent',
                  marginBottom: idx < menuItems.length - 1 ? '2px' : 0,
                  cursor: item.onClick ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  position: 'relative',
                }}
              >
                <span style={{ color: item.active ? '#1a1a1a' : '#333', display: 'flex', alignItems: 'center' }}>
                  {item.id === 'edit-logo' && uploading
                    ? <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                    : item.icon}
                </span>
                <span style={{
                  fontWeight: 700,
                  fontSize: '13px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: item.active ? '#1a1a1a' : '#222',
                  lineHeight: 1.3,
                  flex: 1,
                }}>
                  {item.label}
                </span>
                {item.id === 'edit-logo' && uploadSuccess && (
                  <CheckCircle2 size={16} color="#10B981" />
                )}
              </div>
            ))}
          </div>

          {/* Image Carousel */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#999',
              marginBottom: '10px',
              paddingLeft: '4px',
            }}>
              Image Carousel
            </div>
            <div style={{
              background: '#E9E9EF',
              borderRadius: '18px',
              height: '130px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Image size={32} color="#bbb" strokeWidth={1.2} />
            </div>
          </div>

          {/* Logout */}
          <div style={{
            background: '#fff',
            borderRadius: '18px',
            padding: '4px 10px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          }}>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px 10px',
                width: '100%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Power size={20} strokeWidth={1.4} color="#555" />
              <span style={{
                fontWeight: 600,
                fontSize: '15px',
                color: '#222',
                letterSpacing: '0.01em',
              }}>
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
