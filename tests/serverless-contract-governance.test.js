import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  concreteRewrites,
  listDeployableHandlers,
  loadContract,
  validateGovernance,
} from '../scripts/serverless-governance.js'

const contract = loadContract()

describe('Canonical serverless route contract', () => {
  it('matches the exact 12-function baseline', () => {
    const handlers = listDeployableHandlers()
    assert.deepEqual(handlers, [...contract.functionBaseline].sort())
    assert.equal(handlers.length, 12)
  })

  it('covers every concrete Vercel rewrite exactly once', () => {
    const result = validateGovernance()
    assert.deepEqual(result.errors, [])
    assert.ok(result.rewrites.length > 0)
  })

  it('excludes catch-all and SPA fallback rewrites from function governance', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const concrete = concreteRewrites(vercel)
    assert.ok(vercel.rewrites.some(rule => rule.source === '/api/(.*)'))
    assert.ok(vercel.rewrites.some(rule => rule.destination === '/index.html'))
    assert.ok(concrete.every(rule => !rule.source.includes('(.*)')))
  })

  it('does not count helpers, tests, or nested non-handler modules', () => {
    const handlers = listDeployableHandlers()
    assert.ok(!handlers.some(file => file.startsWith('_lib/')))
    assert.ok(!handlers.some(file => file.startsWith('__tests__/')))
    assert.ok(!handlers.some(file => /\.test\.|\.spec\./.test(file)))
    assert.ok(handlers.includes('mobile/bootstrap.js'))
  })

  it('fails closed for unknown contract actions and destinations', () => {
    const result = validateGovernance()
    assert.ok(result.contract.handlers['system.js'].actions.includes('liveness'))
    assert.ok(!result.errors.some(error => error.includes('unknown action')))
  })

  it('describes every route with the complete boundary contract', () => {
    const required = [
      'publicPath', 'handler', 'action', 'methods', 'access', 'cors',
      'bodySize', 'noStore', 'requestId', 'unsupportedMethod', 'unknownAction',
    ]
    for (const route of contract.routes) {
      for (const field of required) assert.ok(field in route, `${route.publicPath} lacks ${field}`)
      assert.ok(Array.isArray(route.methods) && route.methods.length > 0)
    }
  })

  it('keeps system DDL/migration actions outside the contract', () => {
    const system = contract.handlers['system.js']
    assert.deepEqual(system.actions, ['liveness', 'readiness', 'appMembers'])
    assert.ok(!system.actions.some(action => /migrat|schema|ddl|database/i.test(action)))
  })

  it('requires shared security boundary coverage for deployable adapters', () => {
    const source = readFileSync('api/_lib/security-middleware.js', 'utf8')
    for (const requiredExport of ['vercelWrapper', 'viteWrapper', 'expressSecurityMiddleware', 'setRequestId', 'applySecurityHeaders']) {
      assert.ok(source.includes(`export function ${requiredExport}`), `${requiredExport} must remain shared`)
    }
  })
})