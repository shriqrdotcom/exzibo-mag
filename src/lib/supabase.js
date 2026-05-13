import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'placeholder-anon-key'

if (!rawUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Supabase features will not work until these secrets are configured. ' +
    'The app will still load in DISABLE_AUTH mode.'
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
