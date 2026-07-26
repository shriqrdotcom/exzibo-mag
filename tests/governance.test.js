import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GUIDE = join(ROOT, 'docs', 'ARCHITECTURE_SECURITY_INVARIANTS.md');

const requiredInvariantPhrases = [
  'Neon PostgreSQL is the authoritative database',
  'Drizzle SQL migrations are the source of schema changes',
  'No production `db:push` workflow',
  'Better Auth is the authentication system',
  'Server-side authorization is mandatory',
  'Client-provided identifiers are never trusted',
  'Multi-tenant access must be server-resolved',
  'Redis / Upstash abuse controls fail closed in production',
  'Cloudflare R2 is used for media storage with server-side validation',
  'Cloudflare Worker + Durable Object deliver realtime updates',
  'Realtime events use immutable outbox row IDs as event IDs',
  'Outbox processing requires claim/lease ownership and a dedicated consumer',
  'Environment secrets are validated and never printed',
  'Public DTOs and private DTOs remain separated',
  'Production code must not use auth-disable or fake-success flags',
  'Future agents must not commit generated prompts, screenshots, or attached assets',
];

const forbiddenPatterns = [
  'Supabase as the primary or authoritative database.',
  'Supabase service-role key used in client/browser code.',
  '`VITE_SUPABASE_URL` treated as a required active configuration.',
  '`DISABLE_AUTH` or `VITE_DISABLE_AUTH` as a deployable/production auth bypass.',
  '`db:push` or `drizzle-kit push` as a production migration path.',
  'Client-side database writes outside server-side API handlers.',
  'Fake success fallbacks that suppress or hide real errors.',
];

describe('Architecture security invariants', () => {
  it('has a canonical invariants guide', () => {
    assert(existsSync(GUIDE), 'docs/ARCHITECTURE_SECURITY_INVARIANTS.md must exist');
  });

  it('guide contains all required invariants', () => {
    const guide = readFileSync(GUIDE, 'utf-8');
    for (const phrase of requiredInvariantPhrases) {
      assert(
        guide.includes(phrase),
        `Canonical guide must include invariant: "${phrase}"`
      );
    }
  });

  it('guide explicitly forbids the known unsafe patterns', () => {
    const guide = readFileSync(GUIDE, 'utf-8');
    for (const phrase of forbiddenPatterns) {
      assert(
        guide.includes(phrase),
        `Canonical guide must explicitly forbid: "${phrase}"`
      );
    }
  });
});

describe('Governance scan', () => {
  it('does not flag active guidance as unsafe', () => {
    const result = execFileSync('node', ['scripts/governance-check.js'], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    assert(result.includes('Governance check passed'), `Governance check failed: ${result}`);
  });
});
