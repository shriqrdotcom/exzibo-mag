import { setCors } from './_lib/cors.js'
import {
  insertMessage,
  getMessagesNeon,
  getActiveNotification,
  publishActiveNotificationNeon,
  confirmActiveNotificationNeon,
  insertNotificationHistoryNeon,
  getNotificationHistoryNeon,
  getLatestSmsNeon,
  upsertSmsNeon,
  createHelpNotificationNeon,
  getHelpNotificationsNeon,
  updateHelpStatusNeon,
  deleteHelpNotificationNeon,
  markAllHelpReadNeon,
} from '../src/db/neon-globals.js'

// ── /api/notifications — All Notification Types (Neon-only) ──────────────────
//
// POST ?action=sendMessage               body: { topic, message, send_to, sent_by }
// GET  ?action=getMessages               &role=X
// GET  ?action=getActiveNotification
// POST ?action=publishActiveNotification body: { id?, title, message, target_roles }
// POST ?action=confirmActiveNotification body: { id, confirmedBy }
// POST ?action=insertNotificationHistory body: { id?, title, message, target_roles }
// GET  ?action=getNotificationHistory    [&hoursBack=24]
// GET  ?action=getLatestSms
// POST ?action=upsertSms                 body: { title, message }
// POST ?action=createHelp                body: { restaurant_name, restaurant_uid, user_role, feedback, message }
// GET  ?action=getHelp
// POST ?action=updateHelpStatus          body: { id, status }

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  try {
    if (action === 'sendMessage') {
      if (req.method !== 'POST') return res.status(405).end()
      const row = await insertMessage(req.body)
      return res.json(row)
    }

    if (action === 'getMessages') {
      const { role } = req.query
      if (!role) return res.status(400).json({ error: 'role required' })
      const rows = await getMessagesNeon(role)
      return res.json(rows)
    }

    if (action === 'getActiveNotification') {
      const row = await getActiveNotification()
      return res.json(row)
    }

    if (action === 'publishActiveNotification') {
      if (req.method !== 'POST') return res.status(405).end()
      const row = await publishActiveNotificationNeon(req.body)
      return res.json(row)
    }

    if (action === 'confirmActiveNotification') {
      if (req.method !== 'POST') return res.status(405).end()
      const { id, confirmedBy } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      await confirmActiveNotificationNeon(id, confirmedBy)
      return res.json({ success: true })
    }

    if (action === 'insertNotificationHistory') {
      if (req.method !== 'POST') return res.status(405).end()
      await insertNotificationHistoryNeon(req.body)
      return res.json({ success: true })
    }

    if (action === 'getNotificationHistory') {
      const hoursBack = parseInt(req.query.hoursBack, 10) || 24
      const rows = await getNotificationHistoryNeon(hoursBack)
      return res.json(rows)
    }

    if (action === 'getLatestSms') {
      const row = await getLatestSmsNeon()
      return res.json(row)
    }

    if (action === 'upsertSms') {
      if (req.method !== 'POST') return res.status(405).end()
      const row = await upsertSmsNeon(req.body)
      return res.json(row)
    }

    if (action === 'createHelp') {
      if (req.method !== 'POST') return res.status(405).end()
      const row = await createHelpNotificationNeon(req.body)
      return res.json(row)
    }

    if (action === 'getHelp') {
      const rows = await getHelpNotificationsNeon()
      return res.json(rows)
    }

    if (action === 'updateHelpStatus') {
      if (req.method !== 'POST') return res.status(405).end()
      const { id, status } = req.body
      if (!id || !status) return res.status(400).json({ error: 'id and status required' })
      const row = await updateHelpStatusNeon(id, status)
      return res.json(row)
    }

    if (action === 'deleteHelp') {
      if (req.method !== 'POST') return res.status(405).end()
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      await deleteHelpNotificationNeon(id)
      return res.json({ success: true })
    }

    if (action === 'markAllHelpRead') {
      if (req.method !== 'POST') return res.status(405).end()
      const { ids } = req.body
      await markAllHelpReadNeon(ids)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[notifications][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
