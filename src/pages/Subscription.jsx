import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'
import PlanSelector from '../components/PlanSelector'
import { readRestaurantDraft, persistRestaurantDraft } from './restaurantDraft'

const fallback = {
  selectedPlan: 'STARTER',
  planLimits: {
    STARTER: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
    GROWTH: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
    SCALE: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
    CUSTOMISED: { totalTables: 0, ownerPanelUsers: 0, managerPanelUsers: 0, employeeSectionUsers: 0 },
  },
}

export default function Subscription() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => readRestaurantDraft(fallback))
  const update = patch => {
    setDraft(current => {
      const next = { ...current, ...patch }
      persistRestaurantDraft(next)
      return next
    })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0B0B0B', color: '#fff' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <AdminHeader title="Restaurant Operations" subtitle="Subscription" />
        <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 40px 120px' }}>
          <div style={{ maxWidth: 650, marginBottom: 36 }}>
            <div style={{ color: '#FF3B30', fontSize: 10, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', marginBottom: 12 }}>Entitlement control</div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 58px)', lineHeight: 1, margin: 0, fontWeight: 900 }}>Choose the operating room.</h1>
            <p style={{ color: '#777', lineHeight: 1.7, fontSize: 14, marginTop: 18 }}>Set the access ceiling for this restaurant before it goes live. Limits are kept with your creation draft until the server confirms the platform update.</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, padding: 28 }}>
            <PlanSelector
              selected={draft.selectedPlan}
              onChange={selectedPlan => update({ selectedPlan })}
              limits={draft.planLimits}
              onLimitsChange={planLimits => update({ planLimits })}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 28 }}>
            <button type="button" data-testid="back-to-create" onClick={() => navigate('/create-restaurant')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, color: '#bbb', padding: '13px 18px', cursor: 'pointer', fontWeight: 700 }}>Back to restaurant details</button>
            <button type="button" data-testid="continue-to-create" onClick={() => navigate('/create-restaurant')} style={{ background: '#FF3B30', border: 0, borderRadius: 10, color: '#fff', padding: '13px 22px', cursor: 'pointer', fontWeight: 800 }}>Continue to create restaurant</button>
          </div>
        </section>
      </main>
    </div>
  )
}