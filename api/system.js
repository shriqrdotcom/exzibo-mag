import { setAdminCors, setPublicCors } from './_lib/cors.js'
import { authorizeSuperadmin } from './_lib/authz.js'
import { runReadinessChecks } from '../src/monitoring/readiness.js'
import { createSafeError, sendSafeError } from './_lib/errors.js'
import { vercelWrapper } from './_lib/security-middleware.js'
import { defineValidation, validateRequest } from './_lib/validate.js'
import { handleLiveness } from './_lib/health.js'
import {
  createAppMember,
  listAppMembers,
  listAppRestaurants,
  revokeAppMember,
  setAppMemberStatus,
  updateAppMember,
} from './_lib/app-members-service.js'

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
  if (REMOVED_ACTIONS.has(action)) {
    const message = 'Runtime database provisioning has been removed'
    const envelope = {
      ...createSafeError({ code: 'BAD_REQUEST', message, requestId }),
      // Preserve the legacy error key for clients that consume retired actions.
      error: message,
    }
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
      res.status(410).json(envelope)
    }
    return envelope
  }

  if (action === 'liveness') {
    setPublicCors(res)
    const result = handleLiveness()
    // Augment with previous info (version + timestamp) for backward compat
    return res.status(result.statusCode).json({
      ...result.body,
      status: result.statusCode === 200 ? 'ok' : result.body.status,
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

  if (action === 'appMembers') {
    const auth = await authorizeSuperadmin(req, res)
    if (!auth.ok) return

    try {
      if (req.method === 'GET') {
        const uid = typeof req.query.uid === 'string' ? req.query.uid : ''
        const body = uid
          ? await listAppMembers(uid)
          : { restaurants: await listAppRestaurants() }
        return res.status(200).json(body)
      }

      if (req.method !== 'POST') {
        return sendSafeError(res, {
          status: 405,
          code: 'METHOD_NOT_ALLOWED',
          message: 'Method not allowed',
          requestId,
        })
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const caller = { userId: auth.userId, email: auth.email }
      let result
      if (body.action === 'create') result = await createAppMember(body, caller)
      else if (body.action === 'update') result = await updateAppMember(body, caller)
      else if (body.action === 'status') result = await setAppMemberStatus(body, caller)
      else if (body.action === 'revoke') result = await revokeAppMember(body, caller)
      else {
        return sendSafeError(res, {
          status: 400,
          code: 'BAD_REQUEST',
          message: 'A valid member action is required',
          requestId,
        })
      }
      return res.status(body.action === 'create' ? 201 : 200).json(result)
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500
      const code = status === 400
        ? 'BAD_REQUEST'
        : status === 403
          ? 'FORBIDDEN'
          : status === 404
            ? 'NOT_FOUND'
            : status === 409
              ? 'CONFLICT'
              : 'INTERNAL_ERROR'
      if (status >= 500) console.error('[app-members] mutation error:', err.message)
      return sendSafeError(res, {
        status,
        code,
        message: status >= 500 ? 'Internal server error' : err.message,
        requestId,
      })
    }
  }

  return sendSafeError(res, { status: 400, code: 'BAD_REQUEST', message: `Unknown action: ${action}`, requestId })
}

export default vercelWrapper(handler, { allowedMethods: ['GET', 'POST', 'OPTIONS'] })
