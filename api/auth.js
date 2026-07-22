import { toNodeHandler } from 'better-auth/node'
import { auth, ensureAuthSchema } from '../src/lib/auth.server.js'

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

  try {
    // Make sure the Better Auth tables exist before handling any auth request
    // (idempotent, memoized — only actually runs SQL on cold start).
    await ensureAuthSchema()
    return await betterAuthHandler(req, res)
  } catch (err) {
    // Log any unhandled errors from Better Auth so they appear in Vercel logs.
    // Do NOT log cookies, tokens, OAuth codes, or secret values.
    console.error('[api/auth] unhandled error in betterAuthHandler:', err?.message, err?.stack?.split('\n')[1] || '')
    if (!res.headersSent) {
      res.status(500).json({ error: 'Auth handler error', detail: err?.message })
    }
  }
}
