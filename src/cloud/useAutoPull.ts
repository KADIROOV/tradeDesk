import { useEffect } from 'react'
import { pullNow, useCloud } from './store'

const EVERY_MS = 60_000

/**
 * While the app is open, refresh password-connected (MetaApi) accounts every
 * minute and whenever the tab becomes visible again. New trades then arrive via
 * Supabase Realtime. A daily server cron catches up when nobody has the app open.
 */
export function useAutoPull() {
  const signedIn = useCloud((s) => s.status === 'signed-in')
  useEffect(() => {
    if (!signedIn) return
    let running = false
    const tick = async () => {
      if (running || document.hidden) return
      running = true
      try {
        const accounts = useCloud
          .getState()
          .accounts.filter(
            (a) =>
              a.connection_type === 'metaapi' &&
              a.metaapi_account_id &&
              a.connection_state !== 'error',
          )
        for (const a of accounts) await pullNow(a.id).catch(() => undefined)
      } finally {
        running = false
      }
    }
    const first = window.setTimeout(() => void tick(), 1500)
    const timer = window.setInterval(() => void tick(), EVERY_MS)
    const onVisible = () => !document.hidden && void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [signedIn])
}
