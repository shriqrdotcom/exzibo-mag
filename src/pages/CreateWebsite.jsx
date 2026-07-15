import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Upload, Plus, Trash2, Star,
  Link, Link2, Globe, MapPin,
  ChefHat, Users, Zap, Bell
} from 'lucide-react'
import PlanSelector from '../components/PlanSelector'
import { createRestaurant, getRestaurants, updateRestaurant, generateRestaurantUID, uploadLogoFileViaApi, uploadCarouselImageViaApi, checkLinkNameTakenInDB } from '../lib/db'
import { processImageFile, isAcceptedImageType } from '../lib/processImage'

export default function CreateWebsite() {
  const navigate = useNavigate()

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
    selectedPlan: 'STARTER',
    planLimits: {
      STARTER:    { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
      GROWTH:     { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
      SCALE:      { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
      CUSTOMISED: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
    },
  })

  const [linkName, setLinkName] = useState('')
  const [linkNameManual, setLinkNameManual] = useState(false)
  const [linkStatus, setLinkStatus] = useState('idle') // 'idle' | 'checking' | 'available' | 'taken'

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [createdSlug, setCreatedSlug] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [logoDragging, setLogoDragging] = useState(false)
  const [imgDragging, setImgDragging] = useState(false)
  const [logoSizeError, setLogoSizeError] = useState('')
  const [imgSizeError, setImgSizeError] = useState('')

  const logoInputRef = useRef()
  const imgInputRef = useRef()
  const linkDebounceRef = useRef(null)

  const slugify = (str) =>
    str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')

  useEffect(() => {
    if (!linkNameManual) {
      setLinkName(slugify(form.restaurantName))
    }
  }, [form.restaurantName, linkNameManual])

  // Debounced real-time slug availability check
  useEffect(() => {
    if (linkDebounceRef.current) clearTimeout(linkDebounceRef.current)
    if (!linkName || !linkName.trim()) {
      setLinkStatus('idle')
      return
    }
    setLinkStatus('checking')
    linkDebounceRef.current = setTimeout(async () => {
      try {
        const taken = await checkLinkNameTakenInDB(linkName.trim())
        setLinkStatus(taken ? 'taken' : 'available')
      } catch {
        setLinkStatus('idle')
      }
    }, 400)
    return () => clearTimeout(linkDebounceRef.current)
  }, [linkName])


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
    if (!file || !isAcceptedImageType(file)) return
    setLogoSizeError('')
    set('logo', { file, url: URL.createObjectURL(file) })
  }

  const handleImgFiles = files => {
    setImgSizeError('')
    const valid = Array.from(files).filter(f => isAcceptedImageType(f))
    if (!valid.length) { setImgSizeError('No valid image files found.'); return }
    const mapped = valid.map(f => ({ file: f, url: URL.createObjectURL(f) }))
    set('uploadedImages', [...form.uploadedImages, ...mapped])
  }

  const removeImage = idx => set('uploadedImages', form.uploadedImages.filter((_, i) => i !== idx))

  const validate = () => {
    const e = {}
    if (!form.restaurantName.trim()) e.restaurantName = 'Restaurant name is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const generateSlug = (name, existingSlugs) => {
    const base = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    let slug = base || 'restaurant'
    let counter = 2
    while (existingSlugs.includes(slug)) {
      slug = `${base}-${counter}`
      counter++
    }
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


  const handleGenerate = async () => {
    if (!validate()) return
    if (linkStatus === 'taken') {
      setSubmitError('This link name is already taken. Please choose a different one.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const tableNumbers = form.tableNumbers.length === 0 ? ['1'] : form.tableNumbers

      // ── Fetch existing slugs/UIDs to avoid collisions ──────────
      let existingSlugs = []
      let existingUIDs  = []
      try {
        const rows = await getRestaurants()
        existingSlugs = rows.map(r => r.slug).filter(Boolean)
        existingUIDs  = rows.map(r => r.uid).filter(Boolean)
      } catch { /* first restaurant — no existing rows */ }

      const baseSlug = linkName && linkName.trim() ? linkName.trim() : slugify(form.restaurantName)
      const slug = generateSlug(baseSlug, existingSlugs)
      // UID is generated server-side: globally unique, 10 digits, starts 6-9
      const uid = await generateRestaurantUID()

      // ── Step 1: Insert restaurant with text/metadata only ──────
      // Images are NOT included here — base64 blobs exceed Supabase
      // REST body limits (5 MB). They are uploaded to Storage below.
      const corePayload = {
        uid,
        slug,
        name:                 form.restaurantName,
        tables:               tableNumbers.length.toString(),
        table_numbers:        tableNumbers,
        phone:                form.phoneNumber   || null,
        gst:                  form.gstDetails    || null,
        description:          form.description   || null,
        chef_info:            form.chefInfo      || null,
        servant_info:         form.servantInfo   || null,
        social_links:         form.socialLinks,
        rating:               form.rating        || null,
        location:             form.location      || null,
        additional_info:      form.additionalInfo || null,
        digital_menu_link:    form.digitalMenuLink || null,
        digital_service_bell: form.digitalServiceBell,
        status:               'active',
        plan:                 form.selectedPlan,
        plan_limits:          form.planLimits,
      }

      const created = await createRestaurant(corePayload)

      // Sync to localStorage so MasterControl and other local-first code works immediately
      try {
        const prev = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
        const merged = [created, ...prev.filter(r => r.id !== created.id)]
        localStorage.setItem('exzibo_restaurants', JSON.stringify(merged))
        console.log('[CreateWebsite] Synced UID', created.uid, 'to localStorage')
      } catch { /* noop */ }

      // ── Step 2: Upload images to Supabase Storage (optional) ───
      // If the 'restaurant-images' bucket doesn't exist yet, this
      // block is skipped and the restaurant still saves successfully.
      try {
        // Upload all carousel images in parallel, then the logo alongside them
        const [imageUrls, logoUrl] = await Promise.all([
          Promise.all(
            form.uploadedImages
              .filter(img => img.file)
              .map(img => uploadCarouselImageViaApi(img.file, created.id))
          ),
          form.logo?.file
            ? uploadLogoFileViaApi(form.logo.file, created.id)
            : Promise.resolve(null),
        ])

        if (imageUrls.length > 0 || logoUrl) {
          await updateRestaurant(created.id, {
            ...(imageUrls.length > 0 && { images: imageUrls }),
            ...(logoUrl           && { logo: logoUrl }),
          })
        }
      } catch (imgErr) {
        // Storage upload failed — restaurant still created; images can
        // be added later once the storage bucket is configured.
        console.warn('[CreateRestaurant] Image upload skipped:', imgErr.message)
      }

      setCreatedSlug(slug)
      setSuccess(true)
    } catch (err) {
      console.error('[CreateRestaurant] Fatal error:', err)
      setSubmitError(err.message || 'Failed to create restaurant. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    const websiteUrl = `https://menu.exzibo.online/${createdSlug}/home/1`
    return (
      <div style={{
        minHeight: '100vh', background: '#0B0B0B',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif", padding: '24px',
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
            Restaurant Created!
          </div>
          <div style={{ fontSize: '14px', color: '#555', marginBottom: '28px', lineHeight: 1.6 }}>
            Your restaurant website is live. The details you filled in are now connected to your customer page.
          </div>

          {/* URL Preview */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '10px 14px', marginBottom: '24px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '11px', color: '#555' }}>Your URL:</span>
            <span style={{ fontSize: '12px', color: '#E8321A', fontFamily: 'monospace', fontWeight: 600 }}>
              {websiteUrl}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a
              href={websiteUrl}
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
              View Customer Page →
            </a>
            <button
              onClick={() => navigate('/restaurants')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px', padding: '14px',
                color: '#ccc', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              My Restaurants
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B0B0B',
      color: '#fff',
      fontFamily: 'inherit',
      position: 'relative',
    }}>
      <style>{`
        .forge-input {
          width: 100%;
          padding: 13px 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          color: #ccc;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
          font-family: inherit;
        }
        .forge-input::placeholder { color: #3a3a3a; }
        .forge-input:focus {
          border-color: rgba(255,59,48,0.5);
          box-shadow: 0 0 0 3px rgba(255,59,48,0.1);
        }
        .forge-textarea {
          width: 100%;
          padding: 13px 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          color: #ccc;
          font-size: 14px;
          outline: none;
          resize: vertical;
          min-height: 110px;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
          font-family: inherit;
          line-height: 1.6;
        }
        .forge-textarea::placeholder { color: #3a3a3a; }
        .forge-textarea:focus {
          border-color: rgba(255,59,48,0.5);
          box-shadow: 0 0 0 3px rgba(255,59,48,0.1);
        }
        .forge-label {
          display: block;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.18em;
          color: #555;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .error-msg {
          font-size: 11px;
          color: #FF3B30;
          margin-top: 5px;
          font-weight: 500;
        }
        @keyframes fadeScale {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div style={{ animation: 'fadeScale 0.35s ease' }}>
        <FormHeader />

        <div style={{
          maxWidth: '1120px',
          margin: '0 auto',
          padding: '0 40px 160px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '40px' }}>
            <LeftSection
              form={form} set={set} errors={errors}
              addTable={addTable} removeTable={removeTable}
              logoInputRef={logoInputRef}
              logoDragging={logoDragging} setLogoDragging={setLogoDragging}
              handleLogoFile={handleLogoFile}
              linkName={linkName}
              setLinkName={setLinkName}
              setLinkNameManual={setLinkNameManual}
              slugify={slugify}
              linkStatus={linkStatus}
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

          {/* Plan Selection */}
          <div style={{
            marginBottom: '28px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '18px',
            padding: '28px',
          }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>
                Subscription Plan
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                Choose Your Plan
              </div>
              <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                You can upgrade or change your plan at any time.
              </div>
            </div>
            <PlanSelector
              selected={form.selectedPlan}
              onChange={val => set('selectedPlan', val)}
              limits={form.planLimits}
              onLimitsChange={val => set('planLimits', val)}
            />
          </div>
        </div>

        {submitError && (
          <div style={{
            maxWidth: '1120px', margin: '0 auto 24px', padding: '0 40px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '14px 18px', borderRadius: '14px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            }}>
              <span style={{ fontSize: '16px', lineHeight: 1 }}>⚠️</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#EF4444', marginBottom: '4px' }}>
                  Restaurant creation failed
                </div>
                <div style={{ fontSize: '12px', color: '#999', lineHeight: 1.5 }}>
                  {submitError}
                </div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                  Make sure you have run the database migration in Supabase (see <code style={{ color: '#E8321A' }}>supabase/migration_restaurants.sql</code>).
                </div>
              </div>
            </div>
          </div>
        )}
        <FooterCTA onGenerate={handleGenerate} submitting={submitting} linkStatus={linkStatus} />
      </div>
    </div>
  )
}

function FormHeader() {
  return (
    <div style={{
      padding: '28px 40px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      maxWidth: '1120px',
      margin: '0 auto',
    }}>
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: '#FF3B30', textTransform: 'uppercase', marginBottom: '10px' }}>
          Culinary Noir
        </div>
        <h1 style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 900, lineHeight: 1.05, marginBottom: '8px' }}>
          Forge Your <span style={{ color: '#FF3B30', textShadow: '0 0 40px rgba(255,59,48,0.4)' }}>Legacy.</span>
        </h1>
        <p style={{ fontSize: '13px', color: '#555', maxWidth: '460px', lineHeight: 1.6 }}>
          Transform your culinary vision into a high-performance digital presence.<br />
          Provide your details below to generate your bespoke noir-themed experience.
        </p>
      </div>
    </div>
  )
}

function LeftSection({ form, set, errors, addTable, removeTable, logoInputRef, logoDragging, setLogoDragging, handleLogoFile, linkName, setLinkName, setLinkNameManual, slugify, linkStatus }) {
  const displayLink = linkName || '[linkname]'

  const inputBorderColor =
    linkStatus === 'available' ? 'rgba(74,222,128,0.5)' :
    linkStatus === 'taken'     ? 'rgba(239,68,68,0.5)'  :
    'rgba(255,255,255,0.08)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SectionBlock label="Establishment Identity">
        <input
          className="forge-input"
          placeholder="Enter restaurant name"
          value={form.restaurantName}
          onChange={e => set('restaurantName', e.target.value)}
          style={{ fontSize: '15px' }}
        />
        {errors.restaurantName && <div className="error-msg">{errors.restaurantName}</div>}

        <div style={{ marginTop: '14px' }}>
          <div style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em',
            color: '#555', textTransform: 'uppercase', marginBottom: '8px',
          }}>
            Permanent Link
          </div>

          {/* Locked slug display */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '11px 14px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${
              linkStatus === 'available' ? 'rgba(74,222,128,0.35)' :
              linkStatus === 'taken'     ? 'rgba(239,68,68,0.35)'  :
              'rgba(255,255,255,0.07)'
            }`,
            borderRadius: '10px',
            boxShadow: linkStatus === 'available'
              ? '0 0 12px rgba(74,222,128,0.06)'
              : linkStatus === 'taken'
              ? '0 0 12px rgba(239,68,68,0.06)'
              : 'none',
            transition: 'border-color 0.25s, box-shadow 0.25s',
            minHeight: '44px',
          }}>
            <span style={{ fontSize: '14px', flexShrink: 0, lineHeight: 1 }}>🔐</span>
            <span style={{
              fontFamily: 'monospace', fontSize: '13px', fontWeight: 700,
              color: linkName ? '#fff' : '#3a3a3a',
              letterSpacing: '0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {linkName ? `/${linkName}` : '/[linkname]'}
            </span>
            {linkStatus === 'checking' && (
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                border: '1.5px solid rgba(255,255,255,0.15)',
                borderTopColor: '#666',
                animation: 'spin 0.7s linear infinite',
                display: 'inline-block',
              }} />
            )}
            {linkStatus === 'available' && (
              <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: 800, flexShrink: 0 }}>✔</span>
            )}
            {linkStatus === 'taken' && (
              <span style={{ color: '#EF4444', fontSize: '12px', fontWeight: 800, flexShrink: 0 }}>✖</span>
            )}
          </div>

          {/* Availability status text */}
          {linkName && linkStatus !== 'idle' && (
            <div style={{
              marginTop: '6px',
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em',
            }}>
              {linkStatus === 'checking' && <span style={{ color: '#555' }}>Checking availability…</span>}
              {linkStatus === 'available' && <span style={{ color: '#4ade80' }}>✔ This link name is available</span>}
              {linkStatus === 'taken' && <span style={{ color: '#EF4444' }}>✖ This link name is already taken</span>}
            </div>
          )}

          {/* Live URL preview */}
          <div style={{
            marginTop: '8px',
            padding: '9px 13px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', gap: '8px',
            overflow: 'hidden',
          }}>
            <Globe size={12} style={{ color: '#444', flexShrink: 0 }} />
            <span style={{
              fontSize: '11px', color: '#444',
              fontFamily: 'monospace', letterSpacing: '0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <span style={{ color: '#555' }}>https://menu.exzibo.online/</span>
              <span style={{ color: linkName ? '#FF3B30' : '#3a3a3a', fontWeight: 700 }}>
                {linkName || '[linkname]'}
              </span>
              <span style={{ color: '#555' }}>/home/1</span>
            </span>
          </div>
        </div>
      </SectionBlock>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <SectionBlock label="Mobile Number">
          <input className="forge-input" placeholder="+91 00000 00000" value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} />
        </SectionBlock>
        <SectionBlock label="GST Details (Optional)">
          <input className="forge-input" placeholder="GSTIN/UIN" value={form.gstDetails} onChange={e => set('gstDetails', e.target.value)} />
        </SectionBlock>
      </div>

      <SectionBlock label="Table Management">
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            className="forge-input"
            placeholder="Table Number"
            value={form.tableInput}
            onChange={e => set('tableInput', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTable()}
            style={{ flex: 1 }}
          />
          <button
            onClick={addTable}
            style={{
              padding: '0 20px',
              background: '#FF3B30',
              border: 'none', borderRadius: '10px',
              color: '#fff', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(255,59,48,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            Add
          </button>
        </div>
        {form.tableNumbers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
            {form.tableNumbers.map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(255,59,48,0.1)',
                border: '1px solid rgba(255,59,48,0.25)',
                borderRadius: '8px', padding: '5px 10px',
                fontSize: '12px', fontWeight: 600, color: '#FF3B30',
              }}>
                {t}
                <Trash2 size={11} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => removeTable(t)} />
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
          style={{
            border: `2px dashed ${logoDragging ? 'rgba(255,59,48,0.6)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '14px',
            padding: '28px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: logoDragging ? 'rgba(255,59,48,0.04)' : 'transparent',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {form.logo ? (
            <img src={form.logo.url} alt="logo" style={{ height: '70px', objectFit: 'contain', borderRadius: '8px' }} />
          ) : (
            <>
              <Upload size={22} color="#3a3a3a" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '12px', color: '#3a3a3a', fontWeight: 500 }}>Drop Logo</div>
            </>
          )}
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleLogoFile(e.target.files[0])} />
        </div>
      </SectionBlock>

      <SectionBlock label="Culinary Philosophy">
        <textarea
          className="forge-textarea"
          placeholder="Describe the atmosphere, the cuisine, and the soul of your restaurant..."
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
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
          style={{
            border: `2px dashed ${imgDragging ? 'rgba(255,59,48,0.6)' : errors.uploadedImages ? 'rgba(255,59,48,0.5)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '14px',
            minHeight: '180px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: imgDragging ? 'rgba(255,59,48,0.04)' : 'transparent',
            overflow: 'hidden',
          }}
        >
          {form.uploadedImages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '180px' }}>
              <Upload size={24} color="#3a3a3a" style={{ marginBottom: '10px' }} />
              <div style={{ fontSize: '13px', color: '#3a3a3a', fontWeight: 500 }}>Drop restaurant images here</div>
              <div style={{ fontSize: '11px', color: '#2a2a2a', marginTop: '4px' }}>or click to browse</div>
            </div>
          ) : (
            <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {form.uploadedImages.map((img, idx) => (
                <div key={idx} style={{ position: 'relative', paddingTop: '66%', borderRadius: '8px', overflow: 'hidden' }}>
                  <img src={img.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={e => { e.stopPropagation(); removeImage(idx) }}
                    style={{
                      position: 'absolute', top: '4px', right: '4px',
                      background: 'rgba(0,0,0,0.7)', border: 'none',
                      borderRadius: '6px', color: '#fff', cursor: 'pointer',
                      display: 'flex', padding: '4px',
                    }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <div
                onClick={e => { e.stopPropagation(); imgInputRef.current?.click() }}
                style={{
                  paddingTop: '66%',
                  borderRadius: '8px',
                  border: '1px dashed rgba(255,59,48,0.3)',
                  background: 'rgba(255,59,48,0.04)',
                  position: 'relative', cursor: 'pointer',
                }}
              >
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={18} color="rgba(255,59,48,0.5)" />
                </div>
              </div>
            </div>
          )}
          <input ref={imgInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleImgFiles(e.target.files)} />
        </div>
        {errors.uploadedImages && <div className="error-msg">{errors.uploadedImages}</div>}
      </SectionBlock>

      <InfoCard icon={<ChefHat size={14} />} label="Executive Chef Bio">
        <textarea
          className="forge-textarea"
          placeholder="Tell the chef's journey..."
          value={form.chefInfo}
          onChange={e => set('chefInfo', e.target.value)}
          style={{ minHeight: '88px' }}
        />
      </InfoCard>

      <InfoCard icon={<Users size={14} />} label="Hospitality Standard">
        <textarea
          className="forge-textarea"
          placeholder="Describe the interaction, service and guest experience..."
          value={form.servantInfo}
          onChange={e => set('servantInfo', e.target.value)}
          style={{ minHeight: '88px' }}
        />
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
    <div style={{
      marginBottom: '28px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '18px',
      padding: '24px 28px',
    }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#555', textTransform: 'uppercase', textAlign: 'center', marginBottom: '18px' }}>
        Connect Digital Footprint
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {links.map(({ key, icon, placeholder }) => (
          <div key={key} style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
              color: '#444', pointerEvents: 'none', display: 'flex',
            }}>{icon}</div>
            <input
              className="forge-input"
              placeholder={placeholder}
              value={form.socialLinks[key]}
              onChange={e => setSocial(key, e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '12px' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function BottomCards({ form, set }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
      <Card label="Automation">
        <div style={{ marginBottom: '14px' }}>
          <label className="forge-label">Digital Menu Link</label>
          <input
            className="forge-input"
            placeholder="Your service portal (Swiggy, etc.)"
            value={form.digitalMenuLink}
            onChange={e => set('digitalMenuLink', e.target.value)}
            style={{ fontSize: '12px' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ccc' }}>Digital Service Bell</span>
          <Toggle
            value={form.digitalServiceBell}
            onChange={v => set('digitalServiceBell', v)}
          />
        </div>
      </Card>

      <Card label="Reputation">
        <label className="forge-label">Google Rating</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#FFB800', display: 'flex' }}>
            <Star size={13} fill="#FFB800" />
          </div>
          <input
            className="forge-input"
            placeholder="e.g. 4/5"
            value={form.rating}
            onChange={e => set('rating', e.target.value)}
            style={{ paddingLeft: '32px', fontSize: '12px' }}
          />
        </div>
      </Card>

      <Card label="Map Anchor">
        <label className="forge-label">Location</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555', display: 'flex' }}>
            <MapPin size={13} />
          </div>
          <input
            className="forge-input"
            placeholder="e.g. Cyber City, Gurugram"
            value={form.location}
            onChange={e => set('location', e.target.value)}
            style={{ paddingLeft: '32px', fontSize: '12px' }}
          />
        </div>
      </Card>
    </div>
  )
}

function AdditionalSection({ form, set }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label className="forge-label">Additional Intelligence</label>
      <textarea
        className="forge-textarea"
        placeholder="Dietary preferences, dress code, valet parking instructions, or local landmarks..."
        value={form.additionalInfo}
        onChange={e => set('additionalInfo', e.target.value)}
        style={{ minHeight: '90px' }}
      />
    </div>
  )
}

function FooterCTA({ onGenerate, submitting, linkStatus }) {
  const [hovered, setHovered] = useState(false)
  const blocked = submitting || linkStatus === 'taken' || linkStatus === 'checking'
  return (
    <div style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      padding: '20px 40px',
      background: 'linear-gradient(to top, #0B0B0B 70%, transparent)',
      display: 'flex',
      justifyContent: 'center',
      zIndex: 50,
    }}>
      <button
        onClick={onGenerate}
        disabled={blocked}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '18px 56px',
          background: blocked ? 'rgba(255,59,48,0.4)' : '#FF3B30',
          border: `2px solid ${linkStatus === 'taken' ? 'rgba(239,68,68,0.5)' : '#FF3B30'}`,
          borderRadius: '50px',
          color: blocked ? 'rgba(255,255,255,0.5)' : '#fff',
          fontSize: '14px', fontWeight: 800, letterSpacing: '0.12em',
          cursor: blocked ? 'not-allowed' : 'pointer',
          boxShadow: hovered && !blocked ? '0 0 50px rgba(255,59,48,0.55)' : '0 0 30px rgba(255,59,48,0.3)',
          transition: 'all 0.25s',
          textTransform: 'uppercase',
        }}
      >
        {submitting ? (
          <>
            <span style={{
              width: '16px', height: '16px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', display: 'inline-block',
            }} />
            GENERATING...
          </>
        ) : linkStatus === 'taken' ? (
          <>
            <span style={{ fontSize: '16px', lineHeight: 1 }}>✖</span>
            LINK NAME TAKEN
          </>
        ) : linkStatus === 'checking' ? (
          <>
            <span style={{
              width: '16px', height: '16px',
              border: '2px solid rgba(255,255,255,0.2)',
              borderTopColor: 'rgba(255,255,255,0.6)', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', display: 'inline-block',
            }} />
            CHECKING...
          </>
        ) : (
          <>
            <Zap size={16} />
            GENERATE WEBSITE
          </>
        )}
      </button>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: '44px', height: '24px',
        borderRadius: '12px',
        background: value ? '#FF3B30' : 'rgba(255,255,255,0.1)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        boxShadow: value ? '0 0 12px rgba(255,59,48,0.4)' : 'none',
      }}
    >
      <div style={{
        position: 'absolute',
        top: '3px',
        left: value ? '23px' : '3px',
        width: '18px', height: '18px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </div>
  )
}

function SectionBlock({ label, children }) {
  return (
    <div>
      {label && <label className="forge-label">{label}</label>}
      {children}
    </div>
  )
}

function Card({ label, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '16px',
      padding: '20px',
    }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#555', textTransform: 'uppercase', marginBottom: '16px' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function InfoCard({ icon, label, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '16px',
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{
          color: '#FF3B30',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '26px', height: '26px',
          background: 'rgba(255,59,48,0.1)',
          borderRadius: '8px',
        }}>{icon}</div>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: '#888', textTransform: 'uppercase' }}>{label}</span>
      </div>
      {children}
    </div>
  )
}
