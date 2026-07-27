/**
 * tests/release/lib/disposableDb.js
 *
 * Disposable PostgreSQL for release acceptance tests.
 *
 * Rules:
 *   - never connects to production
 *   - starts a local PostgreSQL instance in a temp data directory
 *   - creates the application database and runs migrations from zero
 *   - cleans up the data directory on stop
 */

import { execSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

let _instance = null

export function findPostgresBin() {
  try {
    return execSync('which postgres', { encoding: 'utf8' }).trim()
  } catch {
    return '/nix/store/h8lc486l7m2j4qxrgc0cf3ild1n9xjlr-replit-runtime-path/bin/postgres'
  }
}

export function findPgCtl() {
  try {
    return execSync('which pg_ctl', { encoding: 'utf8' }).trim()
  } catch {
    return '/nix/store/h8lc486l7m2j4qxrgc0cf3ild1n9xjlr-replit-runtime-path/bin/pg_ctl'
  }
}

export function findPsql() {
  try {
    return execSync('which psql', { encoding: 'utf8' }).trim()
  } catch {
    return '/nix/store/h8lc486l7m2j4qxrgc0cf3ild1n9xjlr-replit-runtime-path/bin/psql'
  }
}

export class DisposablePostgres {
  constructor() {
    this.dataDir = mkdtempSync(join(tmpdir(), 'exzibo-pg-'))
    this.port = 15432 + (process.pid % 1000)
    this.dbName = 'exzibo_acceptance'
    this.user = 'postgres'
    this.password = 'acceptance'
    this.process = null
    this.ready = false
  }

  async start() {
    const initdb = findPostgresBin().replace('/postgres', '/initdb')
    const postgres = findPostgresBin()

    execSync(`"${initdb}" -D "${this.dataDir}" -U "${this.user}" --auth=trust --no-instructions`, {
      encoding: 'utf8',
      stdio: 'pipe',
    })

    // Configure port
    const conf = join(this.dataDir, 'postgresql.conf')
    const fs = await import('node:fs')
    fs.appendFileSync(conf, `\nport = ${this.port}\nlisten_addresses = 'localhost'\nunix_socket_directories = ''\n`)

    this.process = spawn(postgres, ['-D', this.dataDir], {
      stdio: 'pipe',
      env: { ...process.env, PGDATA: this.dataDir },
    })

    // Wait for server to accept connections
    let attempts = 0
    const maxAttempts = 60
    while (attempts < maxAttempts) {
      attempts++
      try {
        execSync(`"${findPsql()}" -h localhost -p ${this.port} -U "${this.user}" -d postgres -c "SELECT 1"`, {
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

    execSync(`"${findPsql()}" -h localhost -p ${this.port} -U "${this.user}" -d postgres -c "CREATE DATABASE \"${this.dbName}\""`, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, PGPASSWORD: this.password },
    })

    this.ready = true
    return this.databaseUrl
  }

  async migrate() {
    if (!this.ready) await this.start()
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = this.databaseUrl
    try {
      execSync('pnpm exec drizzle-kit migrate', {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: this.databaseUrl },
        timeout: 120_000,
      })
    } finally {
      process.env.DATABASE_URL = before
    }
  }

  get databaseUrl() {
    return `postgresql://${this.user}@localhost:${this.port}/${this.dbName}`
  }

  async stop() {
    // Drain the application pool before stopping PostgreSQL to avoid uncaught errors
    try {
      const { getPool } = await import('../../../src/db/pg-sql.js')
      const pool = getPool(this.databaseUrl)
      await pool.end()
    } catch {
      // ignore if pool was never created
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

export async function startDisposableDb() {
  if (_instance) return _instance
  const db = new DisposablePostgres()
  await db.start()
  await db.migrate()
  _instance = db
  return db
}

export async function stopDisposableDb() {
  if (_instance) {
    await _instance.stop()
    _instance = null
  }
}
