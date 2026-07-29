import { setAdminCors, setPublicCors } from './_lib/cors.js'
import { authorizeSuperadmin } from './_lib/authz.js'
import { runReadinessChecks } from '../src/monitoring/readiness.js'
import { sendSafeError } from './_lib/errors.js'
import { vercelWrapper } from './_lib/security-middleware.js'
import { defineValidation, validateRequest } from './_lib/validate.js'
import { handleLiveness } from './_lib/health.js'

// ── /api/system — System Handler ────────────────────────────────────────────
//
// All runtime database provisioning and migration endpoints have been removed.
// Database schema changes are managed only through reviewed migrations.
//
// Available actions:
//   liveness   — public; returns status, version, timestamp (no sensitive data)
//   readiness  — protected (superadmin); returns bounded component statuses

// ── Shared validation definitions ────────────────────────────────────────────
const vQueryAction = defineValidation('query', { action: { type: 'string', required: true } })

async function handler(req, res) {
  setAdminCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const requestId = req.requestId

  let action
  try {
    const v = validateRequest(req, vQueryAction)
    action = v.query.action
  } catch (e) {
    return sendSafeError(res, { status: 400, code: 'BAD_REQUEST', message: 'action query param required', requestId })
  }
  if (action === 'liveness') {
    setPublicCors(res)
    const result = handleLiveness()
    // Augment with previous info (version + timestamp) for backward compat
    return res.status(result.statusCode).json({
      ...result.body,
      version: process.env.npm_package_version || '0.0.0',
      timestamp: new Date().toISOString(),
    })
  }

  if (action === 'readiness') {
    const auth = await authorizeSuperadmin(req, res)
    if (!auth.ok) return

    const checks = await runReadinessChecks()
    const allOk = checks.every(c => c.status === 'ok')
    return res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    })
  }

  return sendSafeError(res, { status: 400, code: 'BAD_REQUEST', message: `Unknown action: ${action}`, requestId })
}

export default vercelWrapper(handler, { allowedMethods: ['GET', 'POST', 'OPTIONS'] })
