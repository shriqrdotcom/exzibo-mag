import React, { useState } from 'react'
import { createBooking } from '../lib/db'
import { Users, Calendar, Clock, ChevronDown, Minus, Plus } from 'lucide-react'

const OCCASIONS = ['Casual Dining', 'Birthday', 'Anniversary', 'Business', 'Date Night', 'Other']
const SEATING_OPTIONS = ['Indoor', 'Outdoor', 'Private']

export default function AddBookingPanel({
  restaurantId,
  accentStart,
  accentEnd,
  onBack,
  showToast,
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('19:00')
  const [guests, setGuests] = useState(2)
  const [occasion, setOccasion] = useState('Casual Dining')
  const [seating, setSeating] = useState('Indoor')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function adjustGuests(delta) {
    setGuests(g => Math.max(1, Math.min(50, g + delta)))
  }

  async function handleSubmit() {
    if (!name.trim()) { showToast('Please enter a name'); return }
    if (!date) { showToast('Please select a date'); return }
    if (!time) { showToast('Please select a time'); return }

    setSubmitting(true)
    try {
      const booking = {
        id: `STAFF-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        date,
        time,
        guests,
        occasion: occasion || null,
        seating: seating || null,
        notes: notes.trim() || null,
        status: 'pending',
      }
      await createBooking(restaurantId, booking)
      showToast('Booking confirmed')
      onBack()
    } catch (e) {
      console.error('[AddBooking] submit failed:', e)
      showToast('Failed to create booking')
    } finally {
      setSubmitting(false)
    }
  }

  const inputBase = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px 16px',
    borderRadius: '14px',
    border: '1px solid rgba(226,232,240,0.9)',
    fontSize: '15px',
    fontWeight: 600,
    color: '#0f172a',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
  }

  const labelBase = {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#94A3B8',
    marginBottom: '8px',
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .add-booking-title {
            font-size: 22px !important;
          }
          .add-booking-row {
            flex-direction: column !important;
          }
          .add-booking-row > * {
            width: 100% !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '140px' }}>

        {/* Title */}
        <div style={{ padding: '24px 4px 8px' }}>
          <h1 className="add-booking-title" style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            ADD BOOKING
          </h1>
        </div>

        {/* Name */}
        <div>
          <div style={labelBase}>Full Name</div>
          <input
            placeholder="Full Name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputBase}
          />
        </div>

        {/* Phone */}
        <div>
          <div style={labelBase}>Phone Number</div>
          <input
            placeholder="Phone Number"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            style={inputBase}
          />
        </div>

        {/* Email */}
        <div>
          <div style={labelBase}>Email Address</div>
          <input
            placeholder="Email Address"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputBase}
          />
        </div>

        {/* Date + Time row */}
        <div className="add-booking-row" style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={labelBase}>
              <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Date
            </div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ ...inputBase, paddingRight: '12px' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelBase}>
              <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Time
            </div>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              style={{ ...inputBase, paddingRight: '12px' }}
            />
          </div>
        </div>

        {/* Guests */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={labelBase}>
              <Users size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Number of Guests
            </div>
            <span style={{ fontSize: '18px', fontWeight: 900, color: accentStart }}>{guests}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fff', borderRadius: '14px', padding: '10px 16px',
            border: '1px solid rgba(226,232,240,0.9)',
          }}>
            <button
              onClick={() => adjustGuests(-1)}
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(239,68,68,0.10)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#ef4444',
              }}
            >
              <Minus size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              <Users size={16} color={accentStart} />
              {guests}
            </div>
            <button
              onClick={() => adjustGuests(1)}
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff',
                boxShadow: `0 2px 8px ${accentStart}50`,
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Occasion */}
        <div>
          <div style={labelBase}>Occasion</div>
          <div style={{ position: 'relative' }}>
            <select
              value={occasion}
              onChange={e => setOccasion(e.target.value)}
              style={{ ...inputBase, appearance: 'none', paddingRight: '40px', cursor: 'pointer' }}
            >
              {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={16} color="#94A3B8" style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Seating Preference */}
        <div>
          <div style={labelBase}>Seating Preference</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {SEATING_OPTIONS.map(opt => {
              const active = seating === opt
              return (
                <button
                  key={opt}
                  onClick={() => setSeating(opt)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '14px',
                    border: active ? 'none' : '1px solid rgba(226,232,240,0.9)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: active ? 800 : 600,
                    color: active ? '#fff' : '#64748b',
                    background: active ? `linear-gradient(135deg, ${accentStart}, ${accentEnd})` : '#fff',
                    boxShadow: active ? `0 4px 12px ${accentStart}50` : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div style={labelBase}>Special Requests (optional)</div>
          <textarea
            placeholder="Any special requests or notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputBase, resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        {/* Confirm button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            border: 'none',
            cursor: submitting ? 'wait' : 'pointer',
            fontSize: '15px',
            fontWeight: 800,
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: `linear-gradient(135deg, ${accentStart}, ${accentEnd})`,
            boxShadow: `0 6px 20px ${accentStart}60`,
            opacity: submitting ? 0.7 : 1,
            transition: 'opacity 0.2s',
            marginTop: '8px',
          }}
        >
          {submitting ? 'Confirming...' : 'Confirm Booking'}
        </button>

      </div>
    </>
  )
}
