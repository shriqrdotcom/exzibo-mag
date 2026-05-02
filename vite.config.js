import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createHmac } from 'crypto'

function previewAuthPlugin() {
  return {
    name: 'preview-auth',
    configureServer(server) {
      server.middlewares.use('/api/preview-login', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const { email, password } = JSON.parse(body)
            const validEmail    = process.env.PREVIEW_EMAIL
            const validPassword = process.env.PREVIEW_PASSWORD

            if (!validEmail || !validPassword) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Preview credentials not configured on server.' }))
              return
            }

            if (email === validEmail && password === validPassword) {
              const secret  = process.env.PREVIEW_SECRET || process.env.REPL_ID || 'preview-hmac-secret'
              const payload = JSON.stringify({ email, exp: Date.now() + 8 * 60 * 60 * 1000 })
              const sig     = createHmac('sha256', secret).update(payload).digest('hex')
              const token   = Buffer.from(payload).toString('base64url') + '.' + sig

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, token }))
            } else {
              res.statusCode = 401
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid email or password.' }))
            }
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Bad request.' }))
          }
        })
      })

      server.middlewares.use('/api/preview-verify', (req, res) => {
        const auth  = req.headers['authorization'] || ''
        const token = auth.replace('Bearer ', '')

        if (!token) {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: false }))
          return
        }

        try {
          const [payloadB64, sig] = token.split('.')
          const payload   = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
          const secret    = process.env.PREVIEW_SECRET || process.env.REPL_ID || 'preview-hmac-secret'
          const expected  = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
          const valid     = sig === expected && payload.exp > Date.now()

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid, email: valid ? payload.email : null }))
        } catch {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: false }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), previewAuthPlugin()],
  resolve: {
    alias: {
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true
  }
})
