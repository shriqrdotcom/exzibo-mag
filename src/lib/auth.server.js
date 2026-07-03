import { betterAuth } from 'better-auth'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 5,
})

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_BASE_URL || 'https://superadmin.exzibo.online',
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-in-production-32chars!!',
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  trustedOrigins: [
    'https://superadmin.exzibo.online',
    'https://dashboard.exzibo.online',
  ],
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
      domain: '.exzibo.online',
    },
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },
})
