import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSecurityEvent,
  logSecurityEvent,
  SECURITY_EVENTS,
} from '../src/monitoring/securityLogger.js'

function capture(fn) {
  const lines = []
  const stdout = console.log
  const stderr = console.error
  console.log = (...args) => lines.push({ stream: 'stdout', text: args.join(' ') })
  console.error = (...args) => lines.push({ stream: 'stderr', text: args.join(' ') })
  try {
    const result = fn()
    return { lines, result }
  } finally {
    console.log = stdout
    console.error = stderr
  }
}

describe('security event logging', () => {
  it('emits one valid JSON record with stable fields and request context', () => {
    const { lines, result } = capture(() => logSecurityEvent({
      event: SECURITY_EVENTS.AUTHORIZATION_DENIAL,
      severity: 'warn',
      outcome: 'denied',
      requestId: 'request-123',
      actorUserId: 'user-123',
      actorRole: 'staff',
      tenantId: 'restaurant-123',
      route: '/api/orders',
      targetResourceType: 'order',
      targetResourceId: 'order-123',
      clientIp: '203.0.113.10',
      userAgent: 'test-agent',
      reasonCode: 'insufficient_role',
      metadata: { status: 403, action: 'update', ignored: 'must-not-appear' },
    }))

    assert.equal(lines.length, 1)
    const entry = JSON.parse(lines[0].text)
    assert.equal(entry.level, 'warn')
    assert.equal(entry.message, 'security_event')
    assert.equal(entry.event, 'authorization_denial')
    assert.equal(entry.outcome, 'denied')
    assert.equal(entry.requestId, 'request-123')
    assert.equal(entry.actorUserId, 'user-123')
    assert.equal(entry.tenantId, 'restaurant-123')
    assert.equal(entry.metadata.status, 403)
    assert.equal(entry.metadata.action, 'update')
    assert.equal(entry.metadata.ignored, undefined)
    assert.match(entry.clientIpHash, /^[a-f0-9]{16}$/)
    assert.equal(result.event, entry.event)
  })

  it('rejects invalid event names and keeps metadata strictly allowlisted', () => {
    const event = buildSecurityEvent({
      event: 'Authorization Denial',
      severity: 'not-a-level',
      outcome: 'not-an-outcome',
      metadata: {
        password: 'secret',
        cookie: 'session=secret',
        authorization: 'Bearer secret',
        body: '{"password":"secret"}',
        stack: 'secret stack',
        reason: 'controlled-reason',
      },
    })

    assert.equal(event.event, 'security_event_invalid')
    assert.equal(event.severity, 'info')
    assert.equal(event.outcome, 'failure')
    assert.deepEqual(event.metadata, { reason: 'controlled-reason' })
    assert.equal(JSON.stringify(event).includes('secret'), false)
  })

  it('rejects well-formed but unregistered event names', () => {
    const event = buildSecurityEvent({
      event: 'future_event_name',
      outcome: 'success',
    })
    assert.equal(event.event, 'security_event_invalid')
  })

  it('does not accept raw cookies, headers, bodies, stack traces, or secrets', () => {
    const event = buildSecurityEvent({
      event: SECURITY_EVENTS.AUTHENTICATION_FAILURE,
      requestId: 'request-456',
      metadata: {
        cookie: 'session=raw-cookie',
        headers: { authorization: 'Bearer raw-token' },
        body: { password: 'raw-password' },
        stack: 'Error: raw-stack',
        secret: 'raw-secret',
      },
    })

    const serialized = JSON.stringify(event)
    assert.equal(serialized.includes('raw-cookie'), false)
    assert.equal(serialized.includes('raw-token'), false)
    assert.equal(serialized.includes('raw-password'), false)
    assert.equal(serialized.includes('raw-stack'), false)
    assert.equal(serialized.includes('raw-secret'), false)
  })

  it('sanitizes sensitive query values in route context', () => {
    const event = buildSecurityEvent({
      event: SECURITY_EVENTS.AUTHORIZATION_DENIAL,
      route: '/api/auth?token=raw-route-token&redirect=/dashboard',
    })
    assert.equal(event.route.includes('raw-route-token'), false)
    assert.match(event.route, /token=REDACTED/)
    assert.match(event.route, /redirect=/)
  })

  it('preserves only safe authoritative identifiers', () => {
    const event = buildSecurityEvent({
      event: SECURITY_EVENTS.SUPERADMIN_ACTION,
      actorUserId: 'server-user',
      tenantId: 'server-tenant',
      actorRole: 'superadmin',
      targetResourceId: 'resource-1',
      requestId: 'request-789',
      actorUserIdFromClient: 'attacker-user',
      restaurantIdFromBody: 'attacker-tenant',
    })

    assert.equal(event.actorUserId, 'server-user')
    assert.equal(event.tenantId, 'server-tenant')
    assert.equal('actorUserIdFromClient' in event, false)
    assert.equal('restaurantIdFromBody' in event, false)
  })

  it('fails closed for malformed input without throwing or breaking a request', () => {
    const result = logSecurityEvent(new Proxy({}, {
      get() {
        throw new Error('malformed event input')
      },
    }))
    assert.equal(result, null)
  })

  it('produces one record per explicit event call', () => {
    const { lines } = capture(() => {
      logSecurityEvent({
        event: SECURITY_EVENTS.RATE_LIMIT_TRIGGERED,
        severity: 'warn',
        outcome: 'blocked',
        requestId: 'request-once',
        reasonCode: 'route_limit',
      })
    })
    assert.equal(lines.length, 1)
    assert.equal(JSON.parse(lines[0].text).event, 'rate_limit_triggered')
  })

  it('supports the canonical outbox failure event', () => {
    const event = buildSecurityEvent({
      event: SECURITY_EVENTS.OUTBOX_FAILURE,
      severity: 'error',
      outcome: 'failure',
      reasonCode: 'outbox_database_error',
    })
    assert.equal(event.event, 'outbox_failure')
  })
})
