// ── Analytics Timezone Utility ────────────────────────────────────────────────
//
// Provides validated, server-owned restaurant timezone resolution and
// timezone-aware date boundary computation for analytics queries.
//
// TIMEZONE POLICY
// ───────────────
//   Source:   restaurant_settings.global_config.timezone (IANA string)
//   Fallback: 'UTC' — explicit, documented, and tested
//   Rationale: UTC fallback produces identical results across any deployment
//              server locale, which server-local time cannot guarantee.
//
// WHAT IS NEVER DONE
// ──────────────────
//   - Client-supplied timezone values are never treated as authoritative
//   - Server-local timezone (process.env.TZ / host OS) is never used for
//     business-day boundaries
//   - Timezone strings are never evaluated
//   - Silent fallback without this documented policy is never permitted
//
// EXPORTS
// ───────
//   ANALYTICS_TZ_FALLBACK              — the documented UTC fallback constant
//   validateTimezone(value)            — boolean: is value a valid IANA tz?
//   getRestaurantAnalyticsTimezone(id) — Promise<string> server-owned tz
//   buildRestaurantDateRange(opts)     — { startUTC, endUTC } UTC instants
//   getLocalDateParts(ts, tz)          — { year, month(0-based), day } or null
//   getLocalMonthKey(ts, tz)           — 'YYYY-MM' string or null
//   getLocalDayKey(ts, tz)             — 'YYYY-MM-DD' string or null

import { neon } from '../db/pg-sql.js'

// Maximum length of a valid IANA timezone string (longest known ~40 chars;
// 64 gives headroom while still rejecting obviously oversized values).
const MAX_TZ_LENGTH = 64

// ── ANALYTICS_TZ_FALLBACK ─────────────────────────────────────────────────────
//
// Fallback when a restaurant has no configured timezone or the stored value
// fails validation.  UTC is the only acceptable fallback because:
//   1. It is timezone-agnostic — same result on any deployment server.
//   2. It is unambiguous — no DST, no named-zone ambiguity.
//   3. All Postgres timestamptz values are stored in UTC.
//
// This constant is exported so tests can assert against it explicitly.
export const ANALYTICS_TZ_FALLBACK = 'UTC'

// ── validateTimezone ──────────────────────────────────────────────────────────
//
// Returns true iff `value` is a known, supported IANA timezone string.
//
// Rejects:
//   - non-string values
//   - empty or whitespace-only strings
//   - strings exceeding MAX_TZ_LENGTH characters
//   - strings not found in Intl.supportedValuesOf('timeZone')
//   - strings that cause Intl.DateTimeFormat to throw
//
// Does NOT evaluate the string as code.
export function validateTimezone(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.length > MAX_TZ_LENGTH) return false

  // Construction-based validation: Intl.DateTimeFormat throws a RangeError for
  // any unrecognised timezone identifier.  We intentionally avoid
  // Intl.supportedValuesOf('timeZone') as the primary check because some Node.js
  // deployments use a limited or legacy ICU dataset that omits valid canonical
  // names (e.g. 'UTC', 'Asia/Kolkata') from the enumerated list while still
  // accepting them at runtime.
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed })
    return true
  } catch {
    return false
  }
}

// ── getRestaurantAnalyticsTimezone ────────────────────────────────────────────
//
// Returns the server-owned IANA timezone string for a restaurant by reading
//   restaurant_settings.global_config->>'timezone'
//
// If the column is absent, the row is missing, the value is invalid, or any
// DB error occurs, returns ANALYTICS_TZ_FALLBACK ('UTC').
//
// Never trusts or accepts a timezone string supplied by the API caller.
export async function getRestaurantAnalyticsTimezone(restaurantId) {
  if (!restaurantId) return ANALYTICS_TZ_FALLBACK

  try {
    const db = neon(process.env.DATABASE_URL)
    const rows = await db`
      SELECT global_config->>'timezone' AS timezone
      FROM restaurant_settings
      WHERE restaurant_id = ${restaurantId}::uuid
      LIMIT 1
    `
    if (!rows.length) return ANALYTICS_TZ_FALLBACK
    const tz = rows[0].timezone
    if (tz && validateTimezone(tz)) return tz
    return ANALYTICS_TZ_FALLBACK
  } catch {
    // DB unavailable or schema mismatch — degrade gracefully to UTC
    return ANALYTICS_TZ_FALLBACK
  }
}

// ── buildRestaurantDateRange ──────────────────────────────────────────────────
//
// Converts local date strings ("YYYY-MM-DD") to UTC-instant ISO strings
// suitable for SQL timestamptz comparison, honouring the restaurant timezone.
//
// If `from` or `to` are already full ISO timestamps (contain 'T') they are
// returned as-is.  Defaults match those in getRestaurantAnalytics:
//   from → 30 days ago (UTC)
//   to   → now (UTC)
//
// @param {{ timezone: string, from?: string, to?: string }}
// @returns {{ startUTC: string, endUTC: string }}
export function buildRestaurantDateRange({ timezone, from, to }) {
  const tz = validateTimezone(timezone) ? timezone : ANALYTICS_TZ_FALLBACK
  return {
    startUTC: _localDateToUTC(from, tz, 'start'),
    endUTC:   _localDateToUTC(to,   tz, 'end'),
  }
}

// ── getLocalDateParts ─────────────────────────────────────────────────────────
//
// Extracts the local calendar date of a UTC timestamp in the given timezone.
//
// @param {string} utcTimestamp — ISO 8601 UTC timestamp string
// @param {string} timezone     — IANA timezone string; falls back to UTC
// @returns {{ year: number, month: number, day: number } | null}
//   month is 0-based (0 = January) for parity with JavaScript Date conventions.
//   Returns null when utcTimestamp is invalid.
export function getLocalDateParts(utcTimestamp, timezone) {
  const tz = validateTimezone(timezone) ? timezone : ANALYTICS_TZ_FALLBACK
  const d = new Date(utcTimestamp)
  if (isNaN(d.getTime())) return null

  const parts = _formatParts(d, tz, { year: 'numeric', month: 'numeric', day: 'numeric' })
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10)

  return {
    year:  get('year'),
    month: get('month') - 1,   // 0-based: January = 0
    day:   get('day'),
  }
}

// ── getLocalMonthKey ──────────────────────────────────────────────────────────
//
// Returns a "YYYY-MM" string for the given UTC timestamp expressed in the
// restaurant timezone.  Used to assign orders to monthly revenue buckets.
//
// @param {string} utcTimestamp — ISO 8601 UTC timestamp
// @param {string} timezone     — IANA timezone string
// @returns {string | null}
export function getLocalMonthKey(utcTimestamp, timezone) {
  const p = getLocalDateParts(utcTimestamp, timezone)
  if (!p) return null
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}`
}

// ── getLocalDayKey ────────────────────────────────────────────────────────────
//
// Returns a "YYYY-MM-DD" string for the given UTC timestamp expressed in the
// restaurant timezone.  Used to assign orders to daily revenue buckets and
// to compute "today's revenue".
//
// @param {string} utcTimestamp — ISO 8601 UTC timestamp
// @param {string} timezone     — IANA timezone string
// @returns {string | null}
export function getLocalDayKey(utcTimestamp, timezone) {
  const p = getLocalDateParts(utcTimestamp, timezone)
  if (!p) return null
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// ══ Internal helpers ══════════════════════════════════════════════════════════

// _formatParts — wraps Intl.DateTimeFormat.formatToParts with a fixed locale
// to avoid locale-dependent part ordering.
function _formatParts(date, timezone, options) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...options }).formatToParts(date)
}

// _getDatePartsInZone — full date+time parts for a given instant in a timezone.
// Returns { year, month(0-based), day, hour, minute, second }.
// hour is normalised: if Intl returns 24 for midnight it is converted to 0.
function _getDatePartsInZone(date, timezone) {
  const parts = _formatParts(date, timezone, {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  })
  const get = (type) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10)
  const rawHour = get('hour')
  return {
    year:   get('year'),
    month:  get('month') - 1,     // 0-based
    day:    get('day'),
    hour:   rawHour === 24 ? 0 : rawHour,
    minute: get('minute'),
    second: get('second'),
  }
}

// _getTZOffsetMinutes — UTC offset for the given timezone at the given instant.
// Positive = timezone is ahead of UTC (e.g. Asia/Kolkata = +330 minutes).
// Uses wall-clock comparison via Intl to correctly handle DST transitions.
function _getTZOffsetMinutes(date, timezone) {
  const utcP = _getDatePartsInZone(date, 'UTC')
  const tzP  = _getDatePartsInZone(date, timezone)
  const utcMs = Date.UTC(utcP.year, utcP.month, utcP.day, utcP.hour, utcP.minute, utcP.second)
  const tzMs  = Date.UTC(tzP.year,  tzP.month,  tzP.day,  tzP.hour,  tzP.minute,  tzP.second)
  return Math.round((tzMs - utcMs) / 60000)
}

// _localDateToUTC — converts a "YYYY-MM-DD" local date string to a UTC ISO
// instant, using the restaurant timezone.
//
// mode 'start' → local 00:00:00.000 of that day → UTC
// mode 'end'   → local 23:59:59.999 of that day → UTC
//
// The timezone offset is sampled at local noon (12:00) which is DST-safe for
// all known timezones: DST transitions virtually always occur at or near
// midnight, not at noon.
function _localDateToUTC(dateStr, timezone, mode) {
  // Default ranges (same as analyticsService defaults)
  if (!dateStr) {
    if (mode === 'end') return new Date().toISOString()
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  // Already a full ISO timestamp — return as-is
  if (dateStr.includes('T')) return dateStr

  const tz = validateTimezone(timezone) ? timezone : ANALYTICS_TZ_FALLBACK
  const [yearS, monthS, dayS] = dateStr.split('-')
  const year  = parseInt(yearS,  10)
  const month = parseInt(monthS, 10) - 1   // 0-based
  const day   = parseInt(dayS,   10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr

  // Sample offset at noon UTC of the requested date (DST-safe reference point)
  const noonUTC    = new Date(Date.UTC(year, month, day, 12, 0, 0))
  const offsetMin  = _getTZOffsetMinutes(noonUTC, tz)

  // Convert local wall-clock time to UTC by subtracting the offset
  //   local 00:00:00.000 = UTC 00:00:00.000 − offsetMin minutes
  //   local 23:59:59.999 = UTC 23:59:59.999 − offsetMin minutes
  const startMs = Date.UTC(year, month, day,  0,  0,  0,   0) - offsetMin * 60_000
  const endMs   = Date.UTC(year, month, day, 23, 59, 59, 999) - offsetMin * 60_000

  return mode === 'end'
    ? new Date(endMs).toISOString()
    : new Date(startMs).toISOString()
}
