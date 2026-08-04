/**
 * Static and unauthenticated contract checks for the App Members system.
 *
 * Database-backed mutation and claim tests require a real Better Auth session
 * and are intentionally kept separate from the deterministic source checks.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'

const service = await readFile('api/_lib/app-members-service.js', 'utf8')
const system = await readFile('api/system.js', 'utf8')
const mobile = await readFile('api/mobile/bootstrap.js', 'utf8')
const page = await readFile('src/pages/AppMembers.jsx', 'utf8')
const vercel = await readFile('vercel.json', 'utf8')

describe('App Members authorization and role contract', () => {
  it('is routed through the existing system function instead of adding a Vercel function', () => {
    assert.match(vercel, /\/api\/app-members/)
    assert.match(system, /authorizeSuperadmin\(req, res\)/)
    assert.match(system, /action === 'appMembers'/)
  })

  it('defines exactly the approved mobile roles', () => {
    assert.match(service, /APP_MEMBER_ROLES = Object\.freeze\(\['owner', 'admin', 'staff'\]\)/)
    assert.match(service, /role must be one of OWNER, ADMIN, or STAFF/)
    assert.doesNotMatch(service, /APP_MEMBER_ROLES[\s\S]{0,120}manager/)
  })

  it('resolves restaurant scope from the permanent UID on the server', () => {
    assert.match(service, /getNeonRestaurantByUid\(uid\.trim\(\)\)/)
    assert.match(service, /restaurant_id = \$1::uuid/)
    assert.match(service, /Member does not belong to this restaurant/)
  })

  it('never accepts client ownership or user identity fields', () => {
    assert.doesNotMatch(service, /owner_id\s*:/)
    assert.match(service, /lookupUserIdentityByEmail/)
    assert.match(service, /resolvedUserId/)
    assert.match(service, /user_id IS NULL/)
  })

  it('claims pending rows only for a verified email and linked user id', () => {
    assert.match(service, /emailVerified !== true/)
    assert.match(service, /user_id IS NULL/)
    assert.match(service, /SET user_id = \$1/)
    assert.match(mobile, /claimPendingAppMemberships/)
    assert.match(mobile, /WHERE rm\.user_id IS NOT NULL/)
  })

  it('fails mobile bootstrap closed when no eligible membership exists', () => {
    assert.match(mobile, /status: 403/)
    assert.match(mobile, /No active mobile membership found/)
    assert.doesNotMatch(mobile, /manager:\s+Object\.freeze/)
  })

  it('does not expose the internal Better Auth user id in the mobile DTO', () => {
    assert.doesNotMatch(mobile, /id:\s*user\.id/)
    assert.doesNotMatch(mobile, /user:\s*\{[\s\S]*?\bid:\s*/)
  })
})

describe('App Members UI contract', () => {
  it('uses persisted API data and has no mock directory seeds', () => {
    assert.match(page, /fetch\(url/)
    assert.match(page, /\/api\/app-members/)
    assert.doesNotMatch(page, /INITIAL_RESTAURANTS|MOCK_MEMBER_SEEDS|temporary workspace/)
  })

  it('submits only OWNER, ADMIN, and STAFF roles', () => {
    assert.match(page, /const ROLES = \['OWNER', 'ADMIN', 'STAFF'\]/)
    assert.doesNotMatch(page, />Manager</)
  })
})
