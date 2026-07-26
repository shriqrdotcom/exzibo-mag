// tests/environment-contract.test.js — Prompt 21 environment contract validation
//
// Validates the canonical server environment contract, safe templates, and the
// client/server secret boundary. Never runs against production infrastructure.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const baseValid = Object.freeze({
  DATABASE_URL: 'postgresql://u:p@localhost/db?sslmode=require',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_BASE_URL: 'https://superadmin.exzibo.online',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://dashboard.exzibo.online',
  GOOGLE_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'a'.repeat(32),
  SUPERADMIN_ALLOWED_EMAILS: 'admin@exzibo.online',
  UPSTASH_REDIS_REST_URL: 'https://your-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'a'.repeat(32),
  R2_ACCOUNT_ID: 'r2-account-id',
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'a'.repeat(32),
  R2_BUCKET_NAME: 'r2-bucket',
  R2_PUBLIC_BASE_URL: 'https://images.exzibo.online',
  REALTIME_URL: 'https://rt.exzibo.online',
  REALTIME_PUBLISH_SECRET: 'a'.repeat(32),
  REALTIME_TICKET_SECRET: 'a'.repeat(32),
})

const baseValidVercel = { ...baseValid, VERCEL_ENV: 'production', VERCEL: '1' }

function env(extra = {}) {
  return { ...baseValid, ...extra }
}

function envVercel(extra = {}) {
  return { ...baseValidVercel, ...extra }
}

function without(env, ...keys) {
  const copy = { ...env }
  for (const k of keys) delete copy[k]
  return copy
}

function clearDynamicEnv() {
  const keys = [
    'DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_BASE_URL', 'BETTER_AUTH_URL',
    'BETTER_AUTH_TRUSTED_ORIGINS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'SUPERADMIN_ALLOWED_EMAILS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL', 'R2_PUBLIC_URL', 'REALTIME_URL', 'REALTIME_PUBLISH_SECRET',
    'REALTIME_TICKET_SECRET', 'APP_RUNTIME', 'PREVIEW_SECRET', 'PREVIEW_EMAIL',
    'PREVIEW_PASSWORD_HASH', 'TRUSTED_PROXY_MODE', 'TRUSTED_PROXY_HOPS', 'VERCEL_ENV',
    'VERCEL', 'NODE_ENV', 'PORT', 'OUTBOX_CONSUMER_ID', 'OUTBOX_BATCH_SIZE',
    'OUTBOX_POLL_INTERVAL_MS', 'OUTBOX_LEASE_DURATION_SEC', 'OUTBOX_NETWORK_TIMEOUT_MS',
    'OUTBOX_HEARTBEAT_INTERVAL_SEC', 'OUTBOX_HEARTBEAT_MAX_AGE_SEC',
    'OUTBOX_MAX_PENDING_AGE_SEC', 'OUTBOX_SHUTDOWN_TIMEOUT_SEC', 'OUTBOX_HEALTH_PORT',
  ]
  for (const k of keys) delete process.env[k]
}

// Helper: scan source for process.env and import.meta.env references.
function findEnvReferences() {
  const refs = { processEnv: new Set(), importMetaEnv: new Set() }
  const srcEntries = ['src', 'api', 'scripts', 'server.js', 'vite.config.js', 'drizzle.config.ts']
  const exts = new Set(['.js', '.ts', '.jsx', '.tsx'])
  function scanFile(full) {
    if (!exts.has(path.extname(full))) return
    const content = fs.readFileSync(full, 'utf8')
    const proc = content.match(/process\.env\.[A-Z_][A-Z0-9_]*/g) || []
    const imp = content.match(/import\.meta\.env\.[A-Z_][A-Z0-9_]*/g) || []
    for (const m of proc) refs.processEnv.add(m.replace('process.env.', ''))
    for (const m of imp) refs.importMetaEnv.add(m.replace('import.meta.env.', ''))
  }
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(full)
      else if (entry.isFile()) scanFile(full)
    }
  }
  for (const d of srcEntries) {
    const full = path.join(root, d)
    if (!fs.existsSync(full)) continue
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full)
    else if (stat.isFile()) scanFile(full)
  }
  return refs
}

// Helper: read .env.example as plain text.
const envExampleText = fs.readFileSync(path.join(root, '.env.example'), 'utf8')

// Helper: list VITE_ variables in source.
function findVitePublicRefs() {
  const refs = new Set()
  const srcDirs = ['src']
  const exts = new Set(['.js', '.ts', '.jsx', '.tsx'])
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(full)
      else if (entry.isFile() && exts.has(path.extname(entry.name))) {
        const content = fs.readFileSync(full, 'utf8')
        const matches = content.match(/VITE_[A-Z_][A-Z0-9_]*/g) || []
        for (const m of matches) refs.add(m)
      }
    }
  }
  for (const d of srcDirs) walk(path.join(root, d))
  return [...refs].sort()
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────────────────────

describe('INVENTORY', () => {
  it('1. Every process.env reference in source is represented in the inventory (.env.example)', () => {
    const refs = findEnvReferences()
    const knownPlatform = new Set([
      'npm_package_version', 'SOURCE_VERSION', 'BUILD_ID', 'HOSTNAME', 'NODE_ENV', 'PORT',
    ])
    const undocumented = [...refs.processEnv]
      .filter(r => !knownPlatform.has(r) && !envExampleText.includes(r))
    assert.deepStrictEqual(undocumented, [], `Undocumented process.env refs: ${undocumented.join(', ')}`)
  })

  it('2. Every import.meta.env reference is classified as public (VITE_ prefix)', () => {
    const refs = findEnvReferences()
    const nonPublic = [...refs.importMetaEnv].filter(r => !r.startsWith('VITE_'))
    assert.deepStrictEqual(nonPublic, [], `Non-public import.meta.env refs: ${nonPublic.join(', ')}`)
  })

  it('3. Obsolete Supabase variables are not required by any active source', () => {
    const refs = findEnvReferences()
    const supabaseRefs = [...refs.processEnv].filter(r => r.includes('SUPABASE'))
    assert.deepStrictEqual(supabaseRefs, [], `Active Supabase process.env refs: ${supabaseRefs.join(', ')}`)
  })

  it('4. No deployable authentication-bypass variable remains in source', () => {
    const refs = findEnvReferences()
    const bypass = ['DISABLE_AUTH', 'VITE_DISABLE_AUTH']
    const found = [...refs.processEnv].filter(r => bypass.includes(r))
    assert.deepStrictEqual(found, [], `Auth bypass env refs found: ${found.join(', ')}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

describe('VALIDATION', () => {
  it('5. Valid production configuration passes for every runtime', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.doesNotThrow(() => m.validateServerEnv('vercel', { env: envVercel() }))
    assert.doesNotThrow(() => m.validateServerEnv('express', { env: env() }))
    assert.doesNotThrow(() => m.validateServerEnv('vite', { env: env() }))
    assert.doesNotThrow(() => m.validateServerEnv('outbox', { env: env() }))
    assert.doesNotThrow(() => m.validateServerEnv('test', { env: env() }))
  })

  it('6. Missing DATABASE_URL fails where database access is required', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.throws(
      () => m.validateServerEnv('express', { env: without(env(), 'DATABASE_URL') }),
      /DATABASE_URL/
    )
  })

  it('7. Missing BETTER_AUTH_SECRET fails for auth runtime in production', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.throws(
      () => m.validateServerEnv('vercel', { env: without(envVercel(), 'BETTER_AUTH_SECRET') }),
      /BETTER_AUTH_SECRET/
    )
  })

  it('8. Missing Redis configuration fails for protected production runtime', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.throws(
      () => m.validateServerEnv('vercel', { env: without(envVercel(), 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN') }),
      /UPSTASH_REDIS_REST_URL/
    )
  })

  it('9. Missing realtime publish secret fails for publisher runtime', async () => {
    const m = await import('../src/config/serverEnv.js')
    const prodEnv = { ...env(), NODE_ENV: 'production' }
    assert.throws(
      () => m.validateServerEnv('express', { env: without(prodEnv, 'REALTIME_PUBLISH_SECRET') }),
      /REALTIME_PUBLISH_SECRET/
    )
  })

  it('10. Invalid URL values fail', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.throws(
      () => m.validateServerEnv('express', { env: { ...env(), DATABASE_URL: 'not-a-url' } }),
      /DATABASE_URL/
    )
  })

  it('11. Invalid integer values fail', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.throws(
      () => m.validateServerEnv('outbox', { env: { ...env(), OUTBOX_BATCH_SIZE: 'abc' } }),
      /OUTBOX_BATCH_SIZE/
    )
  })

  it('12. Contradictory settings fail', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.throws(
      () => m.validateServerEnv('outbox', { env: { ...env(), OUTBOX_LEASE_DURATION_SEC: '5', OUTBOX_NETWORK_TIMEOUT_MS: '10000' } }),
      /OUTBOX_LEASE_DURATION_SEC/
    )
  })

  it('13. Errors contain variable names but not values', async () => {
    const m = await import('../src/config/serverEnv.js')
    let caught
    try {
      m.validateServerEnv('express', { env: without(env(), 'DATABASE_URL') })
    } catch (err) {
      caught = err
    }
    assert.ok(caught)
    assert.ok(caught.message.includes('DATABASE_URL'))
    assert.ok(!caught.message.includes('postgresql://'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT/SECRET BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────

describe('CLIENT SAFETY', () => {
  it('14. Redis token is not exposed to client code', () => {
    const refs = findVitePublicRefs()
    assert.ok(!refs.includes('VITE_UPSTASH_REDIS_REST_TOKEN'), 'VITE Redis token found')
    assert.ok(!refs.includes('VITE_UPSTASH_REDIS_REST_URL'), 'VITE Redis URL found')
  })

  it('15. Better Auth secret is not exposed to client code', () => {
    const refs = findVitePublicRefs()
    assert.ok(!refs.includes('VITE_BETTER_AUTH_SECRET'), 'VITE Better Auth secret found')
  })

  it('16. R2 secret is not exposed to client code', () => {
    const refs = findVitePublicRefs()
    const bad = refs.filter(r => /R2_SECRET|R2_ACCESS_KEY/.test(r))
    assert.deepStrictEqual(bad, [], `VITE R2 secret found: ${bad.join(', ')}`)
  })

  it('17. Realtime publish secret is not exposed to client code', () => {
    const refs = findVitePublicRefs()
    assert.ok(!refs.includes('VITE_REALTIME_PUBLISH_SECRET'), 'VITE realtime publish secret found')
  })

  it('18. VITE variables contain only approved public configuration', () => {
    const refs = findVitePublicRefs()
    const allowed = new Set(['VITE_BETTER_AUTH_URL', 'VITE_REALTIME_URL', 'VITE_R2_PUBLIC_BASE_URL', 'VITE_PREVIEW_MODE'])
    const disallowed = refs.filter(r => !allowed.has(r))
    assert.deepStrictEqual(disallowed, [], `Disallowed VITE variable: ${disallowed.join(', ')}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

describe('TEMPLATES', () => {
  it('19. .env.example contains no real secrets', () => {
    const suspicious = [
      /[a-f0-9]{32,}/i,
      /sk-[a-zA-Z0-9]{16,}/,
      /-----BEGIN (RSA |EC |OPENSSH |PRIVATE KEY-----)/,
      /postgresql:\/\/[^\s:]+:[^\s@]+@/,
    ]
    for (const re of suspicious) {
      assert.ok(!re.test(envExampleText), `.env.example contains suspicious secret-like value: ${re}`)
    }
  })

  it('20. .env.example contains no obsolete Supabase requirements', () => {
    assert.ok(!envExampleText.includes('VITE_SUPABASE_URL'), 'VITE_SUPABASE_URL still documented')
    assert.ok(!envExampleText.includes('VITE_SUPABASE_ANON_KEY'), 'VITE_SUPABASE_ANON_KEY still documented')
    assert.ok(!envExampleText.includes('SUPABASE_SERVICE_ROLE_KEY'), 'SUPABASE_SERVICE_ROLE_KEY still documented')
  })

  it('21. Required active variables are documented in .env.example', () => {
    const required = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_BASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SUPERADMIN_ALLOWED_EMAILS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL', 'REALTIME_URL', 'REALTIME_PUBLISH_SECRET', 'REALTIME_TICKET_SECRET']
    for (const r of required) {
      assert.ok(envExampleText.includes(r), `.env.example missing required variable ${r}`)
    }
  })

  it('22. Optional variables are identified in .env.example', () => {
    assert.ok(envExampleText.includes('OPTIONAL'), '.env.example should mark optional sections')
  })

  it('23. No unsafe auth-disable flag is documented', () => {
    assert.ok(!envExampleText.includes('DISABLE_AUTH'), 'DISABLE_AUTH still documented')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIMES
// ─────────────────────────────────────────────────────────────────────────────

describe('RUNTIMES', () => {
  it('24. Vercel configuration validation passes', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.doesNotThrow(() => m.validateServerEnv('vercel', { env: envVercel() }))
  })

  it('25. Express configuration validation passes', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.doesNotThrow(() => m.validateServerEnv('express', { env: env() }))
  })

  it('26. Vite development configuration passes with explicit dev config', async () => {
    const m = await import('../src/config/serverEnv.js')
    const devEnv = { ...env(), NODE_ENV: 'development' }
    assert.doesNotThrow(() => m.validateServerEnv('vite', { env: devEnv }))
  })

  it('27. Outbox-consumer configuration validation passes', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.doesNotThrow(() => m.validateServerEnv('outbox', { env: env() }))
  })

  it('28. Worker binding validation passes', async () => {
    const m = await import('../src/config/serverEnv.js')
    assert.doesNotThrow(() => m.validateServerEnv('worker', { env: {
      PUBLISH_SECRET: 'a'.repeat(32),
      REALTIME_TICKET_SECRET: 'a'.repeat(32),
    }}))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION
// ─────────────────────────────────────────────────────────────────────────────

describe('REGRESSION', () => {
  it('29. Prompt 18 Redis tests pass', { timeout: 120000 }, () => {
    execSync('node --test tests/redis-protection.test.js', { cwd: root, stdio: 'pipe' })
  })

  it('30. Prompt 20 trusted-IP tests pass', { timeout: 120000 }, () => {
    execSync('node --test tests/client-ip-resolution.test.js', { cwd: root, stdio: 'pipe' })
  })

  it('31. Prompt 19 booking authorization tests pass', { timeout: 120000 }, () => {
    execSync('node --test tests/booking-status-auth-parity.test.js', { cwd: root, stdio: 'pipe' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BUILD / WORKER
// ─────────────────────────────────────────────────────────────────────────────

describe('BUILD AND WORKER', () => {
  it('34. Root production build passes', { timeout: 120000 }, () => {
    execSync('npm run build', { cwd: root, stdio: 'pipe' })
  })

  it('35. Worker TypeScript and Wrangler dry-run pass', { timeout: 120000 }, () => {
    const worker = path.join(root, 'exzibo-realtime')
    execSync('npx wrangler deploy --dry-run', { cwd: worker, stdio: 'pipe' })
  })
})
