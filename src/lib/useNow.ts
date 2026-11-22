import { useEffect, useState } from 'react'

/** Current time in ms, refreshed every `intervalMs` (for "x seconds ago" labels). */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}
