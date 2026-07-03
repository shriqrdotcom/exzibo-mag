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

  return betterAuthHandler(req, res)
}
