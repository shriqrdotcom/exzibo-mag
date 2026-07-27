/**
 * tests/api-validation.test.js — Shared validation layer tests
 *
 * Tests:
 *   1.  validateSlug rejects empty, invalid, and accepts valid slugs
 *   2.  validateEmail rejects invalid, accepts valid emails
 *   3.  validateRestaurantUid rejects invalid, accepts valid UIDs
 *   4.  validateArray rejects non-arrays, validates min/max items
 *   5.  validateBoolean rejects non-booleans
 *   6.  validateIdempotencyKey rejects short/missing keys
 *   7.  defineValidation + validateRequest validate body fields
 *   8.  validateRequest validates query parameters
 *   9.  validateRequest validates path params
 *   10. validateRequest rejects missing required fields
 *   11. validateRequest rejects wrong types
 *   12. validateRequest handles optional fields with defaults
 *   13. strictParsePagination rejects negative limit
 *   14. strictParsePagination rejects limit > MAX
 *   15. Runtime parity: same validation produces same error across sources
 *   16. Existing validateUuid/validateString exports remain unchanged (backward compat)
 *   17. validateRequest with multiple sources (body + query + params)
 *   18. validateEnum rejects invalid enum values
 *   19. validateRequest rejects enum violations
 *   20. Field length validation (minLength/maxLength)
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ValidationError,
  validateSlug,
  validateEmail,
  validateRestaurantUid,
  validateArray,
  validateBoolean,
  validateIdempotencyKey,
  defineValidation,
  validateRequest,
  strictParsePagination,
  validateUuid,
  validateString,
  validateEnum,
  validateNumber,
  generateRequestId,
} from '../api/_lib/validate.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockReq({ body = {}, query = {}, params = {} } = {}) {
  return { body, query, params }
}

// ── 1. validateSlug ──────────────────────────────────────────────────────────

describe('validateSlug', () => {
  it('accepts valid slugs', () => {
    assert.equal(validateSlug('my-restaurant'), 'my-restaurant')
    assert.equal(validateSlug('  my-restaurant  '), 'my-restaurant')
    assert.equal(validateSlug('restaurant42'), 'restaurant42')
    assert.equal(validateSlug('a'), 'a')
  })

  it('rejects empty slug', () => {
    assert.throws(() => validateSlug(''), ValidationError)
    assert.throws(() => validateSlug('   '), ValidationError)
    assert.throws(() => validateSlug(null), ValidationError)
    assert.throws(() => validateSlug(undefined), ValidationError)
  })

  it('rejects invalid slug characters', () => {
    assert.throws(() => validateSlug('My Restaurant'), ValidationError)
    assert.throws(() => validateSlug('my_restaurant'), ValidationError)
    assert.throws(() => validateSlug('my.restaurant'), ValidationError)
    assert.throws(() => validateSlug(''), ValidationError)
  })
})

// ── 2. validateEmail ─────────────────────────────────────────────────────────

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    assert.equal(validateEmail('user@example.com'), 'user@example.com')
    assert.equal(validateEmail(' User@Example.COM '), 'user@example.com')
    assert.equal(validateEmail('a.b@c.co'), 'a.b@c.co')
  })

  it('rejects invalid emails', () => {
    assert.throws(() => validateEmail('not-email'), ValidationError)
    assert.throws(() => validateEmail('@example.com'), ValidationError)
    assert.throws(() => validateEmail('user@'), ValidationError)
  })

  it('returns undefined when not required', () => {
    assert.equal(validateEmail(undefined, 'email', false), undefined)
    assert.equal(validateEmail(null, 'email', false), null)
  })
})

// ── 3. validateRestaurantUid ─────────────────────────────────────────────────

describe('validateRestaurantUid', () => {
  it('accepts valid restaurant UIDs', () => {
    assert.equal(validateRestaurantUid('r-abc12345'), 'r-abc12345')
    assert.equal(validateRestaurantUid('R-DEF67890'), 'r-def67890')
  })

  it('rejects invalid UIDs', () => {
    assert.throws(() => validateRestaurantUid('abc12345'), ValidationError)
    assert.throws(() => validateRestaurantUid(''), ValidationError)
    assert.throws(() => validateRestaurantUid(null), ValidationError)
  })
})

// ── 4. validateArray ─────────────────────────────────────────────────────────

describe('validateArray', () => {
  it('accepts valid arrays', () => {
    assert.deepEqual(validateArray([1, 2, 3], 'items'), [1, 2, 3])
    assert.deepEqual(validateArray([], 'items', { required: false }), [])
  })

  it('rejects non-arrays', () => {
    assert.throws(() => validateArray('not-array', 'items'), ValidationError)
    assert.throws(() => validateArray(42, 'items'), ValidationError)
    assert.throws(() => validateArray({}, 'items'), ValidationError)
  })

  it('validates minItems and maxItems', () => {
    assert.throws(() => validateArray([], 'items', { minItems: 1 }), ValidationError)
    assert.throws(() => validateArray([1, 2, 3], 'items', { maxItems: 2 }), ValidationError)
    assert.doesNotThrow(() => validateArray([1], 'items', { minItems: 1, maxItems: 5 }))
  })
})

// ── 5. validateBoolean ───────────────────────────────────────────────────────

describe('validateBoolean', () => {
  it('accepts booleans', () => {
    assert.equal(validateBoolean(true, 'flag'), true)
    assert.equal(validateBoolean(false, 'flag'), false)
  })

  it('rejects non-booleans', () => {
    assert.throws(() => validateBoolean('true', 'flag'), ValidationError)
    assert.throws(() => validateBoolean(1, 'flag'), ValidationError)
    assert.throws(() => validateBoolean(null, 'flag'), ValidationError)
  })
})

// ── 6. validateIdempotencyKey ────────────────────────────────────────────────

describe('validateIdempotencyKey', () => {
  it('accepts keys of sufficient length', () => {
    assert.equal(validateIdempotencyKey('abcdef1234567890'), 'abcdef1234567890')
    assert.equal(validateIdempotencyKey('a'.repeat(128)), 'a'.repeat(128))
  })

  it('rejects short or missing keys', () => {
    assert.throws(() => validateIdempotencyKey('short'), ValidationError)
    assert.throws(() => validateIdempotencyKey(''), ValidationError)
    assert.throws(() => validateIdempotencyKey(null), ValidationError)
    assert.throws(() => validateIdempotencyKey(undefined), ValidationError)
  })

  it('rejects keys exceeding max length', () => {
    assert.throws(() => validateIdempotencyKey('a'.repeat(129)), ValidationError)
  })
})

// ── 7–9. defineValidation + validateRequest ──────────────────────────────────

describe('validateRequest', () => {
  it('validates body fields by type', () => {
    const bodyDef = defineValidation('body', {
      name: { type: 'string', required: true },
      age: { type: 'integer', required: true },
    })

    const result = validateRequest(mockReq({ body: { name: 'Alice', age: 30 } }), bodyDef)
    assert.equal(result.body.name, 'Alice')
    assert.equal(result.body.age, 30)
  })

  it('validates query parameters', () => {
    const queryDef = defineValidation('query', {
      restaurantId: { type: 'uuid', required: true },
      action: { type: 'string', required: true },
    })

    const result = validateRequest(
      mockReq({ query: { restaurantId: '550e8400-e29b-41d4-a716-446655440000', action: 'list' } }),
      queryDef
    )
    assert.equal(result.query.restaurantId, '550e8400-e29b-41d4-a716-446655440000')
    assert.equal(result.query.action, 'list')
  })

  it('validates path params', () => {
    const paramsDef = defineValidation('params', {
      id: { type: 'uuid', required: true },
    })

    const result = validateRequest(
      mockReq({ params: { id: '550e8400-e29b-41d4-a716-446655440000' } }),
      paramsDef
    )
    assert.equal(result.params.id, '550e8400-e29b-41d4-a716-446655440000')
  })

  it('validates multiple sources at once', () => {
    const bodyDef = defineValidation('body', {
      name: { type: 'string', required: true },
    })
    const queryDef = defineValidation('query', {
      action: { type: 'string', required: true },
    })

    const result = validateRequest(
      mockReq({ body: { name: 'Alice' }, query: { action: 'create' } }),
      bodyDef, queryDef
    )
    assert.equal(result.body.name, 'Alice')
    assert.equal(result.query.action, 'create')
  })

  it('rejects missing required fields', () => {
    const bodyDef = defineValidation('body', {
      name: { type: 'string', required: true },
    })
    assert.throws(() => validateRequest(mockReq({ body: {} }), bodyDef), ValidationError)
  })

  it('rejects wrong types', () => {
    const bodyDef = defineValidation('body', {
      age: { type: 'integer', required: true },
    })
    assert.throws(() => validateRequest(mockReq({ body: { age: 'not-a-number' } }), bodyDef), ValidationError)
  })

  it('handles optional fields with defaults', () => {
    const bodyDef = defineValidation('body', {
      name: { type: 'string', required: true },
      nickname: { type: 'string', required: false, default: 'Anonymous' },
    })

    const result = validateRequest(mockReq({ body: { name: 'Alice' } }), bodyDef)
    assert.equal(result.body.name, 'Alice')
    assert.equal(result.body.nickname, 'Anonymous')
  })

  it('validates enum constraints', () => {
    const queryDef = defineValidation('query', {
      status: { type: 'string', required: true, enum: ['active', 'inactive'] },
    })

    assert.doesNotThrow(() => validateRequest(
      mockReq({ query: { status: 'active' } }), queryDef
    ))
    assert.throws(() => validateRequest(
      mockReq({ query: { status: 'deleted' } }), queryDef
    ), ValidationError)
  })

  it('validates string length constraints', () => {
    const bodyDef = defineValidation('body', {
      title: { type: 'string', required: true, minLength: 2, maxLength: 100 },
    })

    assert.doesNotThrow(() => validateRequest(
      mockReq({ body: { title: 'Hello' } }), bodyDef
    ))
    assert.throws(() => validateRequest(
      mockReq({ body: { title: 'X' } }), bodyDef
    ), ValidationError)
    assert.throws(() => validateRequest(
      mockReq({ body: { title: 'X'.repeat(101) } }), bodyDef
    ), ValidationError)
  })

  it('validates number range constraints', () => {
    const bodyDef = defineValidation('body', {
      score: { type: 'number', required: true, min: 0, max: 100 },
    })

    assert.doesNotThrow(() => validateRequest(
      mockReq({ body: { score: 50 } }), bodyDef
    ))
    assert.throws(() => validateRequest(
      mockReq({ body: { score: -1 } }), bodyDef
    ), ValidationError)
    assert.throws(() => validateRequest(
      mockReq({ body: { score: 101 } }), bodyDef
    ), ValidationError)
  })
})

// ── 10. strictParsePagination ────────────────────────────────────────────────

describe('strictParsePagination', () => {
  it('rejects negative limit', () => {
    assert.throws(() => strictParsePagination({ limit: '-1' }), ValidationError)
    assert.throws(() => strictParsePagination({ limit: 0 }), ValidationError)
  })

  it('rejects limit exceeding maximum', () => {
    assert.throws(() => strictParsePagination({ limit: '101' }), ValidationError)
  })

  it('rejects non-numeric limit', () => {
    assert.throws(() => strictParsePagination({ limit: 'abc' }), ValidationError)
  })

  it('accepts valid limits', () => {
    const result = strictParsePagination({ limit: '25', cursor: 'abc' })
    assert.equal(result.limit, 25)
    assert.equal(result.cursor, 'abc')
  })

  it('returns defaults for empty query', () => {
    const result = strictParsePagination({})
    assert.equal(result.limit, 50)
    assert.equal(result.cursor, null)
  })
})

// ── 11. Backward compatibility ───────────────────────────────────────────────

describe('Backward compatibility', () => {
  it('validateUuid still works as before', () => {
    assert.equal(validateUuid('550e8400-e29b-41d4-a716-446655440000', 'id'), '550e8400-e29b-41d4-a716-446655440000')
    assert.throws(() => validateUuid('', 'id'), ValidationError)
    assert.throws(() => validateUuid('not-a-uuid', 'id'), ValidationError)
  })

  it('validateString still works as before', () => {
    assert.equal(validateString('hello', 'name'), 'hello')
    assert.equal(validateString(undefined, 'name', { required: false }), undefined)
    assert.throws(() => validateString(undefined, 'name'), ValidationError)
  })

  it('validateNumber still works as before', () => {
    assert.equal(validateNumber(42, 'age'), 42)
    assert.throws(() => validateNumber('abc', 'age'), ValidationError)
  })

  it('validateEnum still works as before', () => {
    assert.equal(validateEnum('a', 'letter', ['a', 'b']), 'a')
    assert.throws(() => validateEnum('c', 'letter', ['a', 'b']), ValidationError)
  })

  it('generateRequestId returns a UUID', () => {
    const id = generateRequestId()
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})

// ── 12. Error envelope consistency ───────────────────────────────────────────

describe('Error envelope consistency', () => {
  it('all validators throw ValidationError with status 400', () => {
    const validators = [
      () => validateSlug(''),
      () => validateEmail('bad'),
      () => validateRestaurantUid('bad'),
      () => validateArray('not-array', 'x'),
      () => validateBoolean('true', 'x'),
      () => validateIdempotencyKey('short'),
      () => validateUuid('bad', 'x'),
      () => validateString(undefined, 'x'),
      () => validateNumber('abc', 'x'),
      () => validateEnum('z', 'x', ['a', 'b']),
    ]

    for (const fn of validators) {
      try {
        fn()
        assert.fail('should have thrown')
      } catch (err) {
        assert.ok(err instanceof ValidationError, `${fn} did not throw ValidationError`)
        assert.equal(err.status, 400, `${fn} status must be 400`)
        assert.ok(typeof err.message === 'string' && err.message.length > 0, `${fn} must have a message`)
      }
    }
  })
})

// ── 13. Runtime parity ───────────────────────────────────────────────────────

describe('Runtime parity', () => {
  it('same input produces same validated output regardless of source (body vs query)', () => {
    const bodyDef = defineValidation('body', {
      name: { type: 'string', required: true },
    })
    const queryDef = defineValidation('query', {
      name: { type: 'string', required: true },
    })

    const bodyResult = validateRequest(mockReq({ body: { name: 'Alice' } }), bodyDef)
    const queryResult = validateRequest(mockReq({ query: { name: 'Alice' } }), queryDef)

    assert.equal(bodyResult.body.name, 'Alice')
    assert.equal(queryResult.query.name, 'Alice')
  })

  it('validateRequest throws ValidationError (not generic Error)', () => {
    const bodyDef = defineValidation('body', {
      id: { type: 'uuid', required: true },
    })

    try {
      validateRequest(mockReq({ body: { id: 'not-uuid' } }), bodyDef)
      assert.fail('should have thrown')
    } catch (err) {
      assert.ok(err instanceof ValidationError)
      assert.equal(err.status, 400)
    }
  })
})

// ── 14. Slug, email, uid — end-to-end schema validation ──────────────────────

describe('Schema field types', () => {
  it('validates slug type in schema', () => {
    const def = defineValidation('body', {
      slug: { type: 'slug', required: true },
    })
    assert.doesNotThrow(() => validateRequest(mockReq({ body: { slug: 'my-place' } }), def))
    assert.throws(() => validateRequest(mockReq({ body: { slug: 'My Place' } }), def), ValidationError)
  })

  it('validates email type in schema', () => {
    const def = defineValidation('body', {
      email: { type: 'email', required: true },
    })
    assert.doesNotThrow(() => validateRequest(mockReq({ body: { email: 'user@example.com' } }), def))
    assert.throws(() => validateRequest(mockReq({ body: { email: 'bad' } }), def), ValidationError)
  })

  it('validates restaurantUid type in schema', () => {
    const def = defineValidation('body', {
      uid: { type: 'restaurantUid', required: true },
    })
    assert.doesNotThrow(() => validateRequest(mockReq({ body: { uid: 'r-abc12345' } }), def))
    assert.throws(() => validateRequest(mockReq({ body: { uid: 'abc12345' } }), def), ValidationError)
  })

  it('validates uuid type in schema', () => {
    const def = defineValidation('body', {
      id: { type: 'uuid', required: true },
    })
    assert.doesNotThrow(() => validateRequest(
      mockReq({ body: { id: '550e8400-e29b-41d4-a716-446655440000' } }), def
    ))
    assert.throws(() => validateRequest(mockReq({ body: { id: '123' } }), def), ValidationError)
  })
})
