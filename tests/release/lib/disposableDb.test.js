import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  DisposablePostgres,
  findPostgresBinary,
  startDisposableDb,
  validateExternalTestDatabaseUrl,
} from './disposableDb.js'

function fakeAdminClient(queries) {
  return {
    async connect() {},
    async query(text, params) {
      queries.push({ text, params })
      return { rows: [] }
    },
    async end() {},
  }
}

describe('release acceptance disposable database harness', () => {
  it('accepts only loopback PostgreSQL test URLs for external mode', () => {
    assert.equal(validateExternalTestDatabaseUrl('postgresql://user:password@127.0.0.1:5432/exzibo_ci'), true)
    assert.equal(validateExternalTestDatabaseUrl('postgresql://user:password@localhost:5432/exzibo_test'), true)
    assert.equal(validateExternalTestDatabaseUrl('postgresql://user:password@127.0.0.1:5432/customer_db'), false)
    assert.equal(validateExternalTestDatabaseUrl('postgresql://user:password@db.example.com:5432/exzibo_ci'), false)
    assert.equal(validateExternalTestDatabaseUrl('not-a-database-url'), false)
  })

  it('external mode creates a unique child database without local process execution', async () => {
    const queries = []
    let processCalls = 0
    let migrations = 0
    const db = new DisposablePostgres({
      externalUrl: 'postgresql://user:password@127.0.0.1:5432/exzibo_ci',
      adminClientFactory: () => fakeAdminClient(queries),
      migrationRunner: async () => { migrations++ },
      exec: () => { processCalls++ },
      spawn: () => { processCalls++ },
    })
    const databaseUrl = await db.start()
    assert.equal(db.mode, 'external')
    assert.notEqual(databaseUrl, db.externalDatabaseUrl)
    assert.match(databaseUrl, /exzibo_rc_/)
    assert.equal(queries.length, 1)
    assert.match(queries[0].text, /^CREATE DATABASE "exzibo_rc_/)
    assert.equal(processCalls, 0)
    assert.equal(migrations, 0)
  })

  it('external migration uses the child connection and cleanup only drops that child', async () => {
    const queries = []
    let migratedUrl = null
    let provisionedUrl = null
    const db = new DisposablePostgres({
      externalUrl: 'postgresql://user:password@127.0.0.1:5432/exzibo_ci',
      adminClientFactory: () => fakeAdminClient(queries),
      migrationRunner: async url => { migratedUrl = url },
      authSchemaProvisioner: async url => { provisionedUrl = url },
    })
    await db.start()
    await db.migrate()
    await db.stop()
    await db.stop()
    assert.equal(migratedUrl, db.databaseUrl)
    assert.equal(provisionedUrl, db.databaseUrl)
    assert.equal(queries.filter(q => q.text.startsWith('DROP DATABASE')).length, 1)
    assert.match(queries.at(-1).text, /^DROP DATABASE IF EXISTS "exzibo_rc_/)
    assert.doesNotMatch(queries.at(-1).text, /exzibo_ci/)
    assert.equal(db.dataDir, null)
    assert.equal(db.process, null)
  })

  it('local binary resolution is runtime-based and has no Replit absolute fallback', () => {
    const calls = []
    const fakeExec = (command, args) => {
      calls.push([command, args])
      if (command === 'pg_config') return '/bin\n'
      throw new Error('not reached')
    }
    assert.equal(findPostgresBinary('sh', fakeExec), '/bin/sh')
    assert.deepEqual(calls[0], ['pg_config', ['--bindir']])
    const source = readFileSync(new URL('./disposableDb.js', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\/nix\/store\//)
    assert.doesNotMatch(source, /replit-runtime-path/)
  })

  it('local mode owns a temp directory and cleanup is idempotent', async () => {
    const db = new DisposablePostgres()
    const dataDir = db.dataDir
    assert.equal(db.mode, 'local')
    assert.equal(existsSync(dataDir), true)
    await db.stop()
    await db.stop()
    assert.equal(existsSync(dataDir), false)
  })

  it('CI without DATABASE_URL fails closed instead of starting local PostgreSQL', async () => {
    const before = { CI: process.env.CI, DATABASE_URL: process.env.DATABASE_URL }
    process.env.CI = 'true'
    delete process.env.DATABASE_URL
    try {
      await assert.rejects(
        startDisposableDb(),
        /CI release acceptance tests require an external test DATABASE_URL/
      )
    } finally {
      if (before.CI === undefined) delete process.env.CI
      else process.env.CI = before.CI
      if (before.DATABASE_URL === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = before.DATABASE_URL
    }
  })
})