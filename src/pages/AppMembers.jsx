import React, { Fragment, useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import { Check, ChevronDown, Copy, Pencil, Plus, RefreshCw, Search, Store, Trash2, UserPlus, X } from 'lucide-react'
import './AppMembers.css'

const ROLES = ['OWNER', 'ADMIN', 'STAFF']
const emptyForm = { uid: '', name: '', email: '', phone: '', role: 'STAFF' }

function initials(name = '') {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '—'
}

function errorMessage(error) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || body.error || 'The request could not be completed.')
  return body
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Unable to copy UID')
}

function Field({ label, id, error, children }) {
  return <div className="am-field"><label htmlFor={id}>{label}</label>{children}{error && <span className="am-error">{error}</span>}</div>
}

function MemberModal({ restaurants, initialForm, editing, onClose, onSubmit, busy }) {
  const [form, setForm] = useState(initialForm)
  const [submitted, setSubmitted] = useState(false)
  const restaurant = restaurants.find((item) => item.uid === form.uid)
  const errors = {}
  if (submitted && !restaurant) errors.uid = 'Enter a UID from the directory.'
  if (submitted && !form.name.trim()) errors.name = 'Full name is required.'
  if (submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.'
  if (submitted && !form.role) errors.role = 'Select a role.'
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    setSubmitted(true)
    if (!restaurant || !form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || !form.role) return
    onSubmit({ ...form, uid: restaurant.uid, name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() })
  }
  return <div className="am-overlay" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
    <div className="am-modal"><form className="am-form" onSubmit={submit} noValidate>
      <div className="am-modal-heading"><div><p className="am-eyebrow">{editing ? 'Edit access' : 'New access'}</p><h2 id="member-modal-title">{editing ? 'Edit app member' : 'Add app member'}</h2><p>{editing ? 'Update this member’s restaurant access.' : 'Grant mobile access to a restaurant member.'}</p></div><button type="button" className="am-icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
      <Field label="Restaurant UID" id="restaurant-uid" error={errors.uid}><div className="am-select-wrap"><select id="restaurant-uid" data-testid="restaurant-uid-input" value={form.uid} onChange={update('uid')} disabled={Boolean(editing)}><option value="">Select a restaurant</option>{restaurants.map((item) => <option key={item.uid} value={item.uid}>{item.name} · {item.uid}</option>)}</select><ChevronDown size={15} /></div></Field>
      <Field label="Full name" id="member-name" error={errors.name}><input id="member-name" data-testid="member-name-input" value={form.name} onChange={update('name')} placeholder="Full name" autoFocus /></Field>
      <Field label="Email" id="member-email" error={errors.email}><input id="member-email" data-testid="member-email-input" value={form.email} onChange={update('email')} placeholder="name@restaurant.com" inputMode="email" /></Field>
      <Field label="Phone number" id="member-phone"><input id="member-phone" data-testid="member-phone-input" value={form.phone} onChange={update('phone')} placeholder="Optional phone number" inputMode="tel" /></Field>
      <Field label="Role" id="member-role" error={errors.role}><div className="am-select-wrap"><select id="member-role" data-testid="member-role-select" value={form.role} onChange={update('role')}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select><ChevronDown size={15} /></div></Field>
      <div className="am-modal-actions"><button type="button" className="am-button am-button-muted" onClick={onClose}>Cancel</button><button type="submit" className="am-button am-button-primary" disabled={busy} data-testid="submit-member-button">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add member'}</button></div>
    </form></div>
  </div>
}

function ConfirmDialog({ member, restaurant, onClose, onConfirm, busy }) {
  return <div className="am-overlay" role="dialog" aria-modal="true" aria-labelledby="remove-member-title"><div className="am-modal am-confirm-modal"><div className="am-confirm-content"><p className="am-eyebrow">Revoke access</p><h2 id="remove-member-title">Remove member?</h2><p className="am-confirm-message">Revoke <strong>{member.name}</strong> from <strong>{restaurant.name}</strong>?</p><p className="am-confirm-detail">This action removes the member’s app access from the directory.</p><div className="am-modal-actions"><button className="am-button am-button-muted" onClick={onClose}>Cancel</button><button className="am-button am-button-danger" onClick={onConfirm} disabled={busy}><Trash2 size={15} />{busy ? 'Removing…' : 'Revoke access'}</button></div></div></div></div>
}

function MemberStatus({ status }) {
  return <span className={`am-status am-status-${status.toLowerCase()}`}><span />{status}</span>
}

export default function AppMembers() {
  const [restaurants, setRestaurants] = useState([])
  const [membersByUid, setMembersByUid] = useState({})
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [expandedUid, setExpandedUid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMembers, setLoadingMembers] = useState({})
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copiedUid, setCopiedUid] = useState(null)

  const loadRestaurants = async () => {
    setLoading(true); setError('')
    try { const body = await request('/api/app-members'); setRestaurants(Array.isArray(body.restaurants) ? body.restaurants : []) } catch (err) { setError(errorMessage(err)) } finally { setLoading(false) }
  }
  const loadMembers = async (uid) => {
    setLoadingMembers((current) => ({ ...current, [uid]: true }))
    try { const body = await request(`/api/app-members?uid=${encodeURIComponent(uid)}`); setMembersByUid((current) => ({ ...current, [uid]: body.members || [] })); setRestaurants((current) => current.map((item) => item.uid === uid ? { ...item, ...(body.restaurant || {}), memberCount: (body.members || []).length } : item)) } catch (err) { setError(errorMessage(err)) } finally { setLoadingMembers((current) => ({ ...current, [uid]: false })) }
  }
  useEffect(() => { loadRestaurants() }, [])

  const visibleRestaurants = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return restaurants.filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.uid.includes(needle)).sort((a, b) => sort === 'members' ? (b.memberCount || 0) - (a.memberCount || 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))
  }, [restaurants, query, sort])
  const openAdd = (restaurant) => setModal({ editing: null, form: { ...emptyForm, uid: restaurant?.uid || '' } })
  const toggle = (restaurant) => {
    const next = expandedUid === restaurant.uid ? null : restaurant.uid
    setExpandedUid(next)
    if (next && !membersByUid[next]) loadMembers(next)
  }
  const submit = async (form) => {
    setBusy(true); setError('')
    try {
      const payload = modal.editing ? { action: 'update', id: modal.editing.id, ...form } : { action: 'create', ...form }
      await request('/api/app-members', { method: 'POST', body: JSON.stringify(payload) })
      setModal(null); await loadRestaurants(); await loadMembers(form.uid); setExpandedUid(form.uid)
    } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  const updateStatus = async (member, uid) => {
    setBusy(true); setError('')
    try { await request('/api/app-members', { method: 'POST', body: JSON.stringify({ action: 'status', id: member.id, status: member.status === 'Suspended' ? 'active' : 'suspended' }) }); await loadRestaurants(); await loadMembers(uid) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  const revoke = async () => {
    if (!pendingDelete) return
    setBusy(true); setError('')
    try { await request('/api/app-members', { method: 'POST', body: JSON.stringify({ action: 'revoke', id: pendingDelete.member.id }) }); setPendingDelete(null); await loadRestaurants(); await loadMembers(pendingDelete.restaurant.uid) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  const edit = (member, restaurant) => setModal({ editing: member, form: { uid: restaurant.uid, name: member.name, email: member.email, phone: member.phone || '', role: member.role } })
  const copyUid = async (restaurant) => { try { await copyText(restaurant.uid); setCopiedUid(restaurant.uid); window.setTimeout(() => setCopiedUid(null), 1500) } catch (err) { setError(errorMessage(err)) } }

  return <div className="am-shell"><Sidebar /><main className="am-main" aria-label="App members directory"><div className="am-content">
    <header className="am-header"><div className="am-header-main"><div><p className="am-kicker">Platform access</p><h1>App Members</h1><p className="am-subtitle">Manage mobile access across every restaurant in one precise directory.</p></div><button className="am-button am-button-header" onClick={() => openAdd()} data-testid="header-add-member-button"><UserPlus size={19} /><span>Add member</span></button></div></header>
    {error && <div className="am-alert" role="alert"><span>{error}</span><button onClick={() => { setError(''); loadRestaurants() }}><RefreshCw size={14} />Try again</button></div>}
    <section className="am-directory" aria-label="Restaurants"><div className="am-toolbar"><div className="am-search"><Search size={17} /><input aria-label="Search restaurants" data-testid="restaurant-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search restaurant name or UID" /></div><div className="am-sort-wrap"><span>Sort by</span><div className="am-select-wrap"><select aria-label="Sort restaurants" data-testid="restaurant-sort-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Restaurant name</option><option value="members">Number of members</option></select><ChevronDown size={15} /></div></div></div>
      <div className="am-list-heading"><span>Restaurant</span><span>Members</span><span /><span /></div><div className="am-restaurant-list">
        {loading ? <div className="am-loading"><span /><span /><span /><span /></div> : visibleRestaurants.map((restaurant) => { const members = membersByUid[restaurant.uid] || []; const expanded = expandedUid === restaurant.uid; return <Fragment key={restaurant.uid}><article className="am-restaurant-row" data-testid={`restaurant-row-${restaurant.uid}`}><div className="am-restaurant-identity"><div className="am-restaurant-mark">{restaurant.logoUrl ? <img src={restaurant.logoUrl} alt="" /> : <><Store size={18} /><span>{initials(restaurant.name)}</span></>}</div><div><strong>{restaurant.name}</strong><div className="am-uid-line"><code>{restaurant.uid}</code><button className={`am-copy-uid ${copiedUid === restaurant.uid ? 'is-copied' : ''}`} onClick={() => copyUid(restaurant)} aria-label="Copy restaurant UID">{copiedUid === restaurant.uid ? <Check size={13} /> : <Copy size={13} />}</button></div></div></div><span className="am-member-count">{restaurant.memberCount || 0} {(restaurant.memberCount || 0) === 1 ? 'Member' : 'Members'}</span><button className={`am-expand-circle ${expanded ? 'is-open' : ''}`} onClick={() => toggle(restaurant)} aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} members`}><ChevronDown size={15} /></button><button className="am-add-circle" onClick={() => openAdd(restaurant)} aria-label={`Add member to ${restaurant.name}`}><Plus size={17} /></button></article>
          <div className={`am-member-list-shell ${expanded ? 'is-open' : ''}`} aria-hidden={!expanded}><div className="am-member-list-inner"><div className="am-member-list">{loadingMembers[restaurant.uid] ? <div className="am-member-loading">Loading members…</div> : members.length ? <><div className="am-member-list-heading"><span>Member</span><span>Email</span><span>Phone</span><span>Role</span><span>Status</span><span /></div>{members.map((member) => <div className="am-member-row" key={member.id} data-testid={`member-row-${member.id}`}><div className="am-member-name"><span className="am-member-avatar">{initials(member.name)}</span><strong>{member.name}</strong></div><span className="am-member-cell" data-label="Email">{member.email}</span><span className="am-member-cell" data-label="Phone">{member.phone || '—'}</span><span className="am-member-cell" data-label="Role">{member.role}</span><span className="am-member-cell" data-label="Status"><MemberStatus status={member.status} /></span><div className="am-member-actions"><button onClick={() => updateStatus(member, restaurant.uid)} disabled={busy} title={member.status === 'Suspended' ? 'Reactivate member' : 'Suspend member'}>{member.status === 'Suspended' ? <Check size={14} /> : <span className="am-pause">Ⅱ</span>}</button><button onClick={() => edit(member, restaurant)} disabled={busy} title="Edit member"><Pencil size={14} /></button><button className="am-member-delete" onClick={() => setPendingDelete({ member, restaurant })} title="Revoke access"><Trash2 size={15} /></button></div></div>)}</> : <div className="am-member-empty"><div className="am-member-empty-icon"><Store size={17} /></div><div><strong>No members yet</strong><p>Add a member to grant mobile access.</p></div></div>}</div></div></div>
        </Fragment> })}
      </div>{!loading && visibleRestaurants.length === 0 && <div className="am-empty"><div className="am-empty-icon"><Search size={20} /></div><h3>{restaurants.length ? 'No restaurants found' : 'No restaurants in the directory'}</h3><p>{restaurants.length ? 'Try a different name or UID.' : 'Restaurants will appear here when they are available.'}</p>{restaurants.length > 0 && <button className="am-button am-button-muted" onClick={() => setQuery('')}>Clear search</button>}</div>}<div className="am-list-footer"><span>{loading ? 'Loading directory…' : `Showing ${visibleRestaurants.length} of ${restaurants.length} restaurants`}</span><span>Live directory</span></div>
    </section></div></main>{modal && <MemberModal restaurants={restaurants} initialForm={modal.form} editing={modal.editing} onClose={() => setModal(null)} onSubmit={submit} busy={busy} />}{pendingDelete && <ConfirmDialog member={pendingDelete.member} restaurant={pendingDelete.restaurant} onClose={() => setPendingDelete(null)} onConfirm={revoke} busy={busy} />}</div>
}