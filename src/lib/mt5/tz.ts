const formatters = new Map<string, Intl.DateTimeFormat>()

function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

/** Calendar day (yyyy-MM-dd) of a UTC instant as seen in `tz`. */
export function dayKeyInZone(instant: number | string | Date, tz: string): string {
  const d = instant instanceof Date ? instant : new Date(instant)
  const parts = fmt(tz).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const DEFAULT_TIMEZONE = 'Asia/Tashkent'
