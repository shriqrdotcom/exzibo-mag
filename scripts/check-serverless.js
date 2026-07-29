#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'attached_assets', '.local'])
const SECRET_FIXTURE = 'tests/restaurant-dto-response-security.test.js'

function run(label, command, args) {
  console.log(`\n── ${label}`)
  try {
    execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', env: process.env })
  } catch (error) {
    console.error(`\n${label} failed`)
    process.exitCode = error.status || 1
    throw error
  }
}

function sourceFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(file => {
    if (!file || file.startsWith('.local/') || file.startsWith('attached_assets/')) return false
    return /\.(js|mjs|cjs|json|jsonc|ts|tsx|jsx|md)$/.test(file)
  }).map(file => join(ROOT, file))
}

function scanSourceSafety() {
  const conflict = /^(<<<<<<<|=======|>>>>>>>)/
  const secret = /(AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,})/
  const failures = []
  for (const file of sourceFiles()) {
    const relativePath = relative(ROOT, file)
    if (relativePath === SECRET_FIXTURE) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      if (conflict.test(line)) failures.push(`${relativePath}:${index + 1}: conflict marker`)
      if (secret.test(line)) failures.push(`${relativePath}:${index + 1}: secret pattern`)
    })
  }
  if (failures.length) {
    console.error(failures.join('\n'))
    throw new Error('source safety scan failed')
  }
  console.log('Source safety scans passed')
}

try {
  run('Canonical route and rewrite governance', 'node', ['scripts/serverless-governance.js'])
  run('Route contract and function-count tests', 'node', [
    '--test',
    'tests/serverless-contract-governance.test.js',
    'tests/vercel-function-count.test.js',
  ])
  run('Runtime parity and API contract tests', 'node', [
    '--test',
    'tests/route-parity.test.js',
    'tests/api-contract-hardening.test.js',
  ])
  run('Security regression tests', 'node', [
    '--test',
    'tests/auth-boundary-hardening.test.js',
    'tests/core-api-security-boundary.test.js',
    'tests/restaurant-dto-response-security.test.js',
    'tests/preview-auth-security.test.js',
    'tests/authorization-policy.test.js',
    'tests/authorization.test.js',
  ])
  console.log('\n── Conflict-marker and committed-secret scans')
  scanSourceSafety()
  console.log('\nSERVERLESS CHECK PASSED')
} catch {
  process.exitCode = process.exitCode || 1
}