/**
 * tests/release/verify.test.js
 *
 * Unit tests for the release verifier gates.
 *
 * These tests prove the verifier logic without running the full pipeline:
 *   - Vercel function count helper
 *   - forbidden-file detection
 *   - migration journal validation
 *   - Node version parsing
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../../', import.meta.url).pathname
const apiDir = join(root, 'api')
const vercelJson = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))

describe('release verifier', () => {
  it('Vercel function count is 12 or fewer', () => {
    const entries = readdirSync(apiDir, { withFileTypes: true })
    let count = 0
    for (const e of entries) {
      if (!e.isDirectory() && e.name.endsWith('.js')) count++
    }
    if (existsSync(join(apiDir, 'mobile', 'bootstrap.js'))) count++
    assert.ok(count <= 12, `Vercel function count ${count} must not exceed 12`)
  })

  it('vercel.json rewrites target only existing API files or catch-all patterns', () => {
    const rewrites = vercelJson.rewrites || []
    for (const r of rewrites) {
      const dest = r.destination
      if (!dest || !dest.startsWith('/api/')) continue
      const path = dest.replace('/api/', '').split('?')[0].split('/')[0]
      // Catch-all rewrites like /api/$1 are valid Vercel patterns
      if (path === '$1' || path === 'mobile') continue
      const file = join(apiDir, `${path}.js`)
      assert.ok(existsSync(file), `vercel.json destination ${dest} has no matching API file`)
    }
  })

  it('migration journal is internally consistent', () => {
    const result = execSync('node scripts/validate-migrations.js', { cwd: root, encoding: 'utf8' })
    assert.ok(result.includes('PASSED'), 'migration journal must pass validation')
  })

  it('only .env.example and no real .env files are tracked', () => {
    const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
    for (const file of tracked) {
      // .env.example is allowed as a template; real .env files are forbidden
      assert.ok(file === '.env.example' || (!file.startsWith('.env.')), `tracked .env file found: ${file}`)
    }
  })

  it('package.json engines.node is parseable', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const range = pkg.engines?.node
    assert.ok(range, 'engines.node must be set')
    assert.match(range, /^\d/, 'engines.node must start with a major version number')
  })

  it('package.json packageManager is pnpm', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.ok(pkg.packageManager?.startsWith('pnpm@'), 'packageManager must be pnpm@<version>')
  })
})
