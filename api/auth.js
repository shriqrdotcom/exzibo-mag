import { toNodeHandler } from 'better-auth/node'
import { auth } from '../src/lib/auth.server.js'

const betterAuthHandler = toNodeHandler(auth)

export const config = {
  api: { bodyParser: false },
}

/**
 * Vercel serverless handler for all /api/auth/* routes.
 *
 * vercel.json rewrites:
 *   /api/auth/:path* → /api/auth?_path=:path*
 *
 * This handler reconstructs the full path so Better Auth can route internally.
 */
export default async function handler(req, res) {
  const subpath = Array.isArray(req.query._path)
    ? req.query._path.join('/')
    : (req.query._path || '')

  const q = { ...req.query }
  delete q._path
  const qs = new URLSearchParams(q).toString()

  req.url = `/api/auth/${subpath}${qs ? '?' + qs : ''}`

  // ── TEMPORARY DIAGNOSTIC LOG (remove once auth is confirmed working) ───────
  // Check for sign-in attempts so we can see env var presence in Vercel logs.
  if (subpath.startsWith('sign-in') || subpath.startsWith('callback')) {
    console.log('[api/auth] diagnostic', JSON.stringify({
      subpath,
      method:              req.method,
      origin:              req.headers.origin || '(none)',
      host:                req.headers.host   || '(none)',
      hasGoogleClientId:   !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleSecret:     !!process.env.GOOGLE_CLIENT_SECRET,
      hasBetterAuthSecret: !!process.env.BETTER_AUTH_SECRET,
      hasDatabaseUrl:      !!process.env.DATABASE_URL,
      betterAuthBaseUrl:   process.env.BETTER_AUTH_BASE_URL || '(using fallback: https://superadmin.exzibo.online)',
      trustedOriginsEnv:   process.env.BETTER_AUTH_TRUSTED_ORIGINS || '(not set)',
    }))
  }
  // ── END DIAGNOSTIC LOG ─────────────────────────────────────────────────────

  try {
    return await betterAuthHandler(req, res)
  } catch (err) {
    // Log any unhandled errors from Better Auth so they appear in Vercel logs.
    console.error('[api/auth] unhandled error in betterAuthHandler:', err?.message, err?.stack?.split('\n')[1] || '')
    if (!res.headersSent) {
      res.status(500).json({ error: 'Auth handler error', detail: err?.message })
    }
  }
}
