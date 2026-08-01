#!/usr/bin/env node

/**
 * Run the complete test inventory one file at a time.
 *
 * Several database-backed suites intentionally provision and clean up shared
 * tables. Running all files through one node --test invocation lets Node run
 * file workers concurrently, which makes those suites race with one another.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const testRoots = ['tests', 'api/__tests__']

function collectTests(directory) {
  const absoluteDirectory = join(root, directory)
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(absoluteDirectory, entry.name)
      if (entry.isDirectory()) return collectTests(relative(root, path))
      return entry.isFile() && entry.name.endsWith('.test.js') ? [path] : []
    })
}

const testFiles = testRoots
  .flatMap(collectTests)
  .filter((path) => statSync(path).isFile())
  .sort()

for (const testFile of testFiles) {
  console.log(`\n── Running ${relative(root, testFile)} ──`)
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
