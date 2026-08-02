import React, { useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from '../components/Sidebar'
import {
  Check,
  ChevronDown,
  CircleUserRound,
  Edit3,
  Mail,
  MoreHorizontal,
  Phone,
  Search,
  Shield,
  UserPlus,
  X,
} from 'lucide-react'
import './AppMembers.css'

const ROLES = ['Owner', 'Admin', 'Manager', 'Staff']
const STATUSES = ['Active', 'Pending', 'Suspended']

const INITIAL_MEMBERS = [
  { id: 1, name: 'Maya Chen', email: 'maya.chen@gmail.com', phone: '+1 (415) 555-0182', role: 'Owner', status: 'Active', lastActive: 'Just now' },
  { id: 2, name: 'Jordan Ellis', email: 'jordan.ellis@gmail.com', phone: '+1 (628) 555-0147', role: 'Admin', status: 'Active', lastActive: '12 min ago' },
  { id: 3, name: 'Priya Nair', email: 'priya.nair@gmail.com', phone: '+1 (510) 555-0168', role: 'Manager', status: 'Pending', lastActive: 'Invitation sent' },
  { id: 4, name: 'Theo Martin', email: 'theo.martin@gmail.com', phone: '+1 (415) 555-0124', role: 'Staff', status: 'Active', lastActive: 'Yesterday, 8:42 PM' },
  { id: 5, name: 'Lena Ortiz', email: 'lena.ortiz@gmail.com', phone: '+1 (650) 555-0193', role: 'Staff', status: 'Suspended', lastActive: 'Mar 14, 2025' },
]

const emptyForm = { name: '', email: '', phone: '', role: 'Staff', status: 'Pending' }

function initials(name) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Full name is required.'
  if (!form.email.trim()) errors.email = 'Gmail ID is required.'
  else if (!/^[^\s@]+@gmail\.com$/i.test(form.email.trim())) errors.email = 'Enter a valid Gmail address.'
  if (!form.phone.trim()) errors.phone = 'Phone number is required.'
  else if (!/^\+?[0-9 ()-]{8,}$/.test(form.phone.trim())) errors.phone = 'Enter a valid phone number with country code.'
  if (!ROLES.includes(form.role)) errors.role = 'Select a role.'
  return errors
}

function StatusPill({ status }) {
  return <span className={`am-status am-status-${status.toLowerCase()}`}><span />{status}</span>
}

function MemberForm({ form, setForm, errors, onSubmit, onCancel, isEditing }) {
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  return (
    <form className="am-form" onSubmit={onSubmit} noValidate>
      <div className="am-modal-heading">
        <div>
          <p className="am-eyebrow">{isEditing ? 'Member profile' : 'New access'}</p>
         <h2 id="member-modal-title">{isEditing ? 'Edit member' : 'Add member'}</h2>
          <p>{isEditing ? 'Update this person’s access details.' : 'Invite someone to this restaurant’s mobile app.'}</p>
        </div>
        <button type="button" className="am-icon-button" onClick={onCancel} aria-label="Close dialog" data-testid="close-member-modal"><X size={18} /></button>
      </div>
      <div className="am-field">
        <label htmlFor="member-name">Full name</label>
        <input id="member-name" data-testid="member-name-input" value={form.name} onChange={update('name')} placeholder="e.g. Alex Morgan" autoFocus />
        {errors.name && <span className="am-error">{errors.name}</span>}
      </div>
      <div className="am-field">
        <label htmlFor="member-email">Gmail ID</label>
        <div className="am-input-icon"><Mail size={16} /><input id="member-email" data-testid="member-email-input" value={form.email} onChange={update('email')} placeholder="name@gmail.com" inputMode="email" /></div>
        {errors.email && <span className="am-error">{errors.email}</span>}
      </div>
      <div className="am-field">
        <label htmlFor="member-phone">Phone Noumber</label>
        <div className="am-input-icon"><Phone size={16} /><input id="member-phone" data-testid="member-phone-input" value={form.phone} onChange={update('phone')} placeholder="+1 (415) 555-0100" inputMode="tel" /></div>
        {errors.phone && <span className="am-error">{errors.phone}</span>}
      </div>
      <div className="am-form-grid">
        <div className="am-field">
          <label htmlFor="member-role">Role</label>
          <select id="member-role" data-testid="member-role-select" value={form.role} onChange={update('role')}>{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
          {errors.role && <span className="am-error">{errors.role}</span>}
        </div>
        <div className="am-field">
          <label htmlFor="member-status">Status</label>
          <select id="member-status" data-testid="member-status-select" value={form.status} onChange={update('status')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
        </div>
      </div>
      <div className="am-modal-actions">
        <button type="button" className="am-button am-button-muted" onClick={onCancel} data-testid="cancel-member-button">Cancel</button>
        <button type="submit" className="am-button am-button-primary" data-testid="submit-member-button">{isEditing ? 'Save changes' : 'Add member'}</button>
      </div>
    </form>
  )
}

function DetailsPanel({ member, onClose, onEdit }) {
  return (
    <div className="am-overlay" role="dialog" aria-modal="true" aria-labelledby="details-title">
      <div className="am-modal am-details-modal">
        <div className="am-modal-heading">
          <div><p className="am-eyebrow">Access details</p><h2 id="details-title">{member.name}</h2><p>Current access for this restaurant.</p></div>
          <button className="am-icon-button" onClick={onClose} aria-label="Close details" data-testid="close-details-button"><X size={18} /></button>
        </div>
        <div className="am-details-avatar">{initials(member.name)}</div>
        <div className="am-detail-list">
          <div><span>Gmail ID</span><strong>{member.email}</strong></div>
          <div><span>Phone</span><strong>{member.phone}</strong></div>
          <div><span>Role</span><strong>{member.role}</strong></div>
          <div><span>Status</span><strong><StatusPill status={member.status} /></strong></div>
          <div><span>Last active</span><strong>{member.lastActive}</strong></div>
        </div>
        <div className="am-modal-actions"><button className="am-button am-button-muted" onClick={onClose} data-testid="details-done-button">Done</button><button className="am-button am-button-primary" onClick={onEdit} data-testid="details-edit-button"><Edit3 size={15} /> Edit member</button></div>
      </div>
    </div>
  )
}

export default function AppMembers() {
  const [members, setMembers] = useState(INITIAL_MEMBERS)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All roles')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [menuId, setMenuId] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [details, setDetails] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const close = (event) => { if (menuRef.current && !menuRef.current.contains(event.target)) setMenuId(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const counts = useMemo(() => STATUSES.reduce((result, status) => ({ ...result, [status]: members.filter((member) => member.status === status).length }), { Total: members.length }), [members])
  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return members.filter((member) => {
      const matchesQuery = !needle || [member.name, member.email, member.phone].some((value) => value.toLowerCase().includes(needle))
      return matchesQuery && (roleFilter === 'All roles' || member.role === roleFilter) && (statusFilter === 'All statuses' || member.status === statusFilter)
    })
  }, [members, query, roleFilter, statusFilter])

  const openAdd = () => { setForm(emptyForm); setErrors({}); setModal('add') }
  const openEdit = (member) => { setForm({ name: member.name, email: member.email, phone: member.phone, role: member.role, status: member.status }); setErrors({}); setDetails(null); setModal(member.id) }
  const submit = (event) => {
    event.preventDefault()
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    if (modal === 'add') setMembers((current) => [...current, { ...form, id: Date.now(), lastActive: form.status === 'Pending' ? 'Invitation sent' : 'Just now' }])
    else setMembers((current) => current.map((member) => member.id === modal ? { ...member, ...form } : member))
    setModal(null)
  }
  const toggleStatus = (member) => {
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, status: item.status === 'Suspended' ? 'Active' : 'Suspended' } : item))
    setMenuId(null)
  }
  const changeRole = (member) => {
    const nextRole = ROLES[(ROLES.indexOf(member.role) + 1) % ROLES.length]
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item))
    setMenuId(null)
  }

  return (
    <div className="am-shell">
      <Sidebar />
      <main className="am-main" aria-label="App members workspace">
        <div className="am-content">
          <header className="am-header">
            <div><p className="am-kicker">Restaurant access</p><h1>App Members</h1><p className="am-subtitle">Manage the people who can access this restaurant through the mobile app.</p></div>
            <button className="am-button am-button-primary am-add-button" onClick={openAdd} data-testid="add-member-button"><UserPlus size={17} /> Add Member</button>
          </header>

          <section className="am-summary" aria-label="Member summary">
            {[['Total Members', counts.Total, 'total'], ['Active', counts.Active, 'active'], ['Pending', counts.Pending, 'pending'], ['Suspended', counts.Suspended, 'suspended']].map(([label, count, tone]) => (
              <div className={`am-summary-card am-summary-${tone}`} key={label} data-testid={`summary-${tone}`}><span>{label}</span><strong>{count}</strong><small>{label === 'Total Members' ? 'Across this restaurant' : `${count === 1 ? '1 member' : `${count} members`}`}</small></div>
            ))}
          </section>

          <section className="am-directory">
            <div className="am-toolbar">
              <div className="am-search"><Search size={17} /><input aria-label="Search members" data-testid="member-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, Gmail ID or phone" /></div>
              <div className="am-select-wrap"><select aria-label="Filter by role" data-testid="role-filter-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option>All roles</option>{ROLES.map((role) => <option key={role}>{role}</option>)}</select><ChevronDown size={15} /></div>
              <div className="am-select-wrap"><select aria-label="Filter by status" data-testid="status-filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></div>
            </div>
            <div className="am-table-heading"><span>Member</span><span>Contact</span><span>Role</span><span>Status</span><span>Last active</span><span aria-hidden="true" /></div>
            <div className="am-member-list">
              {visibleMembers.map((member) => (
                <article className="am-member-row" key={member.id} data-testid={`member-row-${member.id}`}>
                  <div className="am-person"><div className="am-avatar">{initials(member.name)}</div><div><strong>{member.name}</strong><span className="am-mobile-contact">{member.email}</span></div></div>
                  <div className="am-contact"><span>{member.email}</span><span>{member.phone}</span></div>
                  <div className="am-role"><Shield size={14} />{member.role}</div>
                  <div><StatusPill status={member.status} /></div>
                  <div className="am-last-active">{member.lastActive}</div>
                  <div className="am-menu-holder" ref={menuId === member.id ? menuRef : null}>
                    <button className="am-icon-button am-more-button" onClick={() => setMenuId(menuId === member.id ? null : member.id)} aria-label={`Actions for ${member.name}`} data-testid={`member-menu-${member.id}`}><MoreHorizontal size={18} /></button>
                    {menuId === member.id && <div className="am-menu" role="menu">
                      <button onClick={() => { setDetails(member); setMenuId(null) }} data-testid={`view-member-${member.id}`}>View details</button>
                      <button onClick={() => openEdit(member)} data-testid={`edit-member-${member.id}`}>Edit member</button>
                      <button onClick={() => changeRole(member)} data-testid={`change-role-${member.id}`}>Change role <span>{member.role} →</span></button>
                      <button onClick={() => toggleStatus(member)} data-testid={`toggle-status-${member.id}`}>{member.status === 'Suspended' ? 'Activate member' : 'Suspend member'}</button>
                      <button className="am-danger-text" onClick={() => { setRemoveTarget(member); setMenuId(null) }} data-testid={`remove-member-${member.id}`}>Remove member</button>
                    </div>}
                  </div>
                </article>
              ))}
            </div>
            {visibleMembers.length === 0 && <div className="am-empty"><CircleUserRound size={30} /><h3>No members found</h3><p>Try a different search or clear one of the filters.</p><button className="am-button am-button-muted" onClick={() => { setQuery(''); setRoleFilter('All roles'); setStatusFilter('All statuses') }} data-testid="clear-filters-button">Clear filters</button></div>}
            <div className="am-list-footer"><span>Showing {visibleMembers.length} of {members.length} members</span><span className="am-footer-note"><Check size={14} /> Changes are temporary in this workspace</span></div>
          </section>
        </div>
      </main>

      {modal && <div className="am-overlay" role="dialog" aria-modal="true" aria-labelledby="member-modal-title"><div className="am-modal"><MemberForm form={form} setForm={setForm} errors={errors} onSubmit={submit} onCancel={() => setModal(null)} isEditing={modal !== 'add'} /></div></div>}
      {details && <DetailsPanel member={details} onClose={() => setDetails(null)} onEdit={() => openEdit(details)} />}
      {removeTarget && <div className="am-overlay" role="alertdialog" aria-modal="true" aria-labelledby="remove-title"><div className="am-modal am-confirm-modal"><div className="am-confirm-mark"><X size={20} /></div><p className="am-eyebrow">Remove access</p><h2 id="remove-title">Remove {removeTarget.name}?</h2><p>This will remove the member from the visible list. No permanent change will be made.</p><div className="am-modal-actions"><button className="am-button am-button-muted" onClick={() => setRemoveTarget(null)} data-testid="cancel-remove-button">Cancel</button><button className="am-button am-button-danger" onClick={() => { setMembers((current) => current.filter((member) => member.id !== removeTarget.id)); setRemoveTarget(null) }} data-testid="confirm-remove-button">Remove member</button></div></div></div>}
    </div>
  )
}