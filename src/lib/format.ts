import { intlLocale } from '@/i18n'
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const MASK = '••••'

export function formatCurrency(
  value: number,
  opts: { hidden?: boolean; signed?: boolean; compact?: boolean } = {},
): string {
  if (opts.hidden) return `$${MASK}`
  if (!Number.isFinite(value)) return '—'
  const body = (opts.compact ? usdCompact : usd).format(Math.abs(value))
  if (value < 0) return `−${body}`
  if (opts.signed && value > 0) return `+${body}`
  return body
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function formatFixed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatR(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}R`
}

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Local calendar date key, yyyy-MM-dd. */
export function dateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Parse a number from a form field; empty or invalid → undefined. */
export function parseNum(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

/** Format an instant in a specific IANA time zone (e.g. trade times in the user's zone). */
export function formatInZone(
  instant: string | number | Date,
  tz: string,
  style: 'datetime' | 'date' | 'time' | 'weekday-date' = 'datetime',
): string {
  const key = `${intlLocale()}|${tz}|${style}`
  let f = zoneFormats.get(key)
  if (!f) {
    const base: Intl.DateTimeFormatOptions = { timeZone: tz }
    const opts: Intl.DateTimeFormatOptions =
      style === 'time'
        ? { ...base, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
        : style === 'date'
          ? { ...base, month: 'short', day: 'numeric' }
          : style === 'weekday-date'
            ? {
                ...base,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              }
            : {
                ...base,
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              }
    f = new Intl.DateTimeFormat(intlLocale(), opts)
    zoneFormats.set(key, f)
  }
  return f.format(new Date(instant))
}
