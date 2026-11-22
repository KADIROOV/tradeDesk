/** Trading-session helpers built on Intl so daylight saving is handled by the browser. */

export interface ZoneDef {
  id: string
  label: string
  tz: string
}

export const ZONES: ZoneDef[] = [
  { id: 'tashkent', label: 'Tashkent', tz: 'Asia/Tashkent' },
  { id: 'london', label: 'London', tz: 'Europe/London' },
  { id: 'newyork', label: 'New York', tz: 'America/New_York' },
  { id: 'utc', label: 'UTC', tz: 'UTC' },
]

export interface MarketSession {
  id: 'asia' | 'london' | 'newyork'
  label: string
  tz: string
  /** Local open/close in the session's own time zone, minutes after midnight. */
  open: number
  close: number
}

export const MARKET_SESSIONS: MarketSession[] = [
  { id: 'asia', label: 'Asia (Tokyo)', tz: 'Asia/Tokyo', open: 9 * 60, close: 18 * 60 },
  { id: 'london', label: 'London', tz: 'Europe/London', open: 8 * 60, close: 17 * 60 },
  { id: 'newyork', label: 'New York', tz: 'America/New_York', open: 8 * 60, close: 17 * 60 },
]

/** Offset of `tz` from UTC in minutes at the given instant (e.g. Tashkent → +300). */
export function zoneOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  const instantSec = Math.floor(instant.getTime() / 1000) * 1000
  return Math.round((asUtc - instantSec) / 60000)
}

/** The UTC instant at which the wall-clock time `minutes` occurs on yyyy-mm-dd in `tz`. */
export function zonedTimeToUtc(ymd: string, minutes: number, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  // Two passes settle the offset across DST boundaries.
  let utc = guess - zoneOffsetMinutes(new Date(guess), tz) * 60000
  utc = guess - zoneOffsetMinutes(new Date(utc), tz) * 60000
  return new Date(utc)
}

/** Minutes after local midnight of `instant` as seen in `tz`. */
export function minutesInZone(instant: Date, tz: string): number {
  const utcMin = instant.getUTCHours() * 60 + instant.getUTCMinutes()
  return (((utcMin + zoneOffsetMinutes(instant, tz)) % 1440) + 1440) % 1440
}

export function formatMinutes(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Convert a wall-clock time on a date from one zone into another zone's wall clock. */
export function convertTime(ymd: string, minutes: number, fromTz: string, toTz: string): number {
  return minutesInZone(zonedTimeToUtc(ymd, minutes, fromTz), toTz)
}

export interface SessionWindow {
  session: MarketSession
  /** Open/close in the viewer zone, minutes after midnight (close may be < open if it wraps). */
  open: number
  close: number
  isOpen: boolean
}

export function sessionWindows(ymd: string, viewerTz: string, now = new Date()): SessionWindow[] {
  return MARKET_SESSIONS.map((s) => {
    const openUtc = zonedTimeToUtc(ymd, s.open, s.tz)
    const closeUtc = zonedTimeToUtc(ymd, s.close, s.tz)
    const t = now.getTime()
    return {
      session: s,
      open: minutesInZone(openUtc, viewerTz),
      close: minutesInZone(closeUtc, viewerTz),
      isOpen: t >= openUtc.getTime() && t < closeUtc.getTime(),
    }
  })
}

/** Guess which session a trade belongs to from its open time (London/NY overlap flagged). */
export function sessionForInstant(
  instant: Date,
): 'asia' | 'london' | 'newyork' | 'overlap' | 'other' {
  const inSession = (s: MarketSession) => {
    const m = minutesInZone(instant, s.tz)
    return m >= s.open && m < s.close
  }
  const [asia, london, ny] = MARKET_SESSIONS.map(inSession)
  if (london && ny) return 'overlap'
  if (ny) return 'newyork'
  if (london) return 'london'
  if (asia) return 'asia'
  return 'other'
}
