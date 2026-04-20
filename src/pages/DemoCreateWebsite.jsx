import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Upload, Plus, Trash2, Star,
  Link, Link2, Globe, MapPin,
  ChefHat, Users, Zap, Bell
} from 'lucide-react'
import PlanSelector from '../components/PlanSelector'
import DemoSidebar from '../components/DemoSidebar'

const THEMES = [
  {
    id: 'crimson-dark',
    name: 'Crimson Dark',
    badge: 'DEFAULT',
    available: true,
    accent: '#E8321A',
    desc: 'Obsidian black with crimson red accents.',
  },
  { id: 'ocean-blue', name: 'Ocean Blue', badge: 'COMING SOON', available: false, accent: '#2563EB', desc: 'Deep navy with electric blue highlights.' },
  { id: 'forest-green', name: 'Forest Green', badge: 'COMING SOON', available: false, accent: '#16A34A', desc: 'Earthy dark tones with lush green.' },
  { id: 'golden-luxury', name: 'Golden Luxury', badge: 'COMING SOON', available: false, accent: '#D97706', desc: 'Midnight black with champagne gold.' },
  { id: 'midnight-purple', name: 'Midnight Purple', badge: 'COMING SOON', available: false, accent: '#7C3AED', desc: 'Dark moody purples for bars & lounges.' },
  { id: 'slate-modern', name: 'Slate Modern', badge: 'COMING SOON', available: false, accent: '#94A3B8', desc: 'Cool slate greys for a minimal aesthetic.' },
]

export default function DemoCreateWebsite() {
  const navigate = useNavigate()

  const [step, setStep] = useState('form') // 'form' | 'theme' | 'success'
  const [createdSlug, setCreatedSlug] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingData, setPendingData] = useState(null)

  const [form, setForm] = useState({
    restaurantName: '',
    phoneNumber: '',
    gstDetails: '',
    tableNumbers: [],
    tableInput: '',
    description: '',
    chefInfo: '',
    servantInfo: '',
    socialLinks: { instagram: '', facebook: '', twitter: '', website: '' },
    rating: '',
    location: '',
    additionalInfo: '',
    digitalMenuLink: '',
    digitalServiceBell: false,
    uploadedImages: [],
    logo: null,
    selectedPlan: 'PLUS',
  })

  const [errors, setErrors] = useState({})
  const [logoDragging, setLogoDragging] = useState(false)
  const [imgDragging, setImgDragging] = useState(false)

  const logoInputRef = useRef()
  const imgInputRef = useRef()

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }))
  const setSocial = (field, value) => setForm(p => ({ ...p, socialLinks: { ...p.socialLinks, [field]: value } }))

  const addTable = () => {
    const val = form.tableInput.trim()
    if (!val || form.tableNumbers.includes(val)) return
    set('tableNumbers', [...form.tableNumbers, val])
    set('tableInput', '')
  }
  const removeTable = t => set('tableNumbers', form.tableNumbers.filter(x => x !== t))

  const handleLogoFile = file => {
    if (!file || !file.type.startsWith('image/')) return
    set('logo', { file, url: URL.createObjectURL(file) })
  }

  const handleImgFiles = files => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'))
    const mapped = valid.map(f => ({ file: f, url: URL.createObjectURL(f) }))
    set('uploadedImages', [...form.uploadedImages, ...mapped])
  }

  const removeImage = idx => set('uploadedImages', form.uploadedImages.filter((_, i) => i !== idx))

  const validate = () => {
    const e = {}
    if (!form.restaurantName.trim()) e.restaurantName = 'Restaurant name is required'
    if (form.uploadedImages.length === 0) e.uploadedImages = 'At least one image is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const generateSlug = (name, existingSlugs) => {
    const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    let slug = `demo-${base || 'restaurant'}`
    let counter = 2
    while (existingSlugs.includes(slug)) { slug = `demo-${base}-${counter}`; counter++ }
    return slug
  }

  const generateUID = (existingRestaurants) => {
    const usedUIDs = new Set(existingRestaurants.map(r => r.uid).filter(Boolean))
    let uid
    do {
      const firstDigit = [6, 7, 8, 9][Math.floor(Math.random() * 4)]
      const rest = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')
      uid = `${firstDigit}${rest}`
    } while (usedUIDs.has(uid))
    return uid
  }

  const fileToBase64 = file => new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.readAsDataURL(file)
  })

  const handleNext = async () => {
    if (!validate()) return
    setSubmitting(true)
    const base64Images = await Promise.all(
      form.uploadedImages.map(img => img.file ? fileToBase64(img.file) : Promise.resolve(img.url))
    )
    const logoBase64 = form.logo?.file ? await fileToBase64(form.logo.file) : form.logo?.url || null
    const existing = JSON.parse(localStorage.getItem('exzibo_demo_restaurants') || '[]')
    const existingSlugs = existing.map(r => r.slug).filter(Boolean)
    const slug = generateSlug(form.restaurantName, existingSlugs)
    const uid = generateUID(existing)
    setPendingData({ base64Images, logoBase64, slug, uid, existing })
    setSubmitting(false)
    setStep('theme')
  }

  const handleThemeSelect = (theme) => {
    if (!theme.available || !pendingData) return
    const { base64Images, logoBase64, slug, uid, existing } = pendingData
    const newRestaurant = {
      id: Date.now().toString(),
      uid,
      slug,
      isDemo: true,
      theme: theme.id,
      name: form.restaurantName,
      logo: logoBase64,
      images: base64Images,
      owner: '',
      tables: form.tableNumbers.length.toString(),
      tableNumbers: form.tableNumbers,
      phone: form.phoneNumber,
      gst: form.gstDetails,
      description: form.description,
      chefInfo: form.chefInfo,
      servantInfo: form.servantInfo,
      socialLinks: form.socialLinks,
      rating: form.rating,
      location: form.location,
      additionalInfo: form.additionalInfo,
      digitalMenuLink: form.digitalMenuLink,
      digitalServiceBell: form.digitalServiceBell,
      status: 'active',
      plan: form.selectedPlan,
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('exzibo_demo_restaurants', JSON.stringify([...existing, newRestaurant]))
    setCreatedSlug(slug)
    setStep('success')
  }

  if (step === 'success') {
    return (
      <div style={{
        display: 'flex', height: '100vh', background: '#0A0A0A',
        overflow: 'hidden', color: '#fff', fontFamily: 'inherit',
      }}>
        <DemoSidebar />
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflowY: 'auto', padding: '24px', background: '#0B0B0B',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: '420px', width: '100%',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px', padding: '48px 40px',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', margin: '0 auto 20px',
          }}>✓</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff', marginBottom: '8px' }}>
            Demo App Created!
          </div>
          <div style={{ fontSize: '14px', color: '#555', marginBottom: '28px', lineHeight: 1.6 }}>
            Your demo restaurant website is ready. It is stored in your demo list and is not visible in the main admin panel.
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '10px 14px', marginBottom: '24px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '11px', color: '#555' }}>Demo URL:</span>
            <span style={{ fontSize: '12px', color: '#E8321A', fontFamily: 'monospace', fontWeight: 600 }}>
              /restaurant/{createdSlug}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a
              href={`/restaurant/${createdSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: '#E8321A', borderRadius: '12px', padding: '14px',
                color: '#fff', fontSize: '14px', fontWeight: 700,
                textDecoration: 'none', letterSpacing: '0.04em',
                boxShadow: '0 6px 20px rgba(232,50,26,0.4)',
              }}
            >
              View Demo Website →
            </a>
            <button
              onClick={() => navigate('/demo/list')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px', padding: '14px',
                color: '#ccc', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              List of Demo
            </button>
            <button
              onClick={() => navigate('/')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'transparent', border: 'none',
                color: '#444', fontSize: '13px', fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0A0A0A', overflow: 'hidden', color: '#fff', fontFamily: 'inherit', position: 'relative' }}>
      <style>{`
        .forge-input { width:100%;padding:13px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#ccc;font-size:14px;outline:none;transition:border-color 0.2s,box-shadow 0.2s;box-sizing:border-box;font-family:inherit; }
        .forge-input::placeholder { color:#3a3a3a; }
        .forge-input:focus { border-color:rgba(255,59,48,0.5);box-shadow:0 0 0 3px rgba(255,59,48,0.1); }
        .forge-textarea { width:100%;padding:13px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;color:#ccc;font-size:14px;outline:none;resize:vertical;min-height:110px;transition:border-color 0.2s,box-shadow 0.2s;box-sizing:border-box;font-family:inherit;line-height:1.6; }
        .forge-textarea::placeholder { color:#3a3a3a; }
        .forge-textarea:focus { border-color:rgba(255,59,48,0.5);box-shadow:0 0 0 3px rgba(255,59,48,0.1); }
        .forge-label { display:block;font-size:9px;font-weight:700;letter-spacing:0.18em;color:#555;text-transform:uppercase;margin-bottom:8px; }
        .error-msg { font-size:11px;color:#FF3B30;margin-top:5px;font-weight:500; }
        @keyframes fadeScale { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeInModal { from{opacity:0} to{opacity:1} }
        @keyframes scaleInModal { from{opacity:0;transform:scale(0.96) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <DemoSidebar />

      <div style={{ flex: 1, overflowY: 'auto', background: '#0B0B0B' }}>
      <div style={{ animation: 'fadeScale 0.35s ease' }}>
        {/* Page title */}
        <div style={{
          padding: '28px 40px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#FF3B30', textTransform: 'uppercase', marginBottom: '10px' }}>
            Demo Mode
          </div>
          <h1 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900, lineHeight: 1.05, marginBottom: '8px' }}>
            Create Your <span style={{ color: '#FF3B30', textShadow: '0 0 40px rgba(255,59,48,0.4)' }}>Demo App.</span>
          </h1>
          <p style={{ fontSize: '13px', color: '#555', maxWidth: '460px', lineHeight: 1.6 }}>
            Fill in your restaurant details to generate a demo website.
          </p>
        </div>

        <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 40px 160px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '40px' }}>
            <LeftSection
              form={form} set={set} errors={errors}
              addTable={addTable} removeTable={removeTable}
              logoInputRef={logoInputRef}
              logoDragging={logoDragging} setLogoDragging={setLogoDragging}
              handleLogoFile={handleLogoFile}
            />
            <RightSection
              form={form} set={set} errors={errors}
              imgInputRef={imgInputRef}
              imgDragging={imgDragging} setImgDragging={setImgDragging}
              handleImgFiles={handleImgFiles}
              removeImage={removeImage}
            />
          </div>

          <SocialLinksSection form={form} setSocial={setSocial} />
          <BottomCards form={form} set={set} />
          <AdditionalSection form={form} set={set} />

          <div style={{
            marginBottom: '28px', background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: '18px', padding: '28px',
          }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>Subscription Plan</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>Choose Your Plan</div>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>You can upgrade or change your plan at any time.</div>
            </div>
            <PlanSelector selected={form.selectedPlan} onChange={val => set('selectedPlan', val)} />
          </div>
        </div>

        {/* Footer CTA */}
        <div style={{
          position: 'fixed', bottom: 0, left: '270px', right: 0, padding: '20px 40px',
          background: 'linear-gradient(to top, #0B0B0B 70%, transparent)',
          display: 'flex', justifyContent: 'center', zIndex: 50,
        }}>
          <button
            onClick={handleNext}
            disabled={submitting}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '18px 56px', background: submitting ? 'rgba(255,59,48,0.5)' : '#FF3B30',
              border: '2px solid #FF3B30', borderRadius: '50px', color: '#fff',
              fontSize: '14px', fontWeight: 800, letterSpacing: '0.12em',
              cursor: submitting ? 'default' : 'pointer',
              boxShadow: '0 0 30px rgba(255,59,48,0.3)', transition: 'all 0.25s', textTransform: 'uppercase',
            }}
          >
            {submitting ? (
              <>
                <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                PREPARING...
              </>
            ) : (
              <><Zap size={16} /> SELECT THEME</>
            )}
          </button>
        </div>
      </div>

      {/* Theme Picker Overlay */}
      {step === 'theme' && (
        <div
          onClick={() => setStep('form')}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            animation: 'fadeInModal 0.2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '780px', maxHeight: '88vh',
              background: '#0e0e0e',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px',
              display: 'flex', flexDirection: 'column',
              animation: 'scaleInModal 0.28s cubic-bezier(0.34,1.1,0.64,1)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '22px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: 'rgba(232,50,26,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                }}>🎨</div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>Website Themes</div>
                  <div style={{ fontSize: '12px', color: '#555' }}>Pick a look for your demo restaurant website</div>
                </div>
              </div>
              <button
                onClick={() => setStep('form')}
                style={{
                  width: '34px', height: '34px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#888', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><X size={14} /></button>
            </div>

            {/* Theme Grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {THEMES.map(theme => (
                  <ThemeCard key={theme.id} theme={theme} onSelect={handleThemeSelect} />
                ))}
                {/* More themes coming soon */}
                <div style={{
                  borderRadius: '16px', border: '1.5px dashed rgba(255,255,255,0.08)',
                  minHeight: '160px', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                  <span style={{ fontSize: '18px' }}>✦</span>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#3a3a3a', textAlign: 'center', lineHeight: 1.6 }}>
                    MORE THEMES<br />ARRIVING SOON
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 28px', borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: '12px', color: '#444' }}>
                {THEMES.filter(t => t.available).length} of {THEMES.length + 1} themes available
              </div>
              <button
                onClick={() => setStep('form')}
                style={{
                  padding: '10px 28px', background: '#E8321A', border: 'none',
                  borderRadius: '50px', color: '#fff', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.08em',
                  boxShadow: '0 0 20px rgba(232,50,26,0.4)',
                }}
              >BACK</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function ThemeCard({ theme, onSelect }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={() => theme.available && onSelect(theme)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: '16px',
        border: `1.5px solid ${hovered && theme.available ? theme.accent : 'rgba(255,255,255,0.07)'}`,
        overflow: 'hidden',
        cursor: theme.available ? 'pointer' : 'not-allowed',
        transition: 'all 0.25s',
        background: '#0a0a0a',
        transform: hovered && theme.available ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered && theme.available ? `0 0 24px ${theme.accent}33` : 'none',
      }}
    >
      <div style={{ height: '130px', position: 'relative', overflow: 'hidden' }}>
        {theme.available ? (
          <div style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, #0a0a0a 0%, ${theme.accent}22 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: `${theme.accent}22`, border: `1px solid ${theme.accent}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
            }}>🍽️</div>
          </div>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, #0a0a0a 0%, ${theme.accent}12 100%)`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '50%',
              background: `${theme.accent}18`, border: `1px solid ${theme.accent}28`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
            }}>🔒</div>
            <div style={{ width: '50px', height: '3px', borderRadius: '2px', background: theme.accent, opacity: 0.25 }} />
          </div>
        )}
        {hovered && theme.available && (
          <div style={{
            position: 'absolute', inset: 0,
            background: `${theme.accent}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              padding: '8px 20px', background: theme.accent, borderRadius: '50px',
              color: '#fff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
            }}>SELECT</div>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: theme.available ? '#e0e0e0' : '#555' }}>{theme.name}</span>
          <span style={{
            fontSize: '9px', fontWeight: 800, letterSpacing: '0.07em',
            padding: '2px 8px', borderRadius: '20px',
            background: theme.available ? `${theme.accent}20` : 'rgba(255,255,255,0.04)',
            color: theme.available ? theme.accent : '#444',
            border: `1px solid ${theme.available ? theme.accent + '35' : 'rgba(255,255,255,0.06)'}`,
            whiteSpace: 'nowrap',
          }}>{theme.badge}</span>
        </div>
        <div style={{ fontSize: '11px', color: '#444', marginTop: '3px', lineHeight: 1.4 }}>{theme.desc}</div>
      </div>
    </div>
  )
}

function LeftSection({ form, set, errors, addTable, removeTable, logoInputRef, logoDragging, setLogoDragging, handleLogoFile }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SectionBlock label="Establishment Identity">
        <input className="forge-input" placeholder="Enter restaurant name" value={form.restaurantName} onChange={e => set('restaurantName', e.target.value)} style={{ fontSize: '15px' }} />
        {errors.restaurantName && <div className="error-msg">{errors.restaurantName}</div>}
      </SectionBlock>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <SectionBlock label="Mobile Number"><input className="forge-input" placeholder="+91 00000 00000" value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} /></SectionBlock>
        <SectionBlock label="GST Details (Optional)"><input className="forge-input" placeholder="GSTIN/UIN" value={form.gstDetails} onChange={e => set('gstDetails', e.target.value)} /></SectionBlock>
      </div>
      <SectionBlock label="Table Management">
        <div style={{ display: 'flex', gap: '10px' }}>
          <input className="forge-input" placeholder="Table Number" value={form.tableInput} onChange={e => set('tableInput', e.target.value)} onKeyDown={e => e.key === 'Enter' && addTable()} style={{ flex: 1 }} />
          <button onClick={addTable} style={{ padding: '0 20px', background: '#FF3B30', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Add</button>
        </div>
        {form.tableNumbers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
            {form.tableNumbers.map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', fontWeight: 600, color: '#FF3B30' }}>
                {t}<Trash2 size={11} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => removeTable(t)} />
              </span>
            ))}
          </div>
        )}
      </SectionBlock>
      <SectionBlock label="Brand Mark">
        <div
          onDragOver={e => { e.preventDefault(); setLogoDragging(true) }}
          onDragLeave={() => setLogoDragging(false)}
          onDrop={e => { e.preventDefault(); setLogoDragging(false); handleLogoFile(e.dataTransfer.files[0]) }}
          onClick={() => logoInputRef.current?.click()}
          style={{ border: `2px dashed ${logoDragging ? 'rgba(255,59,48,0.6)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '14px', padding: '28px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: logoDragging ? 'rgba(255,59,48,0.04)' : 'transparent' }}
        >
          {form.logo ? <img src={form.logo.url} alt="logo" style={{ height: '70px', objectFit: 'contain', borderRadius: '8px' }} /> : (<><Upload size={22} color="#3a3a3a" style={{ marginBottom: '8px' }} /><div style={{ fontSize: '12px', color: '#3a3a3a', fontWeight: 500 }}>Drop Logo</div></>)}
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoFile(e.target.files[0])} />
        </div>
      </SectionBlock>
      <SectionBlock label="Culinary Philosophy">
        <textarea className="forge-textarea" placeholder="Describe the atmosphere, the cuisine, and the soul of your restaurant..." value={form.description} onChange={e => set('description', e.target.value)} />
      </SectionBlock>
    </div>
  )
}

function RightSection({ form, set, errors, imgInputRef, imgDragging, setImgDragging, handleImgFiles, removeImage }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SectionBlock label="Visual Atmosphere">
        <div
          onDragOver={e => { e.preventDefault(); setImgDragging(true) }}
          onDragLeave={() => setImgDragging(false)}
          onDrop={e => { e.preventDefault(); setImgDragging(false); handleImgFiles(e.dataTransfer.files) }}
          onClick={() => form.uploadedImages.length === 0 && imgInputRef.current?.click()}
          style={{ border: `2px dashed ${imgDragging ? 'rgba(255,59,48,0.6)' : errors.uploadedImages ? 'rgba(255,59,48,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '14px', minHeight: '180px', cursor: 'pointer', transition: 'all 0.2s', overflow: 'hidden' }}
        >
          {form.uploadedImages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '180px' }}>
              <Upload size={24} color="#3a3a3a" style={{ marginBottom: '10px' }} />
              <div style={{ fontSize: '13px', color: '#3a3a3a', fontWeight: 500 }}>Drop restaurant images here</div>
              <div style={{ fontSize: '11px', color: '#2a2a2a', marginTop: '4px' }}>or click to browse</div>
            </div>
          ) : (
            <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
              {form.uploadedImages.map((img, idx) => (
                <div key={idx} style={{ position: 'relative', paddingTop: '66%', borderRadius: '8px', overflow: 'hidden' }}>
                  <img src={img.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={e => { e.stopPropagation(); removeImage(idx) }} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', display: 'flex', padding: '4px' }}><X size={10} /></button>
                </div>
              ))}
              <div onClick={e => { e.stopPropagation(); imgInputRef.current?.click() }} style={{ paddingTop: '66%', borderRadius: '8px', border: '1px dashed rgba(255,59,48,0.3)', background: 'rgba(255,59,48,0.04)', position: 'relative', cursor: 'pointer' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} color="rgba(255,59,48,0.5)" /></div>
              </div>
            </div>
          )}
          <input ref={imgInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleImgFiles(e.target.files)} />
        </div>
        {errors.uploadedImages && <div className="error-msg">{errors.uploadedImages}</div>}
      </SectionBlock>
      <InfoCard icon={<ChefHat size={14} />} label="Executive Chef Bio">
        <textarea className="forge-textarea" placeholder="Tell the chef's journey..." value={form.chefInfo} onChange={e => set('chefInfo', e.target.value)} style={{ minHeight: '88px' }} />
      </InfoCard>
      <InfoCard icon={<Users size={14} />} label="Hospitality Standard">
        <textarea className="forge-textarea" placeholder="Describe the interaction, service and guest experience..." value={form.servantInfo} onChange={e => set('servantInfo', e.target.value)} style={{ minHeight: '88px' }} />
      </InfoCard>
    </div>
  )
}

function SocialLinksSection({ form, setSocial }) {
  const links = [
    { key: 'instagram', icon: <Link size={13} />, placeholder: 'Instagram Profile Link' },
    { key: 'facebook', icon: <Link2 size={13} />, placeholder: 'Facebook Page Link' },
    { key: 'twitter', icon: <Link size={13} />, placeholder: 'X / Twitter Handle Link' },
    { key: 'website', icon: <Globe size={13} />, placeholder: 'Official Website URL' },
  ]
  return (
    <div style={{ marginBottom: '28px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '18px', padding: '24px 28px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#555', textTransform: 'uppercase', textAlign: 'center', marginBottom: '18px' }}>Connect Digital Footprint</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
        {links.map(({ key, icon, placeholder }) => (
          <div key={key} style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#444', pointerEvents: 'none', display: 'flex' }}>{icon}</div>
            <input className="forge-input" placeholder={placeholder} value={form.socialLinks[key]} onChange={e => setSocial(key, e.target.value)} style={{ paddingLeft: '32px', fontSize: '12px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function BottomCards({ form, set }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '28px' }}>
      <Card label="Automation">
        <div style={{ marginBottom: '14px' }}>
          <label className="forge-label">Digital Menu Link</label>
          <input className="forge-input" placeholder="Your service portal (Swiggy, etc.)" value={form.digitalMenuLink} onChange={e => set('digitalMenuLink', e.target.value)} style={{ fontSize: '12px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ccc' }}>Digital Service Bell</span>
          <Toggle value={form.digitalServiceBell} onChange={v => set('digitalServiceBell', v)} />
        </div>
      </Card>
      <Card label="Reputation">
        <label className="forge-label">Google Rating</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#FFB800', display: 'flex' }}><Star size={13} fill="#FFB800" /></div>
          <input className="forge-input" placeholder="e.g. 4/5" value={form.rating} onChange={e => set('rating', e.target.value)} style={{ paddingLeft: '32px', fontSize: '12px' }} />
        </div>
      </Card>
      <Card label="Map Anchor">
        <label className="forge-label">Location</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555', display: 'flex' }}><MapPin size={13} /></div>
          <input className="forge-input" placeholder="e.g. Cyber City, Gurugram" value={form.location} onChange={e => set('location', e.target.value)} style={{ paddingLeft: '32px', fontSize: '12px' }} />
        </div>
      </Card>
    </div>
  )
}

function AdditionalSection({ form, set }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label className="forge-label">Additional Intelligence</label>
      <textarea className="forge-textarea" placeholder="Dietary preferences, dress code, valet parking instructions, or local landmarks..." value={form.additionalInfo} onChange={e => set('additionalInfo', e.target.value)} style={{ minHeight: '90px' }} />
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: value ? '#FF3B30' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', boxShadow: value ? '0 0 12px rgba(255,59,48,0.4)' : 'none' }}>
      <div style={{ position: 'absolute', top: '3px', left: value ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
    </div>
  )
}

function SectionBlock({ label, children }) {
  return <div>{label && <label className="forge-label">{label}</label>}{children}</div>
}

function Card({ label, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#555', textTransform: 'uppercase', marginBottom: '16px' }}>{label}</div>
      {children}
    </div>
  )
}

function InfoCard({ icon, label, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{ color: '#FF3B30', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', background: 'rgba(255,59,48,0.1)', borderRadius: '8px' }}>{icon}</div>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#888', textTransform: 'uppercase' }}>{label}</span>
      </div>
      {children}
    </div>
  )
}
