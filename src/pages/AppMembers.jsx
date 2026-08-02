import React, { Fragment, useMemo, useRef, useState } from 'react'
import Sidebar from '../components/Sidebar'
import { Check, ChevronDown, Copy, Plus, Search, Store, Trash2, UserPlus, X } from 'lucide-react'
import './AppMembers.css'

const ROLES = ['Owner', 'Admin', 'Manager', 'Staff']

const INITIAL_RESTAURANTS = [
  { id: 1, name: 'The Bombay Canteen', uid: '4827193056', members: 5, mark: 'BC' },
  { id: 2, name: 'Kosha Kitchen', uid: '7316049285', members: 3, mark: 'KK' },
  { id: 3, name: 'Mizu Dining Room', uid: '9061824730', members: 8, mark: 'MD' },
  { id: 4, name: 'Olive & Ember', uid: '1548372069', members: 2, mark: 'OE' },
  { id: 5, name: 'Saffron Social', uid: '6284901731', members: 6, mark: 'SS' },
  { id: 6, name: 'Juniper House', uid: '8437162059', members: 4, mark: 'JH' },
]

const MOCK_MEMBER_SEEDS = [
  { name: 'Maya Chen', email: 'maya.chen@gmail.com', phone: '+91 98765 43210', role: 'Owner', status: 'Active' },
  { name: 'Jordan Ellis', email: 'jordan.ellis@gmail.com', phone: '+91 87654 32109', role: 'Admin', status: 'Active' },
  { name: 'Priya Nair', email: 'priya.nair@gmail.com', phone: '+91 76543 21098', role: 'Manager', status: 'Pending' },
  { name: 'Theo Martin', email: 'theo.martin@gmail.com', phone: '+91 65432 10987', role: 'Staff', status: 'Active' },
  { name: 'Lena Ortiz', email: 'lena.ortiz@gmail.com', phone: '+91 98760 12345', role: 'Staff', status: 'Suspended' },
  { name: 'Aarav Kapoor', email: 'aarav.kapoor@gmail.com', phone: '+91 99887 66554', role: 'Admin', status: 'Active' },
  { name: 'Ananya Rao', email: 'ananya.rao@gmail.com', phone: '+91 88776 55443', role: 'Staff', status: 'Active' },
  { name: 'Rohan Shah', email: 'rohan.shah@gmail.com', phone: '+91 77665 44332', role: 'Manager', status: 'Pending' },
  { name: 'Neha Iyer', email: 'neha.iyer@gmail.com', phone: '+91 66554 33221', role: 'Staff', status: 'Active' },
  { name: 'Kabir Mehta', email: 'kabir.mehta@gmail.com', phone: '+91 99876 54321', role: 'Staff', status: 'Suspended' },
]

function createInitialMembers(restaurantId, count, startIndex) {
  return Array.from({ length: count }, (_, index) => ({
    ...MOCK_MEMBER_SEEDS[(startIndex + index) % MOCK_MEMBER_SEEDS.length],
    id: `restaurant-${restaurantId}-member-${index + 1}`,
  }))
}

const INITIAL_MEMBERS_BY_RESTAURANT = Object.fromEntries(
  INITIAL_RESTAURANTS.map((restaurant, index) => [
    restaurant.id,
    createInitialMembers(restaurant.id, restaurant.members, index * 2),
  ]),
)

const emptyForm = {
  uid: '',
  name: '',
  email: '',
  phone: '',
  role: 'Staff',
}

function validate(form, selectedRestaurant) {
  const errors = {}
  if (form.uid.length < 10) errors.uid = 'Enter the 10-digit restaurant UID.'
  else if (!selectedRestaurant) errors.uid = 'Restaurant not found'
  if (!form.name.trim()) errors.name = 'Full name is required.'
  if (!/^[^\s@]+@gmail\.com$/i.test(form.email.trim())) errors.email = 'Enter a valid Gmail address.'
  if (!/^\+91[\s-]?[6-9]\d{4}[\s-]?\d{5}$/.test(form.phone.trim())) errors.phone = 'Enter a valid Indian mobile number starting with +91.'
  if (!ROLES.includes(form.role)) errors.role = 'Select a role.'
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

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Unable to copy text')
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

          <Field label="Phone Number" id="member-phone" error={errors.phone}>
            <input id="member-phone" data-testid="member-phone-input" value={form.phone} onChange={update('phone')} placeholder="+91 98765 43210" inputMode="tel" />
          </Field>

          <Field label="Role" id="member-role" error={errors.role}>
            <div className="am-select-wrap"><select id="member-role" data-testid="member-role-select" value={form.role} onChange={update('role')}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select><ChevronDown size={15} /></div>
          </Field>

          <div className="am-modal-actions">
            <button type="button" className="am-button am-button-muted" onClick={onClose} data-testid="cancel-member-button">Cancel</button>
            <button type="submit" className="am-button am-button-primary" disabled={!selectedRestaurant || !form.name.trim() || !/^[^\s@]+@gmail\.com$/i.test(form.email.trim()) || !/^\+91[\s-]?[6-9]\d{4}[\s-]?\d{5}$/.test(form.phone.trim())} data-testid="submit-member-button">Add Member</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MemberStatus({ status }) {
  return <span className={`am-status am-status-${status.toLowerCase()}`}><span />{status}</span>
}

function DeleteMemberDialog({ member, restaurant, onClose, onConfirm }) {
  return (
    <div className="am-overlay" role="dialog" aria-modal="true" aria-labelledby="remove-member-title">
      <div className="am-modal am-confirm-modal">
        <div className="am-confirm-content">
          <p className="am-eyebrow">Remove access</p>
          <h2 id="remove-member-title">Remove member?</h2>
          <p className="am-confirm-message">Remove this member from <strong>{restaurant.name}</strong>?</p>
          <p className="am-confirm-detail">{member.name} will be removed from this temporary workspace list.</p>
          <div className="am-modal-actions">
            <button type="button" className="am-button am-button-muted" onClick={onClose} data-testid="cancel-remove-member">Cancel</button>
            <button type="button" className="am-button am-button-danger" onClick={onConfirm} data-testid="confirm-remove-member"><Trash2 size={15} />Remove Member</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AppMembers() {
  const [restaurants, setRestaurants] = useState(INITIAL_RESTAURANTS)
  const [membersByRestaurant, setMembersByRestaurant] = useState(INITIAL_MEMBERS_BY_RESTAURANT)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [expandedRestaurantId, setExpandedRestaurantId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [copiedRestaurantId, setCopiedRestaurantId] = useState(null)
  const nextMemberId = useRef(1)

  const memberCount = (restaurant) => membersByRestaurant[restaurant.id]?.length ?? restaurant.members

  const visibleRestaurants = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return restaurants
      .filter((restaurant) => !needle || restaurant.name.toLowerCase().includes(needle) || restaurant.uid.includes(needle))
      .sort((a, b) => sort === 'members'
        ? memberCount(b) - memberCount(a) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name))
  }, [restaurants, query, sort, membersByRestaurant])

  const openAdd = (restaurant = null) => {
    setForm({ ...emptyForm, uid: restaurant?.uid || '' })
    setIsAddModalOpen(true)
  }
  const closeModal = () => {
    setIsAddModalOpen(false)
  }
  const submit = (restaurant) => {
    const newMember = {
      ...form,
      id: `new-member-${nextMemberId.current}`,
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      status: 'Pending',
    }
    nextMemberId.current += 1
    setMembersByRestaurant((current) => ({
      ...current,
      [restaurant.id]: [...(current[restaurant.id] || []), newMember],
    }))
    setExpandedRestaurantId(restaurant.id)
    closeModal()
  }
  const toggleRestaurant = (restaurantId) => {
    setExpandedRestaurantId((current) => current === restaurantId ? null : restaurantId)
  }
  const copyRestaurantUid = async (restaurant) => {
    try {
      await copyText(restaurant.uid)
      setCopiedRestaurantId(restaurant.id)
      window.setTimeout(() => {
        setCopiedRestaurantId((current) => current === restaurant.id ? null : current)
      }, 1600)
    } catch {
      setCopiedRestaurantId(null)
    }
  }
  const confirmDelete = () => {
    if (!pendingDelete) return
    const { member, restaurant } = pendingDelete
    setMembersByRestaurant((current) => ({
      ...current,
      [restaurant.id]: (current[restaurant.id] || []).filter((item) => item.id !== member.id),
    }))
    setPendingDelete(null)
  }

  return (
    <div className="am-shell">
      <Sidebar />
      <main className="am-main" aria-label="App members workspace">
        <div className="am-content">
          <header className="am-header">
            <div className="am-header-main">
              <div><p className="am-kicker">Restaurant access</p><h1>App Members</h1><p className="am-subtitle">Connect mobile app members to a restaurant using its permanent UID.</p></div>
              <button type="button" className="am-button am-button-header" onClick={() => openAdd()} aria-label="Add member manually" data-testid="header-add-member-button"><UserPlus size={19} strokeWidth={1.8} /><span>Add Member</span></button>
            </div>
          </header>

          <section className="am-directory" aria-label="Restaurants">
            <div className="am-toolbar">
              <div className="am-search"><Search size={17} /><input aria-label="Search restaurants" data-testid="restaurant-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search restaurant name or UID" /></div>
              <div className="am-sort-wrap"><span>Sort by</span><div className="am-select-wrap"><select aria-label="Sort restaurants" data-testid="restaurant-sort-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Restaurant name</option><option value="members">Number of members</option></select><ChevronDown size={15} /></div></div>
            </div>
            <div className="am-list-heading"><span>Restaurant</span><span>Members</span><span aria-hidden="true" /><span aria-hidden="true" /></div>
            <div className="am-restaurant-list">
              {visibleRestaurants.map((restaurant) => {
                const restaurantMembers = membersByRestaurant[restaurant.id] || []
                const isExpanded = expandedRestaurantId === restaurant.id
                const memberListId = `restaurant-members-${restaurant.id}`
                return (
                  <Fragment key={restaurant.id}>
                    <article className="am-restaurant-row" data-testid={`restaurant-row-${restaurant.id}`}>
                      <div className="am-restaurant-identity"><RestaurantMark restaurant={restaurant} /><div><strong>{restaurant.name}</strong><div className="am-uid-line"><code data-testid={`restaurant-uid-${restaurant.id}`}>{restaurant.uid}</code><button type="button" className={`am-copy-uid ${copiedRestaurantId === restaurant.id ? 'is-copied' : ''}`} onClick={() => copyRestaurantUid(restaurant)} title={copiedRestaurantId === restaurant.id ? 'Restaurant UID copied' : 'Copy restaurant UID'} aria-label={copiedRestaurantId === restaurant.id ? `Restaurant UID copied for ${restaurant.name}` : `Copy restaurant UID for ${restaurant.name}`} data-testid={`copy-restaurant-uid-${restaurant.id}`}>{copiedRestaurantId === restaurant.id ? <Check size={13} /> : <Copy size={13} />}</button></div></div></div>
                      <span className="am-member-count">{memberCount(restaurant)} {memberCount(restaurant) === 1 ? 'Member' : 'Members'}</span>
                      <button type="button" className={`am-expand-circle ${isExpanded ? 'is-open' : ''}`} onClick={() => toggleRestaurant(restaurant.id)} title={`${isExpanded ? 'Collapse' : 'Expand'} members for ${restaurant.name}`} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} members for ${restaurant.name}`} aria-expanded={isExpanded} aria-controls={memberListId} data-testid={`toggle-members-${restaurant.id}`}><ChevronDown size={15} /></button>
                      <button type="button" className="am-add-circle" onClick={() => openAdd(restaurant)} title="Add member to this restaurant" aria-label={`Add member to ${restaurant.name}`} data-testid={`add-member-${restaurant.id}`}><Plus size={17} /></button>
                    </article>
                    <div id={memberListId} className={`am-member-list-shell ${isExpanded ? 'is-open' : ''}`} aria-hidden={!isExpanded}>
                      <div className="am-member-list-inner">
                        <div className="am-member-list">
                          {restaurantMembers.length > 0 && <div className="am-member-list-heading"><span>Member</span><span>Gmail ID</span><span>Phone</span><span>Role</span><span>Status</span><span aria-hidden="true" /></div>}
                          {restaurantMembers.map((member) => (
                            <div className="am-member-row" key={member.id} data-testid={`member-row-${member.id}`}>
                              <div className="am-member-name" data-label="Member"><span className="am-member-avatar">{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><strong>{member.name}</strong></div>
                              <span className="am-member-cell" data-label="Gmail ID">{member.email}</span>
                              <span className="am-member-cell" data-label="Phone">{member.phone}</span>
                              <span className="am-member-cell" data-label="Role">{member.role}</span>
                              <span className="am-member-cell" data-label="Status"><MemberStatus status={member.status} /></span>
                              <button type="button" className="am-member-delete" onClick={() => setPendingDelete({ member, restaurant })} title={`Remove ${member.name} from ${restaurant.name}`} aria-label={`Remove ${member.name} from ${restaurant.name}`} data-testid={`delete-member-${member.id}`}><Trash2 size={15} /></button>
                            </div>
                          ))}
                          {restaurantMembers.length === 0 && <div className="am-member-empty"><div className="am-member-empty-icon"><Store size={17} /></div><div><strong>No members added yet</strong><p>Add a member to connect someone to this restaurant.</p></div></div>}
                        </div>
                      </div>
                    </div>
                  </Fragment>
                )
              })}
            </div>
            {visibleRestaurants.length === 0 && <div className="am-empty"><div className="am-empty-icon"><Search size={20} /></div><h3>No restaurants found</h3><p>Try a different restaurant name or permanent UID.</p><button className="am-button am-button-muted" onClick={() => setQuery('')} data-testid="clear-restaurant-search">Clear search</button></div>}
            <div className="am-list-footer"><span>Showing {visibleRestaurants.length} of {restaurants.length} restaurants</span><span>Changes are temporary in this workspace</span></div>
          </section>
        </div>
      </main>
      {isAddModalOpen && <AddMemberModal restaurants={restaurants} form={form} setForm={setForm} onClose={closeModal} onSubmit={submit} />}
      {pendingDelete && <DeleteMemberDialog member={pendingDelete.member} restaurant={pendingDelete.restaurant} onClose={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
    </div>
  )
}