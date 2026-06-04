import { getServiceHeaders, setCors } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    const { url: supabaseUrl, headers } = getServiceHeaders()
    const r = await fetch(
      `${supabaseUrl}/rest/v1/menu_categories?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers }
    )

    if (!r.ok) {
      const err = await r.text()
      return res.status(r.status).json({ error: err })
    }
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
