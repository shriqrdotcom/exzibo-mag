import React from 'react'
import { useParams, Navigate } from 'react-router-dom'

export default function MenuLinkRoute() {
  const { linkName, tableNumber } = useParams()

  const restaurants = (() => {
    try { return JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]') }
    catch { return [] }
  })()

  const match = restaurants.find(r => {
    const saved = localStorage.getItem(`exzibo_link_name_${r.uid || r.id}`)
    return saved && saved === linkName
  })

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
