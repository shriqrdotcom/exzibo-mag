import React, { useState, useEffect, useRef } from 'react'
import { X, ThumbsUp, ThumbsDown } from 'lucide-react'
import { createHelpNotification } from '../lib/db'

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
const YELLOW = '#F5C518'
const YELLOW_SHADOW = 'rgba(245,197,24,0.35)'
const YELLOW_BG = 'rgba(245,197,24,0.14)'
const YELLOW_BORDER = '#F5C518'

export default function HelpBottomSheet({ isOpen, onClose, restaurantName = 'Unknown', userRole = 'Admin' }) {
  const [feedback, setFeedback] = useState(null)
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [animIn, setAnimIn] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimIn(true))
      })
      document.body.style.overflow = 'hidden'
    } else {
      setAnimIn(false)
      const t = setTimeout(() => {
        setVisible(false)
        document.body.style.overflow = ''
      }, 320)
      return () => clearTimeout(t)
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  function handleClose() {
    setError('')
    onClose()
  }

  function handleReset() {
    setFeedback(null)
    setText('')
    setError('')
    setSubmitted(false)
    setSubmitting(false)
  }

  async function handleSubmit() {
    if (!feedback) {
      setError('Please select Helpful or Not helpful.')
      return
    }
    if (!text.trim()) {
      setError('Please write a short message before submitting.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await createHelpNotification({
        restaurant_name: restaurantName,
        user_role: userRole,
        message: text.trim(),
      })
    } catch (e) {
      console.warn('[HelpBottomSheet] could not save to DB, continuing:', e.message)
    } finally {
      setSubmitting(false)
      setSubmitted(true)
    }
  }

  if (!visible) return null

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: animIn ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
        backdropFilter: animIn ? 'blur(3px)' : 'blur(0px)',
        transition: 'background 0.32s ease, backdrop-filter 0.32s ease',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Sheet panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#ffffff',
          borderRadius: '24px 24px 0 0',
          padding: '0 0 max(24px, env(safe-area-inset-bottom)) 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          transform: animIn ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          fontFamily: FONT,
          position: 'relative',
          willChange: 'transform',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: '36px',
          height: '4px',
          background: 'rgba(0,0,0,0.12)',
          borderRadius: '99px',
          margin: '12px auto 0',
        }} />

        {submitted ? (
          /* ── Thank you state ── */
          <div style={{
            padding: '32px 24px 28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: YELLOW_BG,
              border: `1.5px solid ${YELLOW_BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
            }}>
              🎉
            </div>
            <div style={{ fontWeight: 800, fontSize: '20px', color: '#111', letterSpacing: '-0.01em' }}>
              Thank you!
            </div>
            <div style={{ fontSize: '13px', color: '#888', fontWeight: 500, lineHeight: 1.5 }}>
              Your feedback has been sent to the team and will appear in the notification panel.
            </div>
            <button
              onClick={() => { handleReset(); handleClose() }}
              style={{
                marginTop: '8px',
                padding: '13px 36px',
                background: YELLOW,
                border: 'none',
                borderRadius: '99px',
                color: '#111',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: `0 4px 20px ${YELLOW_SHADOW}`,
                fontFamily: FONT,
              }}
            >
              DONE
            </button>
          </div>
        ) : (
          /* ── Main form ── */
          <div style={{ padding: '20px 24px 28px' }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}>
              <div style={{ fontWeight: 800, fontSize: '20px', color: '#111', letterSpacing: '-0.01em' }}>
                Help us improve
              </div>
              <button
                onClick={handleClose}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.06)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label="Close"
              >
                <X size={15} color="#888" />
              </button>
            </div>

            {/* Feedback toggle buttons */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                onClick={() => { setFeedback('helpful'); setError('') }}
                style={{
                  flex: 1,
                  padding: '12px 10px',
                  borderRadius: '14px',
                  border: feedback === 'helpful'
                    ? `1.5px solid ${YELLOW_BORDER}`
                    : '1.5px solid rgba(0,0,0,0.1)',
                  background: feedback === 'helpful'
                    ? YELLOW_BG
                    : 'rgba(0,0,0,0.03)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.18s ease',
                  fontFamily: FONT,
                }}
              >
                <ThumbsUp
                  size={17}
                  color={feedback === 'helpful' ? '#b8940a' : '#888'}
                  fill={feedback === 'helpful' ? YELLOW_BG : 'none'}
                />
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: feedback === 'helpful' ? '#b8940a' : '#555',
                  letterSpacing: '0.02em',
                }}>
                  Helpful
                </span>
              </button>

              <button
                onClick={() => { setFeedback('not_helpful'); setError('') }}
                style={{
                  flex: 1,
                  padding: '12px 10px',
                  borderRadius: '14px',
                  border: feedback === 'not_helpful'
                    ? `1.5px solid ${YELLOW_BORDER}`
                    : '1.5px solid rgba(0,0,0,0.1)',
                  background: feedback === 'not_helpful'
                    ? YELLOW_BG
                    : 'rgba(0,0,0,0.03)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.18s ease',
                  fontFamily: FONT,
                }}
              >
                <ThumbsDown
                  size={17}
                  color={feedback === 'not_helpful' ? '#b8940a' : '#888'}
                  fill={feedback === 'not_helpful' ? YELLOW_BG : 'none'}
                />
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: feedback === 'not_helpful' ? '#b8940a' : '#555',
                  letterSpacing: '0.02em',
                }}>
                  Not helpful
                </span>
              </button>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => { setText(e.target.value); setError('') }}
              placeholder="Tell us what can be improved..."
              rows={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.03)',
                border: error && !text.trim()
                  ? '1.5px solid #e53935'
                  : '1.5px solid rgba(0,0,0,0.1)',
                borderRadius: '14px',
                padding: '14px 16px',
                color: '#111',
                fontSize: '14px',
                fontWeight: 500,
                fontFamily: FONT,
                resize: 'none',
                outline: 'none',
                lineHeight: 1.6,
                transition: 'border-color 0.18s ease',
              }}
              onFocus={e => { e.target.style.borderColor = YELLOW_BORDER }}
              onBlur={e => {
                e.target.style.borderColor = error && !text.trim()
                  ? '#e53935'
                  : 'rgba(0,0,0,0.1)'
              }}
            />

            {/* Error message */}
            {error && (
              <div style={{
                fontSize: '12px',
                color: '#e53935',
                fontWeight: 600,
                marginTop: '8px',
                paddingLeft: '2px',
              }}>
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                onClick={() => { handleReset(); handleClose() }}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: 'rgba(0,0,0,0.04)',
                  border: '1.5px solid rgba(0,0,0,0.1)',
                  borderRadius: '14px',
                  color: '#555',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  letterSpacing: '0.02em',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
              >
                Cancel
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: submitting ? 'rgba(245,197,24,0.5)' : YELLOW,
                  border: 'none',
                  borderRadius: '14px',
                  color: '#111',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontFamily: FONT,
                  letterSpacing: '0.04em',
                  boxShadow: submitting ? 'none' : `0 4px 20px ${YELLOW_SHADOW}`,
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={e => { if (!submitting) e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
