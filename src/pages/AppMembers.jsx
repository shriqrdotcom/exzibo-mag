import React, { useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import { ChevronDown, Plus, Search, Store, X } from 'lucide-react'
import './AppMembers.css'

const ROLES = ['Owner', 'Admin', 'Manager', 'Staff']
const STATUSES = ['Pending', 'Active', 'Suspended']

const INITIAL_RESTAURANTS = [
  { id: 1, name: 'The Bombay Canteen', uid: '4827193056', members: 5, mark: 'BC' },
  { id: 2, name: 'Kosha Kitchen', uid: '7316049285', members: 3, mark: 'KK' },
  { id: 3, name: 'Mizu Dining Room', uid: '9061824730', members: 8, mark: 'MD' },
  { id: 4, name: 'Olive & Ember', uid: '1548372069', members: 2, mark: 'OE' },
  { id: 5, name: 'Saffron Social', uid: '6284901731', members: 6, mark: 'SS' },
  { id: 6, name: 'Juniper House', uid: '8437162059', members: 4, mark: 'JH' },
]

const emptyForm = {
  uid: '',
  name: '',
  email: '',
  phone: '',
  role: 'Staff',
  status: 'Pending',
}

function validate(form, selectedRestaurant) {
  const errors = {}
  if (form.uid.length < 10) errors.uid = 'Enter the 10-digit restaurant UID.'
  else if (!selectedRestaurant) errors.uid = 'Restaurant not found'
  if (!form.name.trim()) errors.name = 'Full name is required.'
  if (!/^[^\s@]+@gmail\.com$/i.test(form.email.trim())) errors.email = 'Enter a valid Gmail address.'
  if (!/^\+91[\s-]?[6-9]\d{4}[\s-]?\d{5}$/.test(form.phone.trim())) errors.phone = 'Enter a valid Indian mobile number starting with +91.'
  if (!ROLES.includes(form.role)) errors.role = 'Select a role.'
  if (!STATUSES.includes(form.status)) errors.status = 'Select a status.'
  return errors
}

function RestaurantMark({ restaurant }) {
  return (
    <div className="am-restaurant-mark" aria-hidden="true">
      <Store size={18} strokeWidth={1.6} />
      <span>{restaurant.mark}</span>
    </div>
  )
}

function Field({ label, id, error, children, hint }) {
  return (
    <div className="am-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="am-hint">{hint}</span>}
      {error && <span className="am-error">{error}</span>}
    </div>
  )
}

function AddMemberModal({ restaurants, form, setForm, onClose, onSubmit }) {
  const [submitted, setSubmitted] = useState(false)
  const selectedRestaurant = restaurants.find((item) => item.uid === form.uid)
  const validationErrors = submitted ? validate(form, selectedRestaurant) : {}
  const errors = {
    ...(form.uid.length === 10 && !selectedRestaurant ? { uid: 'Restaurant not found' } : {}),
    ...validationErrors,
  }
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    setSubmitted(true)
    const nextErrors = validate(form, selectedRestaurant)
    if (Object.keys(nextErrors).length === 0) onSubmit(selectedRestaurant)
  }
  const title = selectedRestaurant ? `Add member to ${selectedRestaurant.name}` : 'Add member to a restaurant'

  return (
    <div className="am-overlay" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
      <div className="am-modal">
        <form className="am-form" onSubmit={submit} noValidate>
          <div className="am-modal-heading">
            <div>
              <p className="am-eyebrow">New access</p>
              <h2 id="member-modal-title">{title}</h2>
              <p>Connect a mobile app member to this restaurant.</p>
            </div>
            <button type="button" className="am-icon-button" onClick={onClose} aria-label="Close dialog" data-testid="close-member-modal"><X size={18} /></button>
          </div>

          <Field label="Restaurant UID" id="restaurant-uid" error={errors.uid} hint={form.uid.length > 0 && form.uid.length < 10 ? 'UID must contain exactly 10 digits.' : ''}>
            <input id="restaurant-uid" data-testid="restaurant-uid-input" value={form.uid} onChange={(event) => setForm((current) => ({ ...current, uid: event.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="Enter permanent UID" inputMode="numeric" autoFocus />
            {selectedRestaurant && <span className="am-uid-resolved"><span />{selectedRestaurant.name}</span>}
          </Field>

          <Field label="Full Name" id="member-name" error={errors.name}>
            <input id="member-name" data-testid="member-name-input" value={form.name} onChange={update('name')} placeholder="e.g. Arjun Mehta" />
          </Field>

          <Field label="Gmail ID" id="member-email" error={errors.email}>
            <input id="member-email" data-testid="member-email-input" value={form.email} onChange={update('email')} placeholder="name@gmail.com" inputMode="email" />
          </Field>

          <Field label="Phone Noumber" id="member-phone" error={errors.phone}>
            <input id="member-phone" data-testid="member-phone-input" value={form.phone} onChange={update('phone')} placeholder="+91 98765 43210" inputMode="tel" />
          </Field>

          <div className="am-form-grid">
            <Field label="Role" id="member-role" error={errors.role}>
              <div className="am-select-wrap"><select id="member-role" data-testid="member-role-select" value={form.role} onChange={update('role')}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select><ChevronDown size={15} /></div>
            </Field>
            <Field label="Status" id="member-status" error={errors.status}>
              <div className="am-select-wrap"><select id="member-status" data-testid="member-status-select" value={form.status} onChange={update('status')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></div>
            </Field>
          </div>

          <div className="am-modal-actions">
            <button type="button" className="am-button am-button-muted" onClick={onClose} data-testid="cancel-member-button">Cancel</button>
            <button type="submit" className="am-button am-button-primary" disabled={!selectedRestaurant || !form.name.trim() || !/^[^\s@]+@gmail\.com$/i.test(form.email.trim()) || !/^\+91[\s-]?[6-9]\d{4}[\s-]?\d{5}$/.test(form.phone.trim())} data-testid="submit-member-button">Add Member</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AppMembers() {
  const [restaurants, setRestaurants] = useState(INITIAL_RESTAURANTS)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [modalRestaurant, setModalRestaurant] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const visibleRestaurants = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return restaurants
      .filter((restaurant) => !needle || restaurant.name.toLowerCase().includes(needle) || restaurant.uid.includes(needle))
      .sort((a, b) => sort === 'members' ? b.members - a.members || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))
  }, [restaurants, query, sort])

  const openAdd = (restaurant = null) => {
    setModalRestaurant(restaurant)
    setForm({ ...emptyForm, uid: restaurant?.uid || '' })
  }
  const closeModal = () => setModalRestaurant(null)
  const submit = (restaurant) => {
    setRestaurants((current) => current.map((item) => item.id === restaurant.id ? { ...item, members: item.members + 1 } : item))
    closeModal()
  }

  return (
    <div className="am-shell">
      <Sidebar />
      <main className="am-main" aria-label="App members workspace">
        <div className="am-content">
          <header className="am-header">
            <div><p className="am-kicker">Restaurant access</p><h1>App Members</h1><p className="am-subtitle">Connect mobile app members to a restaurant using its permanent UID.</p></div>
          </header>

          <section className="am-directory" aria-label="Restaurants">
            <div className="am-toolbar">
              <div className="am-search"><Search size={17} /><input aria-label="Search restaurants" data-testid="restaurant-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search restaurant name or UID" /></div>
              <div className="am-sort-wrap"><span>Sort by</span><div className="am-select-wrap"><select aria-label="Sort restaurants" data-testid="restaurant-sort-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Restaurant name</option><option value="members">Number of members</option></select><ChevronDown size={15} /></div></div>
            </div>
            <div className="am-list-heading"><span>Restaurant</span><span>Members</span><span aria-hidden="true" /></div>
            <div className="am-restaurant-list">
              {visibleRestaurants.map((restaurant) => (
                <article className="am-restaurant-row" key={restaurant.id} data-testid={`restaurant-row-${restaurant.id}`}>
                  <div className="am-restaurant-identity"><RestaurantMark restaurant={restaurant} /><div><strong>{restaurant.name}</strong><code data-testid={`restaurant-uid-${restaurant.id}`}>{restaurant.uid}</code></div></div>
                  <span className="am-member-count">{restaurant.members} {restaurant.members === 1 ? 'Member' : 'Members'}</span>
                  <button className="am-add-circle" onClick={() => openAdd(restaurant)} title="Add member to this restaurant" aria-label={`Add member to ${restaurant.name}`} data-testid={`add-member-${restaurant.id}`}><Plus size={17} /></button>
                </article>
              ))}
            </div>
            {visibleRestaurants.length === 0 && <div className="am-empty"><div className="am-empty-icon"><Search size={20} /></div><h3>No restaurants found</h3><p>Try a different restaurant name or permanent UID.</p><button className="am-button am-button-muted" onClick={() => setQuery('')} data-testid="clear-restaurant-search">Clear search</button></div>}
            <div className="am-list-footer"><span>Showing {visibleRestaurants.length} of {restaurants.length} restaurants</span><span>Changes are temporary in this workspace</span></div>
          </section>
        </div>
      </main>
      {modalRestaurant !== null && <AddMemberModal restaurants={restaurants} form={form} setForm={setForm} onClose={closeModal} onSubmit={submit} />}
    </div>
  )
}