import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

async function request(path, options = {}) {
  return fetch(`${BASE}${path}`, { redirect: 'manual', ...options })
}

describe('Mobile menu API contract', () => {
  it('keeps the mobile route inside the reviewed Vercel function baseline', () => {
    const apiSource = readFileSync('api/menu-content.js', 'utf8')
    const serverSource = readFileSync('server.js', 'utf8')
    const viteSource = readFileSync('vite.config.js', 'utf8')
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))

    assert.match(apiSource, /action === 'mobileMenu'/)
    assert.match(serverSource, /\/api\/mobile\/v1\/menu/)
    assert.match(viteSource, /\/api\/mobile\/v1\/menu/)
    assert.equal(existsSync('api/mobile/menu.js'), false)
    assert.ok(vercel.rewrites.some(rule =>
      rule.source === '/api/mobile/v1/menu' &&
      rule.destination.includes('/api/menu-content?action=mobileMenu'),
    ))
  })

  it('rejects unknown mobile operations before touching authentication or the database', async () => {
    const res = await request('/api/mobile/v1/menu?operation=not-a-real-operation')
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'BAD_REQUEST')
  })

  it('requires a Better Auth session for a known mobile read operation', async () => {
    const res = await request(
      '/api/mobile/v1/menu?operation=getMenu&restaurantUid=1234567890',
    )
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'UNAUTHORIZED')
  })

  it('returns CORS headers for trusted mobile preflights', async () => {
    const res = await request('/api/mobile/v1/menu?operation=getMenu', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dashboard.exzibo.online',
        'Access-Control-Request-Method': 'GET',
      },
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://dashboard.exzibo.online')
  })
})