import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Release manifest tests
 *
 * Proves the release manifest generator emits safe, deterministic metadata
 * and never includes secrets or environment values.
 */

const root = new URL('../../', import.meta.url).pathname
const script = join(root, 'scripts', 'release', 'createReleaseManifest.js')

function run(args = [], env = {}) {
  return execSync(`node ${script} ${args.join(' ')}`, {
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function parseManifest(output) {
  const marker = '--- MANIFEST ---'
  const idx = output.indexOf(marker)
  const json = idx >= 0 ? output.slice(idx + marker.length).trim() : output
  return JSON.parse(json)
}

describe('release manifest', () => {
  it('includes exact SHA', () => {
    const expectedSha = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: root }).trim()
    const manifest = parseManifest(run())
    assert.equal(manifest.git.sha, expectedSha, 'manifest must include exact current SHA')
  })

  it('detects dirty state', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rc-manifest-'))
    execSync('git clone --depth 1 file://' + root + ' .', { cwd: tmpDir })
    // Verify the script exists before running
    const scriptPath = join(tmpDir, 'scripts', 'release', 'createReleaseManifest.js')
    if (!existsSync(scriptPath)) {
      // Some git transports omit the file tree; copy the script directly
      mkdirSync(join(tmpDir, 'scripts', 'release'), { recursive: true })
      writeFileSync(scriptPath, readFileSync(script, 'utf8'))
    }
    writeFileSync(join(tmpDir, 'dirty-marker.txt'), 'dirty')
    const out = execSync('node scripts/release/createReleaseManifest.js', {
      encoding: 'utf8',
      cwd: tmpDir,
      env: process.env,
    })
    const manifest = parseManifest(out)
    assert.equal(manifest.git.clean, false, 'manifest must report dirty working tree')
  })

  it('includes lockfile checksum', () => {
    const manifest = parseManifest(run())
    assert.match(manifest.checksums.lockfile, /^[a-f0-9]{64}$/, 'lockfile checksum must be sha256 hex')
  })

  it('includes migration journal checksum', () => {
    const manifest = parseManifest(run())
    assert.match(manifest.checksums.migrationJournal, /^[a-f0-9]{64}$/, 'migration journal checksum must be sha256 hex')
  })

  it('never includes secrets or environment values', () => {
    const manifest = parseManifest(run([], {
      DATABASE_URL: 'postgresql://user:secret@host/db',
      BETTER_AUTH_SECRET: 'super-secret-value-32-characters-long',
      UPSTASH_REDIS_REST_TOKEN: 'token-value',
    }))
    const flat = JSON.stringify(manifest)
    assert.doesNotMatch(flat, /postgresql:\/\//, 'manifest must not contain database url')
    assert.doesNotMatch(flat, /super-secret-value/, 'manifest must not contain auth secret')
    assert.doesNotMatch(flat, /token-value/, 'manifest must not contain redis token')
  })

  it('includes Vercel function count', () => {
    const manifest = parseManifest(run())
    assert.equal(typeof manifest.vercel.functionCount, 'number')
    assert.ok(manifest.vercel.functionCount > 0, 'function count must be positive')
    assert.ok(manifest.vercel.functionCount <= 12, 'function count must not exceed 12')
    assert.ok(Array.isArray(manifest.vercel.functionFiles))
  })

  it('includes latest migration ID', () => {
    const manifest = parseManifest(run())
    assert.equal(typeof manifest.migrations.latest, 'string')
    assert.ok(manifest.migrations.latest.length > 0, 'latest migration must be non-empty')
  })
})
