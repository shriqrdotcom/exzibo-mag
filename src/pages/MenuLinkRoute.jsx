import React, { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { getMenuSubdomain, buildMenuBaseUrl } from '../lib/routeConfig'

const PRODUCTION_DOMAIN = 'exzibo.online'

function isOnMenuSubdomain(subdomain) {
  const hostname = window.location.hostname
  return hostname === `${subdomain}.${PRODUCTION_DOMAIN}`
}

function isProductionHost() {
  const hostname = window.location.hostname
  return (
    hostname === PRODUCTION_DOMAIN ||
    hostname.endsWith(`.${PRODUCTION_DOMAIN}`)
  )
}

export default function MenuLinkRoute() {
  const { linkName, tableNumber } = useParams()
  const [redirectUrl, setRedirectUrl] = useState(null)
  const [checked, setChecked] = useState(false)

  const restaurants = (() => {
    try { return JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]') }
    catch { return [] }
  })()

  const match = restaurants.find(r => {
    const saved = localStorage.getItem(`exzibo_link_name_${r.uid || r.id}`)
    return saved && saved === linkName
  })

  useEffect(() => {
    if (!match) { setChecked(true); return }

    // Only redirect to subdomain in production — never on localhost/Replit dev
    if (!isProductionHost()) { setChecked(true); return }

    getMenuSubdomain().then(subdomain => {
      // Already on the correct subdomain — no redirect needed
      if (isOnMenuSubdomain(subdomain)) { setChecked(true); return }

      // Build the redirect URL: {subdomain}.exzibo.online/{slug}[/{tableNumber}]
      const base = buildMenuBaseUrl(subdomain)
      const slug = match.slug || match.id
      const tableSegment = tableNumber ? `/${encodeURIComponent(tableNumber)}` : ''
      setRedirectUrl(`${base}/${slug}${tableSegment}`)
      setChecked(true)
    }).catch(() => {
      setChecked(true)
    })
  }, [linkName, tableNumber, match])

  if (!checked) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0A0A0A',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          border: '3px solid rgba(232,50,26,0.2)',
          borderTopColor: '#E8321A',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Hard redirect to subdomain URL (replaces history entry for 301-style UX)
  if (redirectUrl) {
    window.location.replace(redirectUrl)
    return null
  }

  if (!match) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0A0A0A',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#aaa', fontFamily: "'Inter', sans-serif", padding: '24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '380px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Link not found</div>
          <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>
            No restaurant is bound to "{linkName}". Please check the URL.
          </p>
        </div>
      </div>
    )
  }

  const slug = match.slug || match.id
  const qs = tableNumber ? `?table=${encodeURIComponent(tableNumber)}` : ''
  return <Navigate to={`/restaurant/${slug}${qs}`} replace />
}
