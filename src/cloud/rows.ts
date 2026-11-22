import type { Session, Trade, TradeSource } from '@/lib/types'

export interface AccountRow {
  id: string
  user_id: string
  name: string
  broker: string
  server: string | null
  login: number | null
  currency: string
  leverage: number | null
  starting_balance: number | null
  balance: number | null
  equity: number | null
  last_sync_at: string | null
  last_heartbeat_at: string | null
  ea_version: string | null
  resync_requested_at: string | null
  created_at: string
}

export interface SyncKeyRow {
  id: string
  account_id: string
  key_prefix: string
  label: string | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface ProfileRow {
  user_id: string
  display_name: string | null
  timezone: string
  settings: Record<string, unknown>
}

export interface TradeDbRow {
  id: string
  user_id: string
  account_id: string | null
  position_id: number | null
  leg: number
  symbol: string
  symbol_raw: string | null
  instrument_group: string
  direction: 'long' | 'short'
  status: 'open' | 'closed'
  volume: number | null
  open_time: string
  close_time: string | null
  open_price: number | null
  close_price: number | null
  sl: number | null
  tp: number | null
  commission: number
  swap: number
  fee: number
  gross_profit: number
  net_profit: number
  r_multiple: number | null
  history_complete: boolean
  source: TradeSource
  notes: string | null
  setup_tag: string | null
  emotion: string | null
  rating: number | null
  rules_followed: boolean | null
  screenshots: string[] | null
  session: Session | null
}

export interface CashDealRow {
  account_id: string
  deal_time: string
  deal_type: number
  profit: number
  commission: number
  swap: number
  fee: number
}

export const ACCOUNT_COLUMNS =
  'id, user_id, name, broker, server, login, currency, leverage, starting_balance, balance, equity, last_sync_at, last_heartbeat_at, ea_version, resync_requested_at, created_at'
export const KEY_COLUMNS = 'id, account_id, key_prefix, label, created_at, last_used_at, revoked_at'

const num = (v: number | string | null | undefined): number | undefined =>
  v === null || v === undefined || v === '' ? undefined : Number(v)

export function rowToTrade(r: TradeDbRow): Trade {
  const mt5 = r.source === 'mt5'
  const commission = Number(r.commission ?? 0)
  const swap = Number(r.swap ?? 0)
  const fee = Number(r.fee ?? 0)
  return {
    id: r.id,
    symbol: r.symbol,
    direction: r.direction,
    openedAt: r.open_time,
    closedAt: r.close_time ?? undefined,
    entry: num(r.open_price),
    stop: num(r.sl),
    takeProfit: num(r.tp),
    exit: num(r.close_price),
    lots: num(r.volume),
    // Costs shown as a positive number; for MT5 they are already inside net P&L.
    fees: mt5 ? Math.round(-(commission + fee + swap) * 100) / 100 : Math.round(-fee * 100) / 100,
    pnl: Number(r.net_profit),
    pnlManual: !mt5 && r.open_price === null,
    session: r.session ?? undefined,
    setup: r.setup_tag ?? undefined,
    emotion: r.emotion ?? undefined,
    notes: r.notes ?? undefined,
    rulesFollowed: r.rules_followed ?? true,
    source: r.source,
    accountId: r.account_id,
    status: r.status,
    rMultiple: mt5 ? (r.r_multiple === null ? null : Number(r.r_multiple)) : undefined,
    historyComplete: r.history_complete,
    commission,
    swap,
    rating: r.rating ?? undefined,
    screenshots: r.screenshots ?? [],
    symbolRaw: r.symbol_raw ?? undefined,
    group: r.instrument_group,
  }
}

/** Journal fields: the only columns the owner may change on an MT5 trade. */
export function journalPatch(t: Trade) {
  return {
    notes: t.notes ?? null,
    setup_tag: t.setup ?? null,
    emotion: t.emotion ?? null,
    rating: t.rating ?? null,
    rules_followed: t.rulesFollowed,
    screenshots: t.screenshots ?? [],
    session: t.session ?? null,
  }
}

/** Full row for a manual or CSV trade. */
export function manualRow(t: Trade, userId: string, source: TradeSource = 'manual') {
  return {
    user_id: userId,
    account_id: t.accountId ?? null,
    symbol: t.symbol.slice(0, 40),
    direction: t.direction,
    status: 'closed' as const,
    volume: t.lots ?? null,
    open_time: t.openedAt,
    close_time: t.closedAt ?? t.openedAt,
    open_price: t.entry ?? null,
    close_price: t.exit ?? null,
    sl: t.stop ?? null,
    tp: t.takeProfit ?? null,
    fee: -(t.fees || 0),
    net_profit: t.pnl,
    gross_profit: t.pnl + (t.fees || 0),
    source,
    ...journalPatch(t),
  }
}
