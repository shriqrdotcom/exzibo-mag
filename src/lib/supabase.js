import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!rawUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables')
}

// Strip trailing slashes, whitespace, and any accidentally included path
// (e.g. /rest/v1 is sometimes copied from the Supabase dashboard)
const supabaseUrl = rawUrl.trim().replace(/\/+$/, '').replace(/\/(rest\/v1|graphql\/v1|auth\/v1|storage\/v1)(\/.*)?$/, '')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
