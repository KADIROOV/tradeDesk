/**
 * Broker server time ↔ UTC.
 *
 * Most MT5 brokers (XM included) run server time at GMT+2 in winter and GMT+3
 * in summer so that the New York 17:00 close lands on midnight. The switch
 * follows the US daylight-saving calendar. The EA uses the same rule (see
 * mt5/TradeDeskSync.mq5) so these functions document and test that behaviour.
 */

export type ServerTzRule = 'us' | 'eu' | { fixed: number }

const HOUR = 3_600_000

/** Day-of-month of the n-th Sunday (n ≥ 1) of a month, in UTC. */
function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return 1 + ((7 - first) % 7) + (n - 1) * 7
}

function lastSunday(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0))
  return last.getUTCDate() - last.getUTCDay()
}

/** US DST: 2nd Sunday of March 02:00 EST (07:00 UTC) → 1st Sunday of November 02:00 EDT (06:00 UTC). */
export function isUsDst(utcMs: number): boolean {
  const y = new Date(utcMs).getUTCFullYear()
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 7)
  const end = Date.UTC(y, 10, nthSunday(y, 10, 1), 6)
  return utcMs >= start && utcMs < end
}

/** EU DST: last Sunday of March 01:00 UTC → last Sunday of October 01:00 UTC. */
export function isEuDst(utcMs: number): boolean {
  const y = new Date(utcMs).getUTCFullYear()
  const start = Date.UTC(y, 2, lastSunday(y, 2), 1)
  const end = Date.UTC(y, 9, lastSunday(y, 9), 1)
  return utcMs >= start && utcMs < end
}

/** Server offset from UTC in hours at a UTC instant. */
export function serverOffsetHours(utcMs: number, rule: ServerTzRule = 'us'): number {
  if (typeof rule === 'object') return rule.fixed
  const dst = rule === 'us' ? isUsDst(utcMs) : isEuDst(utcMs)
  return dst ? 3 : 2
}

/** Convert a broker server timestamp (ms, as if it were UTC) into a real UTC timestamp. */
export function serverToUtc(serverMs: number, rule: ServerTzRule = 'us'): number {
  if (typeof rule === 'object') return serverMs - rule.fixed * HOUR
  const summer = serverMs - 3 * HOUR
  if (serverOffsetHours(summer, rule) === 3) return summer
  return serverMs - 2 * HOUR
}

export function utcToServer(utcMs: number, rule: ServerTzRule = 'us'): number {
  return utcMs + serverOffsetHours(utcMs, rule) * HOUR
}
