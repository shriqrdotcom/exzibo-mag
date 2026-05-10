import React from 'react'
import { Info, Zap, ShieldCheck, Database, Globe, Mail } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'

const cards = [
  {
    icon: Zap,
    title: 'Platform Version',
    value: 'Exzibo v1.0',
    sub: 'Latest stable release',
  },
  {
    icon: Globe,
    title: 'Environment',
    value: 'Production',
    sub: 'Hosted on Replit',
  },
  {
    icon: Database,
    title: 'Database',
    value: 'Supabase + Replit PostgreSQL',
    sub: 'Real-time sync enabled',
  },
  {
    icon: ShieldCheck,
    title: 'Auth',
    value: 'Supabase Auth',
    sub: 'Row-level security active',
  },
  {
    icon: Mail,
    title: 'Support',
    value: 'exzibonew@gmail.com',
    sub: 'Reach out for any help',
  },
  {
    icon: Info,
    title: 'License',
    value: 'Private / Proprietary',
    sub: 'All rights reserved',
  },
]

export default function InformationPage() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0A' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="INFORMATION" />
        <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto' }}>

          {/* Page heading */}
          <div style={{ marginBottom: '36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'rgba(232,50,26,0.12)',
                border: '1px solid rgba(232,50,26,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Info size={20} color="#E8321A" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
                  System Information
                </h1>
                <p style={{ margin: 0, fontSize: '13px', color: '#555', marginTop: '3px' }}>
                  Platform details, environment, and support contacts
                </p>
              </div>
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginTop: '20px' }} />
          </div>

          {/* Info cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}>
            {cards.map(({ icon: Icon, title, value, sub }) => (
              <div key={title} style={{
                background: '#111',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                padding: '22px 24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(232,50,26,0.25)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
              >
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                  background: 'rgba(232,50,26,0.08)',
                  border: '1px solid rgba(232,50,26,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} color="#E8321A" />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', color: '#555', textTransform: 'uppercase', marginBottom: '6px' }}>
                    {title}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                    {value}
                  </div>
                  <div style={{ fontSize: '12px', color: '#444' }}>
                    {sub}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </main>
      </div>
    </div>
  )
}
