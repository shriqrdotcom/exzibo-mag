#!/usr/bin/env node
/**
 * Governance check: scan agent-memory and repository guidance files for
 * unsafe / contradictory instructions that must not be reintroduced.
 *
 * Allowed contexts for mentioning forbidden patterns:
 *   - docs/ARCHITECTURE_SECURITY_INVARIANTS.md (the canonical guide)
 *   - docs/migration-governance.md (explicitly documents prohibited commands)
 *   - tests/governance.test.js (test fixture)
 *   - scripts/governance-check.js (this script's own pattern list)
 *   - Any line under a markdown header containing "Forbidden", "Prohibited",
 *     "Deprecated", or "must not be done" (negative-assertion sections)
 *   - Files inside drizzle/migrations/ (historical migration comments)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());

const SCAN_TARGETS = [
  '.agents/memory',
  'docs',
  'replit.md',
  'README.md',
];

const ALWAYS_ALLOWED_FILES = [
  'docs/ARCHITECTURE_SECURITY_INVARIANTS.md',
  'docs/migration-governance.md',
  'tests/governance.test.js',
  'scripts/governance-check.js',
];

const HEADER_KEYWORDS = ['forbidden', 'prohibited', 'deprecated', 'must not be done', 'must not return', 'unsafe patterns'];

const PATTERNS = [
  {
    name: 'Supabase as primary',
    regex: /Supabase\s+(?:is\s+|as\s+|remains?\s+|stays?\s+)?(?:the\s+)?(?:primary|authoritative|main|active|source\s+of\s+truth)/i,
  },
  {
    name: 'Supabase service role in client',
    regex: /service[-_]?role\s+(?:key\s+)?(?:in\s+client|in\s+browser|frontend|from\s+frontend|exposed\s+to\s+client)/i,
  },
  {
    name: 'VITE_SUPABASE required',
    regex: /VITE_SUPABASE_(?:URL|ANON_KEY|SERVICE_ROLE_KEY)\s+(?:is\s+)?(?:required|needed|mandatory|essential)/i,
  },
  {
    name: 'Auth-disable as deployable',
    regex: /(?:DISABLE_AUTH|VITE_DISABLE_AUTH)\s+(?:in\s+production|deployable|production-ready|production\s+use|server-side|runtime\s+bypass|set\s+on\s+Vercel)/i,
  },
  {
    name: 'Auth bypass as approved',
    regex: /auth[-_]?bypass\s+(?:in\s+production|deployable|production-ready|approved|allowed|set\s+on\s+Vercel)/i,
  },
  {
    name: 'db:push as production migration',
    regex: /(?:db:push|drizzle-kit push)\s+(?:for\s+production|against\s+production|production\s+schema|production\s+database|production\s+migration|deploy\s+to\s+production|shared\s+database)/i,
  },
  {
    name: 'Client-side database write as approved',
    regex: /client[-_]?side\s+(?:database\s+)?write[s]?\s+(?:directly|to\s+database|approved|allowed|primary|from\s+browser)/i,
  },
  {
    name: 'Service-role browser usage',
    regex: /service[-_]?role\s+(?:browser|from\s+browser|in\s+browser|client-side)/i,
  },
  {
    name: 'Fake success fallback',
    regex: /fake\s+success\s+fallback|suppress\s+error[s]?\s+and\s+return\s+success|return\s+success\s+on\s+error|hide\s+error[s]?\s+and\s+pretend/i,
  },
];

function* walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

function getFilesToScan() {
  const files = new Set();
  for (const target of SCAN_TARGETS) {
    const fullPath = join(ROOT, target);
    try {
      const s = statSync(fullPath);
      if (s.isDirectory()) {
        for (const file of walk(fullPath)) {
          const rel = relative(ROOT, file).replace(/\\/g, '/');
          if (extname(file) === '.md') files.add(rel);
        }
      } else if (s.isFile()) {
        files.add(relative(ROOT, fullPath).replace(/\\/g, '/'));
      }
    } catch (err) {
      // target missing; skip
    }
  }
  return Array.from(files).sort();
}

function isUnderNegativeHeader(lines, lineIndex) {
  // Scan backwards from the current line for the nearest markdown header.
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i];
    if (/^#{1,6}\s+/.test(line)) {
      const header = line.toLowerCase();
      return HEADER_KEYWORDS.some(kw => header.includes(kw));
    }
  }
  return false;
}

function isAlwaysAllowed(relPath) {
  return ALWAYS_ALLOWED_FILES.includes(relPath);
}

function checkFile(relPath) {
  const violations = [];
  const content = readFileSync(join(ROOT, relPath), 'utf-8');
  const lines = content.split(/\r?\n/);
  const alwaysAllowed = isAlwaysAllowed(relPath);

  lines.forEach((line, idx) => {
    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        const underNegativeHeader = isUnderNegativeHeader(lines, idx);
        if (alwaysAllowed || underNegativeHeader) {
          continue;
        }
        violations.push({
          file: relPath,
          line: idx + 1,
          pattern: pattern.name,
          text: line.trim().slice(0, 120),
        });
      }
    }
  });

  return violations;
}

function main() {
  const files = getFilesToScan();
  const allViolations = [];
  for (const file of files) {
    allViolations.push(...checkFile(file));
  }

  if (allViolations.length === 0) {
    console.log('Governance check passed: no unsafe guidance found.');
    process.exit(0);
  }

  console.error('Governance check failed: unsafe guidance detected.');
  for (const v of allViolations) {
    console.error(`${v.file}:${v.line}: [${v.pattern}] ${v.text}`);
  }
  process.exit(1);
}

main();
