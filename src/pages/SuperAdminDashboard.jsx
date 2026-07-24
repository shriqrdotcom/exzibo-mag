import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Lock, ArrowLeft } from 'lucide-react'

const STORAGE_KEY = 'exzibo_super_staff'

export default function SuperAdminDashboard() {
  const navigate = useNavigate()

  // Clean up unsafe localStorage staff data on mount.
  // This key stored plaintext passwords and was never backed by a server API.
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#F2F2F7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
        padding: '0 0 28px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-50px', right: '-50px',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20px', left: '40px',
          width: '120px', height: '120px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        }} />

        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '13px',
              background: 'rgba(255,255,255,0.22)',
              border: '1.5px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '22px', color: '#fff', letterSpacing: '-0.02em' }}>
                Manage Staff
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.78)', fontWeight: 500 }}>
                Team member management
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disabled-state card */}
      <div style={{ padding: '20px 16px', maxWidth: '520px', margin: '0 auto' }}>
        <div style={{
          background: '#fff', borderRadius: '20px',
          border: '1px solid #F0F0F5', overflow: 'hidden',
          padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '50%',
            background: '#F0EFFF', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={28} color="#6366F1" strokeWidth={1.5} />
          </div>
          <div style={{ fontWeight: 800, fontSize: '18px', color: '#111', marginBottom: '8px' }}>
            Secure Staff Enrollment
          </div>
          <div style={{
            fontSize: '14px', color: '#888', lineHeight: 1.6, maxWidth: '340px',
            margin: '0 auto',
          }}>
            Secure staff enrollment is not available yet.
          </div>
          <div style={{
            fontSize: '13px', color: '#aaa', lineHeight: 1.5, maxWidth: '320px',
            margin: '12px auto 0',
          }}>
            Use <strong>Team Management</strong> in the restaurant dashboard to add
            team members through the secure membership system.
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: '12px',
              border: '1px solid #E0E0E8', background: '#fff',
              fontWeight: 700, fontSize: '13px', color: '#555',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
