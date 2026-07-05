import { auth } from '../src/lib/auth.server.js'
import { fromNodeHeaders } from 'better-auth/node'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function supabaseServiceHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

/**
 * GET /api/auth-check?type=superadmin
 *   → checks email against SUPERADMIN_ALLOWED_EMAILS env var
 *
 * GET /api/auth-check?type=member&restaurantId=<uuid>
 *   → checks email in Supabase team_members for that restaurant
 *
 * Both require a valid Better Auth session cookie.
 */
export default async function handler(req, res) {
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { type, restaurantId } = req.query

  let session
  try {
    session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  } catch (e) {
    return res.status(401).json({ error: 'Session error', detail: e.message })
  }

  if (!session?.user) return res.status(401).json({ error: 'Not authenticated' })

  const rawEmail = session.user.email || ''
  const email    = rawEmail.toLowerCase().trim()

  // ── Superadmin check ──────────────────────────────────────────────────────
  if (type === 'superadmin') {
    const rawEnv        = process.env.SUPERADMIN_ALLOWED_EMAILS
    const envExists     = rawEnv !== undefined && rawEnv !== null
    const allowedEmails = (rawEnv || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    const allowed       = allowedEmails.includes(email)

    // ── TEMPORARY DEBUG LOG (remove once access is confirmed working) ──────
    console.log('[auth-check/superadmin]', JSON.stringify({
      host:              req.headers.host || '(none)',
      loginEmailRaw:     rawEmail,
      loginEmailNorm:    email,
      envExists,
      allowedCount:      allowedEmails.length,
      allowedEmailsNorm: allowedEmails,
      allowed,
      denialReason: allowed ? null : (
        !envExists               ? 'SUPERADMIN_ALLOWED_EMAILS env var is not set' :
        allowedEmails.length === 0 ? 'SUPERADMIN_ALLOWED_EMAILS is set but empty' :
        `email "${email}" not found in list`
      ),
    }))
    // ── END DEBUG LOG ───────────────────────────────────────────────────────

    return res.json({ allowed, role: allowed ? 'superadmin' : null, email })
  }

  // ── Restaurant member check ───────────────────────────────────────────────
  if (type === 'member' && restaurantId) {
    const url =
      `${SUPABASE_URL}/rest/v1/team_members` +
      `?restaurant_id=eq.${encodeURIComponent(restaurantId)}` +
      `&email=eq.${encodeURIComponent(email)}` +
      `&select=role,email,name&limit=1`

    let rows
    try {
      const r = await fetch(url, { headers: supabaseServiceHeaders() })
      if (!r.ok) throw new Error(`Supabase ${r.status}`)
      rows = await r.json()
    } catch (e) {
      return res.status(500).json({ error: 'DB lookup failed', detail: e.message })
    }

    if (!rows?.length) return res.json({ allowed: false, role: null, email })
    const member = rows[0]
    return res.json({ allowed: true, role: member.role, email, name: member.name })
  }

  return res.status(400).json({ error: 'Missing or invalid type / restaurantId parameter' })
}
