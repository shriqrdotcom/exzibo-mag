import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBrowserSecurityHeaders,
  applyDocumentSecurityHeaders,
  getProductionDocumentCsp,
  isHtmlDocumentRequest,
} from '../api/_lib/browser-security.js'
import { safeExternalUrl } from '../src/lib/safeExternalUrl.js'
import { getPublicImageUrl } from '../src/lib/imageUrl.js'
import fs from 'node:fs'
import path from 'node:path'

function makeRes() {
  return {
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value },
  }
}

describe('browser security headers', () => {
  it('keeps the API baseline consistent and adds HSTS only for production HTTPS', () => {
    const dev = makeRes()
    applyBrowserSecurityHeaders(dev, { req: { protocol: 'http' }, env: { NODE_ENV: 'development' } })
    assert.equal(dev.headers['Strict-Transport-Security'], undefined)
    assert.equal(dev.headers['X-Frame-Options'], 'DENY')
    assert.equal(dev.headers['X-Content-Type-Options'], 'nosniff')

    const prod = makeRes()
    applyBrowserSecurityHeaders(prod, { req: { headers: { 'x-forwarded-proto': 'https' } }, env: { VERCEL_ENV: 'production' } })
    assert.equal(prod.headers['Strict-Transport-Security'], 'max-age=31536000')
  })

  it('emits a restrictive report-only policy for production documents', () => {
    const res = makeRes()
    applyDocumentSecurityHeaders(res, { req: { protocol: 'https' }, env: { VERCEL_ENV: 'production' } })
    const csp = res.headers['Content-Security-Policy-Report-Only']
    assert.ok(csp)
    assert.match(csp, /script-src 'self'/)
    assert.match(csp, /object-src 'none'/)
    assert.match(csp, /base-uri 'none'/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.doesNotMatch(csp, /script-src[^;]*\*/)
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-(?:inline|eval)/)
    assert.match(csp, /https:\/\/images\.exzibo\.online/)
    assert.match(csp, /wss:\/\/rt\.exzibo\.online/)
    assert.equal(getProductionDocumentCsp(), csp)
  })

  it('identifies SPA documents without classifying APIs or assets as documents', () => {
    assert.equal(isHtmlDocumentRequest({ method: 'GET', url: '/' }), true)
    assert.equal(isHtmlDocumentRequest({ method: 'GET', url: '/dashboard/orders' }), true)
    assert.equal(isHtmlDocumentRequest({ method: 'GET', url: '/api/orders' }), false)
    assert.equal(isHtmlDocumentRequest({ method: 'GET', url: '/assets/index.js' }), false)
  })

  it('keeps the Vercel document header rule away from API paths', () => {
    const vercel = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'vercel.json'), 'utf8'))
    const rule = vercel.headers.find(entry => entry.headers.some(header => header.key === 'Content-Security-Policy-Report-Only'))
    assert.ok(rule)
    assert.match(rule.source, /api/)
    const csp = rule.headers.find(header => header.key === 'Content-Security-Policy-Report-Only').value
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-(?:inline|eval)/)
    assert.match(csp, /frame-ancestors 'none'/)
  })
})

describe('browser URL and image sinks', () => {
  it('allows HTTP(S) links and rejects executable or local schemes', () => {
    assert.equal(safeExternalUrl('example.com/path'), 'https://example.com/path')
    assert.equal(safeExternalUrl('https://example.com/reviews'), 'https://example.com/reviews')
    assert.equal(safeExternalUrl('javascript:alert(1)'), null)
    assert.equal(safeExternalUrl('data:text/html,alert(1)'), null)
    assert.equal(safeExternalUrl('//evil.example'), null)
  })

  it('rejects executable image schemes while retaining supported previews', () => {
    assert.equal(getPublicImageUrl('javascript:alert(1)'), '')
    assert.equal(getPublicImageUrl('data:image/png;base64,abc'), 'data:image/png;base64,abc')
    assert.equal(getPublicImageUrl('/menu/wagyu-ribeye.png'), '/menu/wagyu-ribeye.png')
  })
})