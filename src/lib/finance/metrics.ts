import type { Trade } from '@/lib/types'
import { dateKey } from '@/lib/format'
import { dayKeyInZone } from '@/lib/mt5/tz'
import { rMultiple } from './position'

/** R multiple: the server's value for MT5 trades (null = no stop, unknown), else from prices. */
export function tradeR(t: Trade): number | undefined {
  if (t.rMultiple !== undefined) return t.rMultiple ?? undefined
  if (t.entry === undefined || t.stop === undefined || t.exit === undefined) return undefined
  return rMultiple(t.direction, t.entry, t.stop, t.exit)
}

/** When a trade's result happened: close time for synced trades, otherwise the logged time. */
export const tradeTime = (t: Trade): string => t.closedAt ?? t.openedAt

export const isClosed = (t: Trade) => t.status !== 'open'

/** Calendar day of a trade, in `tz` when given (else the browser's local day). */
export function tradeDay(t: Trade, tz?: string): string {
  return tz ? dayKeyInZone(tradeTime(t), tz) : dateKey(tradeTime(t))
}

export function sortByTime(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => tradeTime(a).localeCompare(tradeTime(b)))
}

export interface TradeStats {
  count: number
  wins: number
  losses: number
  breakeven: number
  totalPnl: number
  winRate: number
  grossProfit: number
  grossLoss: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  expectancy: number
  avgWinR: number
  avgR: number
  maxDrawdown: number
  maxDrawdownPct: number
  streak: { kind: 'win' | 'loss' | 'none'; count: number }
  bestTrade: number
  worstTrade: number
}

export function computeStats(trades: Trade[], startingBalance = 0): TradeStats {
  const sorted = sortByTime(trades.filter(isClosed))
  let wins = 0
  let losses = 0
  let breakeven = 0
  let grossProfit = 0
  let grossLoss = 0
  let winRSum = 0
  let winRCount = 0
  let rSum = 0
  let rCount = 0
  let best = 0
  let worst = 0
  for (const t of sorted) {
    if (t.pnl > 0) {
      wins++
      grossProfit += t.pnl
    } else if (t.pnl < 0) {
      losses++
      grossLoss += -t.pnl
    } else breakeven++
    best = Math.max(best, t.pnl)
    worst = Math.min(worst, t.pnl)
    const r = tradeR(t)
    if (r !== undefined) {
      rSum += r
      rCount++
      if (t.pnl > 0) {
        winRSum += r
        winRCount++
      }
    }
  }
  const decided = wins + losses
  const dd = maxDrawdown(
    sorted.map((t) => t.pnl),
    startingBalance,
  )
  return {
    count: sorted.length,
    wins,
    losses,
    breakeven,
    totalPnl: grossProfit - grossLoss,
    winRate: decided ? wins / decided : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    avgWin: wins ? grossProfit / wins : 0,
    avgLoss: losses ? grossLoss / losses : 0,
    expectancy: sorted.length ? (grossProfit - grossLoss) / sorted.length : 0,
    avgWinR: winRCount ? winRSum / winRCount : 0,
    avgR: rCount ? rSum / rCount : 0,
    maxDrawdown: dd.amount,
    maxDrawdownPct: dd.pct,
    streak: currentStreak(sorted),
    bestTrade: best,
    worstTrade: worst,
  }
}

/** Largest peak-to-trough decline of the running equity. */
export function maxDrawdown(pnls: number[], startingBalance = 0): { amount: number; pct: number } {
  let equity = startingBalance
  let peak = startingBalance
  let amount = 0
  let pct = 0
  for (const p of pnls) {
    equity += p
    if (equity > peak) peak = equity
    const draw = peak - equity
    if (draw > amount) {
      amount = draw
      pct = peak > 0 ? draw / peak : 0
    }
  }
  return { amount, pct }
}

export function currentStreak(sorted: Trade[]): TradeStats['streak'] {
  let kind: 'win' | 'loss' | 'none' = 'none'
  let count = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i].pnl
    if (p === 0) continue
    const k = p > 0 ? 'win' : 'loss'
    if (kind === 'none') kind = k
    if (k !== kind) break
    count++
  }
  return { kind, count }
}

export interface EquityPoint {
  index: number
  date: string
  equity: number
  pnl: number
}

export function equityCurve(trades: Trade[]): EquityPoint[] {
  let equity = 0
  return sortByTime(trades.filter(isClosed)).map((t, i) => {
    equity += t.pnl
    return { index: i + 1, date: tradeTime(t), equity, pnl: t.pnl }
  })
}

export interface DaySummary {
  date: string
  pnl: number
  count: number
  wins: number
  losses: number
}

export function dailySummaries(trades: Trade[], tz?: string): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>()
  for (const t of trades) {
    if (!isClosed(t)) continue
    const k = tradeDay(t, tz)
    const d = map.get(k) ?? { date: k, pnl: 0, count: 0, wins: 0, losses: 0 }
    d.pnl += t.pnl
    d.count++
    if (t.pnl > 0) d.wins++
    else if (t.pnl < 0) d.losses++
    map.set(k, d)
  }
  return map
}
