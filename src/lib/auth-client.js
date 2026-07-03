import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? window.location.origin
    : (import.meta.env?.VITE_BETTER_AUTH_URL || 'https://superadmin.exzibo.online'),
  basePath: '/api/auth',
})
