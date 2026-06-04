export function getServiceHeaders() {
  const raw = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!raw || !key) throw new Error('Supabase service role not configured')
  const url = raw.trim()
    .replace(/\/+$/, '')
    .replace(/\/(rest\/v1|graphql\/v1|auth\/v1|storage\/v1)(\/.*)?$/, '')
  return {
    url,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  }
}

export async function supabaseFetch(url, options) {
  const r = await fetch(url, options)
  if (r.ok) return { ok: true, status: r.status, data: await r.json() }

  let errData
  try { errData = await r.json() } catch { errData = { error: r.statusText } }

  if (errData?.code === '42703' && options.body) {
    const badCol = (errData.message || '').match(/column "([\w]+)"/)?.[1]
    if (badCol) {
      try {
        const body = JSON.parse(options.body)
        if (badCol in body) {
          const stripped = { ...body }
          delete stripped[badCol]
          const r2 = await fetch(url, { ...options, body: JSON.stringify(stripped) })
          const data2 = r2.ok
            ? await r2.json()
            : await r2.json().catch(() => ({ error: r2.statusText }))
          return { ok: r2.ok, status: r2.status, data: data2 }
        }
      } catch { /* fall through */ }
    }
  }

  return { ok: false, status: r.status, data: errData }
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
