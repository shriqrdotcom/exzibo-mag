import { supabase } from './supabase'

const DEFAULT_MENU_SUBDOMAIN = 'menu'

export async function getRouteConfig(key) {
  const { data, error } = await supabase
    .from('route_config')
    .select('config_value')
    .eq('config_key', key)
    .maybeSingle()
  if (error) throw error
  return data?.config_value ?? null
}

export async function setRouteConfig(key, value) {
  const { error } = await supabase
    .from('route_config')
    .upsert(
      { config_key: key, config_value: value, updated_at: new Date().toISOString() },
      { onConflict: 'config_key' }
    )
  if (error) throw error
}

export async function getMenuSubdomain() {
  try {
    const val = await getRouteConfig('menu_subdomain')
    return val || DEFAULT_MENU_SUBDOMAIN
  } catch {
    return DEFAULT_MENU_SUBDOMAIN
  }
}

export async function getMenuRoutePattern() {
  try {
    const val = await getRouteConfig('menu_route_pattern')
    return val || ''
  } catch {
    return ''
  }
}

export function buildMenuBaseUrl(subdomain) {
  const sd = subdomain || DEFAULT_MENU_SUBDOMAIN
  return `https://${sd}.exzibo.online`
}
