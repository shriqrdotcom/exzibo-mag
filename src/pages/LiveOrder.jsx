import React from 'react'
import { Zap } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import AdminHeader from '../components/AdminHeader'

// Blank placeholder page for the LIVE ORDER dashboard section.
// Content will be built out separately — this establishes the
// route + nav entry only.
export default function LiveOrder() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0A0A' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AdminHeader title="LIVE ORDER" />
        <main style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '36px 40px',
          overflowY: 'auto',
        }}>
          <div style={{ textAlign: 'center', color: '#555' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px',
              background: 'rgba(232,50,26,0.12)',
              border: '1px solid rgba(232,50,26,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Zap size={26} color="#E8321A" />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#888' }}>
              Live Order dashboard coming soon
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
