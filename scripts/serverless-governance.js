#!/usr/bin/env node

/**
 * Serverless architecture governance.
 *
 * This is intentionally a validator, not a router. The route contract describes
 * the reviewed public surface; vercel.json remains the runtime routing config.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const CONTRACT_PATH = join(ROOT, 'docs/serverless-route-contract.json')
const VERCEL_PATH = join(ROOT, 'vercel.json')
const API_DIR = join(ROOT, 'api')
const EXPECTED_COUNT = 12
const EXCLUDED_DIRS = new Set(['_lib', '__tests__'])
const EXCLUDED_FILES = [/\.test\./, /\.spec\./, /^index\./]

export function loadContract() {
  return JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'))
}

export function listDeployableHandlers(dir = API_DIR, prefix = '') {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('_')) continue
      files.push(...listDeployableHandlers(
        join(dir, entry.name),
        prefix ? `${prefix}/${entry.name}` : entry.name,
      ))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    if (EXCLUDED_FILES.some(pattern => pattern.test(entry.name))) continue
    files.push(prefix ? `${prefix}/${entry.name}` : entry.name)
  }
  return files.sort()
}

function parseDestination(destination) {
  const [path, query = ''] = destination.split('?')
  const params = new URLSearchParams(query)
  return {
    handler: path.replace(/^\/api\//, '') + '.js',
    action: params.get('action'),
  }
}

export function concreteRewrites(vercel = JSON.parse(readFileSync(VERCEL_PATH, 'utf8'))) {
  return (vercel.rewrites || []).filter(rule => {
    if (!rule || typeof rule.source !== 'string') return false
    return rule.source.startsWith('/api/') &&
      !rule.source.includes('(.*)') &&
      !rule.source.endsWith('/:path*') &&
      rule.destination?.startsWith('/api/')
  })
}

function routeKey(route) {
  return `${route.publicPath} ${route.action || ''}`
}

export function validateGovernance() {
  const contract = loadContract()
  const vercel = JSON.parse(readFileSync(VERCEL_PATH, 'utf8'))
  const handlers = listDeployableHandlers()
  const errors = []

  if (handlers.length !== EXPECTED_COUNT) {
    errors.push(`Expected exactly ${EXPECTED_COUNT} deployable handlers, found ${handlers.length}`)
  }
  if (JSON.stringify(handlers) !== JSON.stringify([...contract.functionBaseline].sort())) {
    errors.push(`Function baseline mismatch: ${handlers.join(', ')}`)
  }

  for (const handler of handlers) {
    if (!contract.handlers[handler]) errors.push(`Missing handler contract: ${handler}`)
  }
  for (const handler of Object.keys(contract.handlers)) {
    if (!handlers.includes(handler)) errors.push(`Contract names non-deployable handler: ${handler}`)
    if (!existsSync(join(API_DIR, handler))) errors.push(`Contract handler does not exist: ${handler}`)
  }

  const routes = contract.routes || []
  const routeKeys = new Set()
  for (const route of routes) {
    if (!route.publicPath.startsWith('/api/')) errors.push(`Non-API route in contract: ${route.publicPath}`)
    const key = routeKey(route)
    if (routeKeys.has(key)) errors.push(`Duplicate contract route: ${key}`)
    routeKeys.add(key)
    if (!contract.handlers[route.handler]) errors.push(`Route uses unknown handler: ${route.handler}`)
    if (route.action && !contract.handlers[route.handler]?.actions.includes(route.action)) {
      errors.push(`Route uses unknown action ${route.action} on ${route.handler}`)
    }
  }

  const rewrites = concreteRewrites(vercel)
  const rewriteSources = new Set()
  for (const rewrite of rewrites) {
    if (rewriteSources.has(rewrite.source)) errors.push(`Duplicate rewrite source: ${rewrite.source}`)
    rewriteSources.add(rewrite.source)
    const destination = parseDestination(rewrite.destination)
    if (!handlers.includes(destination.handler)) {
      errors.push(`Rewrite destination does not resolve to a handler: ${rewrite.destination}`)
      continue
    }
    if (destination.action && !contract.handlers[destination.handler].actions.includes(destination.action)) {
      errors.push(`Rewrite action is not implemented: ${rewrite.destination}`)
    }
    const expectedAction = destination.action || contract.handlers[destination.handler].defaultAction || null
    const matches = routes.filter(route =>
      route.publicPath === rewrite.source &&
      route.handler === destination.handler &&
      route.action === expectedAction,
    )
    if (matches.length !== 1) {
      errors.push(`Rewrite is missing or ambiguous in route contract: ${rewrite.source} -> ${rewrite.destination}`)
    }
  }

  return { errors, handlers, rewrites, contract }
}

export function printReport(result) {
  console.log(`Deployable Vercel functions: ${result.handlers.length}`)
  for (const handler of result.handlers) console.log(`  - api/${handler}`)
  console.log(`Concrete API rewrites validated: ${result.rewrites.length}`)
  if (result.errors.length) {
    console.error('\nSERVERLESS GOVERNANCE FAILED')
    for (const error of result.errors) console.error(`  - ${error}`)
    return false
  }
  console.log('SERVERLESS GOVERNANCE PASSED')
  return true
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(printReport(validateGovernance()) ? 0 : 1)
}