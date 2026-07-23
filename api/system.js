import { setAdminCors, applySecurityHeaders } from './_lib/cors.js'

// ── /api/system — System Handler ────────────────────────────────────────────
//
// All runtime database provisioning and migration endpoints have been removed.
// Database schema changes are managed only through reviewed migrations.

const REMOVED_ACTIONS = new Set([
  'createRestaurantDb',
  'dropRestaurantDb',
  'listRestaurantDb',
])

export default async function handler(req, res) {
  setAdminCors(req, res)
  applySecurityHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  // Runtime DDL/migration actions were removed. Return 410 Gone so callers do
  // not treat them as healthy no-ops.
  if (REMOVED_ACTIONS.has(action)) {
    return res.status(410).json({ error: 'Runtime database provisioning has been removed' })
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
