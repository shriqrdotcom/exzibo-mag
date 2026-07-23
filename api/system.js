import { setAdminCors, setPublicCors, applySecurityHeaders } from './_lib/cors.js'
import { checkSuperadmin } from './_lib/authz.js'
import { runReadinessChecks } from '../src/monitoring/readiness.js'

// ── /api/system — System Handler ────────────────────────────────────────────
//
// All runtime database provisioning and migration endpoints have been removed.
// Database schema changes are managed only through reviewed migrations.
//
// Available actions:
//   liveness   — public; returns status, version, timestamp (no sensitive data)
//   readiness  — protected (superadmin); returns bounded component statuses

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
  if (REMOVED_ACTIONS.has(action)) {
    return res.status(410).json({ error: 'Runtime database provisioning has been removed' })
  }

  if (action === 'liveness') {
    setPublicCors(res)
    return res.json({
      status: 'ok',
      version: process.env.npm_package_version || '0.0.0',
      timestamp: new Date().toISOString(),
    })
  }

  if (action === 'readiness') {
    const auth = await checkSuperadmin(req)
    if (!auth.allowed) {
      return res.status(403).json({ error: 'Forbidden', status: 'unprotected' })
    }

    const checks = await runReadinessChecks()
    const allOk = checks.every(c => c.status === 'ok')
    return res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    })
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
