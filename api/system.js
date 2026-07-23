import { setAdminCors, applySecurityHeaders } from './_lib/cors.js'
import { processRealtimeOutboxBatch } from '../src/services/realtimeOutboxProcessor.js'
import pg from 'pg'

const { Pool } = pg
let _outboxPool = null
function getOutboxPool() {
  if (!_outboxPool) {
    _outboxPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  }
  return _outboxPool
}

/**
 * Timing-safe comparison of two strings.
 * Borrowed from the realtime Worker — runs in Node.js via crypto.timingSafeEqual.
 */
import { timingSafeEqual } from 'crypto'
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

// ── /api/system — System Handler ────────────────────────────────────────────
//
// All runtime database provisioning and migration endpoints have been removed.
// Database schema changes are managed only through reviewed migrations.
//
// Remaining actions:
//   processRealtimeOutbox  —  protected by OUTBOX_PROCESSOR_SECRET env var
//
// The processRealtimeOutbox action is called by the Cloudflare Worker's
// scheduled() handler on a cron trigger. It processes a bounded batch of
// unpublished outbox events and returns the count.

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

  // ── Protected: processRealtimeOutbox ──────────────────────────────────────
  // Requires OUTBOX_PROCESSOR_SECRET as Bearer token. Fail closed when missing.
  if (action === 'processRealtimeOutbox') {
    const secret = process.env.OUTBOX_PROCESSOR_SECRET
    if (!secret) {
      return res.status(500).json({ error: 'OUTBOX_PROCESSOR_SECRET not configured' })
    }

    const authHeader = req.headers['authorization'] || ''
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' })
    }

    const token = authHeader.slice('Bearer '.length)
    if (!safeCompare(token, secret)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      const published = await processRealtimeOutboxBatch(getOutboxPool())
      return res.status(200).json({ ok: true, published })
    } catch (err) {
      console.error('[system/processRealtimeOutbox] Error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
