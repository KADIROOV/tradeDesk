import { dayKeyInZone } from './tz.js'
import { dealCash, isExternalFlow, isTradeDeal, type Mt5Deal } from './types.js'

export interface CashDeal {
  time: number
  type: number
  profit: number
  commission: number
  swap: number
  fee: number
}

export interface AccountReturn {
  /** Net P&L from trading only (profit, commission, swap, fees of trade deals). */
  tradingPnl: number
  deposits: number
  withdrawals: number
  /** Balance before the first known deal, derived backwards from the current balance. */
  derivedStart: number
  /** Starting balance used for %: the user's value if set, otherwise derivedStart. */
  base: number
  /** tradingPnl ÷ (base + deposits − withdrawals): deposits do not count as performance. */
  returnPct: number
}

/**
 * Split cash movements into trading results and external flows, so that a
 * deposit never looks like profit and a withdrawal never looks like a loss.
 */
export function accountReturn(
  deals: CashDeal[],
  balanceNow: number,
  startingBalance?: number | null,
): AccountReturn {
  let tradingPnl = 0
  let deposits = 0
  let withdrawals = 0
  let other = 0
  for (const d of deals) {
    const cash = dealCash(d)
    if (isTradeDeal(d)) tradingPnl += cash
    else if (isExternalFlow(d)) {
      if (cash >= 0) deposits += cash
      else withdrawals += -cash
    } else other += cash // swaps/commission/interest booked as separate deals
  }
  tradingPnl += other
  const derivedStart = balanceNow - tradingPnl - deposits + withdrawals
  const base = startingBalance && startingBalance > 0 ? startingBalance : derivedStart
  const capital = base + deposits - withdrawals
  return {
    tradingPnl,
    deposits,
    withdrawals,
    derivedStart,
    base,
    returnPct: capital > 0 ? tradingPnl / capital : 0,
  }
}

/**
 * Balance at the end of each day (in `tz`) for days that had any deal, derived
 * backwards from the current balance: close(d) = now − Σ cash after day d.
 */
export function dailyClosingBalances(
  deals: CashDeal[],
  balanceNow: number,
  tz: string,
): Map<string, number> {
  const perDay = new Map<string, number>()
  for (const d of deals) {
    const k = dayKeyInZone(d.time * 1000, tz)
    perDay.set(k, (perDay.get(k) ?? 0) + dealCash(d))
  }
  const days = [...perDay.keys()].sort().reverse()
  const out = new Map<string, number>()
  let after = 0
  for (const k of days) {
    out.set(k, Math.round((balanceNow - after) * 100) / 100)
    after += perDay.get(k) ?? 0
  }
  return out
}

export type { Mt5Deal }
