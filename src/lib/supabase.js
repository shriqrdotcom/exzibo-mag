import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'placeholder-anon-key'

// True only when both secrets were available at build time and embedded into the bundle.
// VITE_* variables are replaced with their literal values by Vite during `npm run build`.
// If they were missing at build time the bundle contains the placeholder strings below,
// so any Supabase query will fail with a network error to a non-existent host.
export const isSupabaseConfigured = !!(
  rawUrl &&
  rawUrl !== PLACEHOLDER_URL &&
  supabaseAnonKey &&
  supabaseAnonKey !== PLACEHOLDER_KEY
)

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set (or was not ' +
    'available at build time). Supabase features will not work. ' +
    'Ensure both secrets are configured in Replit before deploying.'
  )
}

// Strip trailing slashes, whitespace, and any accidentally included path
// (e.g. /rest/v1 is sometimes copied from the Supabase dashboard)
const supabaseUrl = rawUrl
  ? rawUrl.trim().replace(/\/+$/, '').replace(/\/(rest\/v1|graphql\/v1|auth\/v1|storage\/v1)(\/.*)?$/, '')
  : PLACEHOLDER_URL

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || PLACEHOLDER_KEY
)
