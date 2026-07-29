#!/usr/bin/env node

/**
 * Optional authorized Vercel build verification.
 *
 * Ordinary CI does not install or require the Vercel CLI. Set
 * SERVERLESS_RELEASE_VERIFY=1 in an authorized environment to run it.
 * Missing metadata or CLI is BLOCKED and exits non-zero.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

function blocked(reason) {
  console.error(`BLOCKED: ${reason}`)
  process.exitCode = 2
}

if (process.env.SERVERLESS_RELEASE_VERIFY !== '1') {
  blocked('set SERVERLESS_RELEASE_VERIFY=1 in an authorized release environment')
} else if (!existsSync('vercel.json')) {
  blocked('vercel.json is unavailable')
} else {
  try {
    execFileSync('vercel', ['build'], { stdio: 'inherit', env: process.env })
    console.log('Vercel build completed; generated output inspection is environment-specific.')
  } catch {
    blocked('Vercel CLI is unavailable or vercel build failed')
  }
}