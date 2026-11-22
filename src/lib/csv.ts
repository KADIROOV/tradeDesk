import type { Direction, Session, Trade } from './types'
import { uid } from './format'

export const CSV_COLUMNS = [
  'id',
  'openedAt',
  'symbol',
  'direction',
  'entry',
  'stop',
  'takeProfit',
  'exit',
  'lots',
  'fees',
  'pnl',
  'session',
  'setup',
  'emotion',
  'rulesFollowed',
  'notes',
] as const

function escapeCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function tradesToCsv(trades: Trade[]): string {
  const rows = trades.map((t) =>
    CSV_COLUMNS.map((c) => {
      const v = t[c]
      if (v === undefined || v === null) return ''
      return escapeCell(String(v))
    }).join(','),
  )
  return [CSV_COLUMNS.join(','), ...rows].join('\n')
}

/** RFC-4180-ish parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const num = (s: string | undefined) => {
  if (s === undefined || s.trim() === '') return undefined
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const SESSIONS: Session[] = ['asia', 'london', 'newyork', 'overlap', 'other']

export interface CsvImportResult {
  trades: Trade[]
  skipped: number
}

/** Import trades from CSV. Header names are matched case-insensitively. */
export function csvToTrades(text: string): CsvImportResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { trades: [], skipped: 0 }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name.toLowerCase())
  const idx = Object.fromEntries(CSV_COLUMNS.map((c) => [c, col(c)])) as Record<
    (typeof CSV_COLUMNS)[number],
    number
  >
  const trades: Trade[] = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    const get = (c: (typeof CSV_COLUMNS)[number]) => (idx[c] >= 0 ? r[idx[c]]?.trim() : undefined)
    const symbol = get('symbol')?.toUpperCase()
    const dirRaw = get('direction')?.toLowerCase()
    const direction: Direction | undefined =
      dirRaw === 'long' || dirRaw === 'buy'
        ? 'long'
        : dirRaw === 'short' || dirRaw === 'sell'
          ? 'short'
          : undefined
    const openedRaw = get('openedAt')
    const opened = openedRaw ? new Date(openedRaw) : undefined
    const pnl = num(get('pnl'))
    if (!symbol || !direction || !opened || Number.isNaN(opened.getTime()) || pnl === undefined) {
      skipped++
      continue
    }
    const session = get('session')?.toLowerCase() as Session | undefined
    trades.push({
      id: get('id') || uid(),
      symbol,
      direction,
      openedAt: opened.toISOString(),
      entry: num(get('entry')),
      stop: num(get('stop')),
      takeProfit: num(get('takeProfit')),
      exit: num(get('exit')),
      lots: num(get('lots')),
      fees: num(get('fees')) ?? 0,
      pnl,
      pnlManual: true,
      session: session && SESSIONS.includes(session) ? session : undefined,
      setup: get('setup') || undefined,
      emotion: get('emotion') || undefined,
      rulesFollowed: (get('rulesFollowed') ?? 'true').toLowerCase() !== 'false',
      notes: get('notes') || undefined,
    })
  }
  return { trades, skipped }
}
