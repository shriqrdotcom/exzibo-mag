/**
 * tests/release/lib/disposableDb.js
 *
 * Disposable PostgreSQL for release acceptance tests.
 *
 * Rules:
 *   - never connects to production
 *   - uses a uniquely named child database on the CI PostgreSQL service
 *   - starts a local PostgreSQL instance in a temp data directory outside CI
 *   - creates the application database and runs migrations from zero
 *   - cleans up the data directory on stop
 */

import { execFileSync, execSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { closePool, closeTxPool } from '../../../src/db/pg-sql.js'

let _instance = null

const { Client } = pg
const CI_TRUE = /^(1|true|yes)$/i
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function isCiEnvironment(env = process.env) {
  return CI_TRUE.test(String(env.CI || ''))
}

function parseExternalDatabaseUrl(value) {
  if (!value || typeof value !== 'string') return null
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return null
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) return null
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (
    !databaseName ||
    databaseName.includes('/') ||
    !/^exzibo_(ci|test|acceptance)(_|$)/i.test(databaseName) ||
    databaseName === 'template0' ||
    databaseName === 'template1'
  ) {
    return null
  }
  return { parsed, databaseName }
}

export function validateExternalTestDatabaseUrl(value) {
  return Boolean(parseExternalDatabaseUrl(value))
}

export function findPostgresBinary(name, exec = execFileSync) {
  try {
    const bindir = exec('pg_config', ['--bindir'], { encoding: 'utf8' }).trim()
    const candidate = join(bindir, name)
    if (bindir && existsSync(candidate)) return candidate
  } catch {
    // Fall through to PATH lookup.
  }
  try {
    return exec('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' }).trim()
  } catch {
    throw new Error(`PostgreSQL binary "${name}" is unavailable; install PostgreSQL locally or add its bin directory to PATH`)
  }
}

export function findPostgresBin(exec = execFileSync) {
  return findPostgresBinary('postgres', exec)
}

export function findPgCtl(exec = execFileSync) {
  return findPostgresBinary('pg_ctl', exec)
}

export function findPsql(exec = execFileSync) {
  return findPostgresBinary('psql', exec)
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function childDatabaseName() {
  const suffix = `${process.pid}_${Date.now().toString(36)}_${randomBytes(5).toString('hex')}`
  return `exzibo_rc_${suffix}`.slice(0, 63)
}

function databaseUrlForName(externalUrl, databaseName) {
  const parsed = new URL(externalUrl)
  parsed.pathname = `/${encodeURIComponent(databaseName)}`
  return parsed.toString()
}

function adminUrlFor(externalUrl) {
  return databaseUrlForName(externalUrl, 'postgres')
}

function createAdminClient(externalUrl) {
  return new Client({ connectionString: adminUrlFor(externalUrl) })
}

async function provisionBetterAuthTables(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        image TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "session" (
        id TEXT PRIMARY KEY,
        expires_at TIMESTAMP NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"(user_id);
      CREATE TABLE IF NOT EXISTS "account" (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at TIMESTAMP,
        refresh_token_expires_at TIMESTAMP,
        scope TEXT,
        password TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS account_user_id_idx ON "account"(user_id);
      CREATE INDEX IF NOT EXISTS account_provider_idx ON "account"(provider_id, account_id);
      CREATE TABLE IF NOT EXISTS "verification" (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `)
  } finally {
    await client.end()
  }
}

export class DisposablePostgres {
  constructor(options = {}) {
    this.externalDatabaseUrl = options.externalUrl || null
    this.mode = this.externalDatabaseUrl ? 'external' : 'local'
    this.dataDir = this.mode === 'local' ? mkdtempSync(join(tmpdir(), 'exzibo-pg-')) : null
    this.port = 15432 + (process.pid % 1000)
    this.dbName = childDatabaseName()
    this.user = 'postgres'
    this.password = 'acceptance'
    this.process = null
    this.ready = false
    this.databaseCreated = false
    this.cleaned = false
    this.adminClientFactory = options.adminClientFactory || createAdminClient
    this.migrationRunner = options.migrationRunner || runMigrations
    this.authSchemaProvisioner = options.authSchemaProvisioner || provisionBetterAuthTables
    this.exec = options.exec || execSync
    this.spawnProcess = options.spawn || spawn
  }

  async start() {
    if (this.mode === 'external') return this.startExternal()

    const initdb = findPostgresBinary('initdb')
    const postgres = findPostgresBinary('postgres')

    this.exec(`"${initdb}" -D "${this.dataDir}" -U "${this.user}" --auth=trust --no-instructions`, {
      encoding: 'utf8',
      stdio: 'pipe',
    })

    // Configure port
    const conf = join(this.dataDir, 'postgresql.conf')
    const fs = await import('node:fs')
    fs.appendFileSync(conf, `\nport = ${this.port}\nlisten_addresses = 'localhost'\nunix_socket_directories = ''\n`)

    this.process = this.spawnProcess(postgres, ['-D', this.dataDir], {
      stdio: 'pipe',
      env: { ...process.env, PGDATA: this.dataDir },
    })

    // Wait for server to accept connections
    let attempts = 0
    const maxAttempts = 60
    while (attempts < maxAttempts) {
      attempts++
      try {
        this.exec(`"${findPsql()}" -h localhost -p ${this.port} -U "${this.user}" -d postgres -c "SELECT 1"`, {
          encoding: 'utf8',
          stdio: 'pipe',
          env: { ...process.env, PGPASSWORD: this.password },
        })
        break
      } catch {
        await new Promise(r => setTimeout(r, 500))
      }
    }
    if (attempts >= maxAttempts) {
      throw new Error('PostgreSQL failed to start')
    }

    this.exec(`"${findPsql()}" -h localhost -p ${this.port} -U "${this.user}" -d postgres -c "CREATE DATABASE \"${this.dbName}\""`, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, PGPASSWORD: this.password },
    })

    this.ready = true
    return this.databaseUrl
  }

  async startExternal() {
    const admin = this.adminClientFactory(this.externalDatabaseUrl)
    await admin.connect()
    try {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(this.dbName)}`)
      this.databaseCreated = true
    } finally {
      await admin.end()
    }
    this.ready = true
    return this.databaseUrl
  }

  async migrate() {
    if (!this.ready) await this.start()
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = this.databaseUrl
    try {
      await this.migrationRunner(this.databaseUrl)
      await this.authSchemaProvisioner(this.databaseUrl)
    } finally {
      process.env.DATABASE_URL = before
    }
  }

  get databaseUrl() {
    if (this.mode === 'external') return databaseUrlForName(this.externalDatabaseUrl, this.dbName)
    return `postgresql://${this.user}@localhost:${this.port}/${this.dbName}`
  }

  async stop() {
    if (this.cleaned) return
    this.cleaned = true

    if (this.mode === 'external') {
      await closePool(this.databaseUrl).catch(() => {})
      if (!this.databaseCreated) return
      const admin = this.adminClientFactory(this.externalDatabaseUrl)
      await admin.connect()
      try {
        await admin.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [this.dbName]
        )
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(this.dbName)}`)
      } finally {
        await admin.end()
      }
      return
    }

    // Drain the application pool before stopping PostgreSQL to avoid uncaught errors
    try {
      await closePool(this.databaseUrl)
    } catch {
      // ignore if pool was never created
    }
    try {
      await closeTxPool(this.databaseUrl)
    } catch {
      // ignore if the transaction pool was never created
    }
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM')
      await Promise.race([
        new Promise(r => this.process.once('exit', r)),
        new Promise(r => setTimeout(() => { this.process.kill('SIGKILL'); r() }, 5_000)),
      ])
    }
    try {
      rmSync(this.dataDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}

async function runMigrations(databaseUrl) {
  execSync('pnpm exec drizzle-kit migrate', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 120_000,
  })
}

export async function startDisposableDb() {
  if (_instance) return _instance
  const externalUrl = process.env.DATABASE_URL
  if (isCiEnvironment()) {
    if (!externalUrl) {
      throw new Error('CI release acceptance tests require an external test DATABASE_URL')
    }
    if (!validateExternalTestDatabaseUrl(externalUrl)) {
      throw new Error('CI release acceptance DATABASE_URL must be a loopback, non-production PostgreSQL test URL')
    }
  }

  const db = new DisposablePostgres({ externalUrl: isCiEnvironment() ? externalUrl : null })
  try {
    await db.start()
    await db.migrate()
    _instance = db
    return db
  } catch (error) {
    await db.stop().catch(() => {})
    throw error
  }
}

export async function stopDisposableDb() {
  if (_instance) {
    await _instance.stop()
    _instance = null
  }
}
