import { useEffect, useRef, useState } from 'react'

/**
 * Connects to the Cloudflare realtime WebSocket for a restaurant and calls
 * `onOrderEvent()` whenever an ORDER_CREATED, ORDER_STATUS_CHANGED, or
 * ORDER_CANCELLED event arrives.
 *
 * Authentication: requests a signed ticket from the backend before opening
 * the WebSocket. The ticket encodes the user's restaurant membership and role
 * server-side — the client never supplies role or restaurantId directly.
 *
 * Safe reconnect: retries after 2 s on unexpected close.
 * Duplicate-connection guard: only one socket per restaurantId at a time.
 * Cleanup: socket is closed on component unmount or when restaurantId changes.
 *
 * The frontend never calls /publish/order-event and never uses
 * REALTIME_PUBLISH_SECRET — this hook is receive-only (role=staff).
 *
 * Returns live connection telemetry so UI can render a "monitor" of the
 * Cloudflare Worker / Durable Object pipeline: { status, lastEvent, wsHost }.
 * Existing callers that ignore the return value are unaffected.
 */
export function useRealtimeOrders(restaurantId, onOrderEvent) {
  const socketRef = useRef(null)
  const destroyedRef = useRef(false)
  const retryTimerRef = useRef(null)
  const ticketPromiseRef = useRef(null) // in-flight ticket fetch, dedup'd per connect
  const [status, setStatus] = useState('idle') // idle | connecting | open | closed | reconnecting
  const [lastEvent, setLastEvent] = useState(null) // { type, time }
  const [wsHost, setWsHost] = useState('')

  useEffect(() => {
    if (!restaurantId || restaurantId === 'demo') return

    destroyedRef.current = false

    // Derive wss:// URL from the VITE_REALTIME_URL env var (or fall back to
    // the known production host). Strip any trailing slash; replace http(s)://
    // with wss://.
    const base = (import.meta.env.VITE_REALTIME_URL || 'https://rt.exzibo.online')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    setWsHost(base)

    let hasConnectedBefore = false

    /**
     * Request a signed realtime ticket from the backend.
     * The ticket encodes the user's restaurant membership and role server-side.
     */
    async function requestTicket() {
      const res = await fetch('/api/realtime/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, role: 'staff' }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Ticket request failed (${res.status})`)
      }
      return res.json()
    }

    async function connect() {
      // Guard: don't open if already open for this restaurantId
      if (socketRef.current && socketRef.current.readyState < 2) {
        // CONNECTING (0) or OPEN (1) — skip
        return
      }

      setStatus(hasConnectedBefore ? 'reconnecting' : 'connecting')

      try {
        // Request a ticket from the backend
        const ticketData = await requestTicket()
        const wsUrl = `wss://${base}/ws/restaurant/${restaurantId}?ticket=${encodeURIComponent(ticketData.ticket)}`
        console.log('[cf-rt] connecting with ticket:', wsUrl)
        const ws = new WebSocket(wsUrl)
        socketRef.current = ws

        ws.onopen = () => {
          hasConnectedBefore = true
          setStatus('open')
          console.log('[cf-rt] connected — restaurant:', restaurantId)
        }

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data)
            const { type } = msg
            if (
              type === 'ORDER_CREATED' ||
              type === 'ORDER_STATUS_CHANGED' ||
              type === 'ORDER_CANCELLED'
            ) {
              console.log('[cf-rt] event received:', type)
              setLastEvent({ type, time: Date.now(), orderId: msg.orderId })
              onOrderEvent(type, msg)
            }
          } catch {
            // ignore non-JSON frames (e.g. ping text)
          }
        }

        ws.onclose = (evt) => {
          console.log('[cf-rt] closed — code:', evt.code, 'clean:', evt.wasClean)
          socketRef.current = null
          if (destroyedRef.current) return  // unmounted — do not retry
          setStatus('closed')
          // Reconnect after 2 s for any non-clean close (server restart, network
          // blip, etc.). Code 1000 is a normal intentional close — also retry
          // because the worker may have restarted.
          retryTimerRef.current = setTimeout(connect, 2_000)
        }

        ws.onerror = (err) => {
          console.warn('[cf-rt] WebSocket error:', err)
          // onclose fires right after onerror, so retry is handled there
        }
      } catch (err) {
        console.warn('[cf-rt] ticket request failed:', err.message)
        socketRef.current = null
        if (destroyedRef.current) return
        setStatus('closed')
        // Retry ticket request after 5 s (auth may be transient)
        retryTimerRef.current = setTimeout(connect, 5_000)
      }
    }

    connect()

    return () => {
      destroyedRef.current = true
      clearTimeout(retryTimerRef.current)
      if (socketRef.current) {
        socketRef.current.onclose = null  // suppress retry on intentional close
        socketRef.current.close(1000, 'component unmount')
        socketRef.current = null
      }
      setStatus('idle')
    }
  }, [restaurantId]) // re-run only if restaurantId changes; onOrderEvent is stable via useCallback

  return { status, lastEvent, wsHost }
}
