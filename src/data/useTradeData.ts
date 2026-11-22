import { useMemo } from 'react'
import {
  deleteManualTrade,
  insertManualTrades,
  saveJournal,
  saveManualTrade,
  uploadScreenshot,
  useCloud,
} from '@/cloud/store'
import type { AccountRow } from '@/cloud/rows'
import { accountReturn } from '@/lib/mt5/balance'
import { saveBlob } from '@/lib/idb'
import type { Trade } from '@/lib/types'
import { useSettings } from '@/store/settings'
import { useTrades } from '@/store/trades'

/** True when trades come from the signed-in Supabase account instead of this device. */
export function useCloudActive(): boolean {
  return useCloud((s) => s.status === 'signed-in')
}

export function useTimezone(): string {
  return useSettings((s) => s.timezone)
}

/** Accounts included by the account switcher ('all', 'manual' or one id). */
export function useSelectedAccounts(): AccountRow[] {
  const accounts = useCloud((s) => s.accounts)
  const sel = useSettings((s) => s.selectedAccount)
  return useMemo(
    () => (sel === 'all' ? accounts : accounts.filter((a) => a.id === sel)),
    [accounts, sel],
  )
}

/** Every trade for the current view: this device's journal, or the selected cloud account(s). */
export function useTradeList(): Trade[] {
  const active = useCloudActive()
  const local = useTrades((s) => s.trades)
  const cloud = useCloud((s) => s.trades)
  const sel = useSettings((s) => s.selectedAccount)
  return useMemo(() => {
    if (!active) return local
    if (sel === 'all') return cloud
    if (sel === 'manual') return cloud.filter((t) => !t.accountId)
    return cloud.filter((t) => t.accountId === sel)
  }, [active, local, cloud, sel])
}

export interface TradeActions {
  cloud: boolean
  save: (t: Trade, isNew: boolean) => Promise<void>
  remove: (t: Trade) => Promise<void>
  importMany: (ts: Trade[]) => Promise<void>
  storeScreenshot: (blob: Blob) => Promise<string>
}

export function useTradeActions(): TradeActions {
  const cloud = useCloudActive()
  const local = useTrades()
  return useMemo<TradeActions>(
    () =>
      cloud
        ? {
            cloud,
            save: (t, isNew) => (t.source === 'mt5' ? saveJournal(t) : saveManualTrade(t, isNew)),
            remove: async (t) => {
              if (t.source === 'mt5') throw new Error('Synced MT5 trades cannot be deleted')
              await deleteManualTrade(t.id)
            },
            importMany: (ts) => insertManualTrades(ts, 'csv'),
            storeScreenshot: uploadScreenshot,
          }
        : {
            cloud,
            save: async (t, isNew) => (isNew ? local.addTrade(t) : local.updateTrade(t.id, t)),
            remove: async (t) => local.deleteTrade(t.id),
            importMany: async (ts) => local.importTrades(ts),
            storeScreenshot: (blob) => saveBlob(blob, 'shot'),
          },
    [cloud, local],
  )
}

export interface AccountSummary {
  /** True when balance and equity come from MT5. */
  live: boolean
  balance: number
  equity: number | null
  currency: string
  /** Trading return excluding deposits and withdrawals (null when unknown). */
  returnPct: number | null
  startingBalance: number | null
  deposits: number
  withdrawals: number
}

export function useAccountSummary(trades: Trade[]): AccountSummary {
  const active = useCloudActive()
  const accounts = useSelectedAccounts()
  const cash = useCloud((s) => s.cash)
  const localStart = useSettings((s) => s.startingBalance)
  return useMemo(() => {
    const synced = accounts.filter((a) => a.balance !== null)
    if (active && synced.length) {
      const ids = new Set(synced.map((a) => a.id))
      const balance = synced.reduce((s, a) => s + Number(a.balance), 0)
      const equity = synced.every((a) => a.equity !== null)
        ? synced.reduce((s, a) => s + Number(a.equity), 0)
        : null
      const starts = synced.map((a) =>
        a.starting_balance === null ? null : Number(a.starting_balance),
      )
      const start = starts.every((v) => v !== null)
        ? starts.reduce<number>((s, v) => s + (v ?? 0), 0)
        : null
      const deals = cash
        .filter((c) => ids.has(c.account_id))
        .map((c) => ({
          time: Date.parse(c.deal_time) / 1000,
          type: c.deal_type,
          profit: c.profit,
          commission: c.commission,
          swap: c.swap,
          fee: c.fee,
        }))
      const r = accountReturn(deals, balance, start)
      return {
        live: true,
        balance,
        equity,
        currency: synced[0].currency,
        returnPct: r.base + r.deposits - r.withdrawals > 0 ? r.returnPct : null,
        startingBalance: start,
        deposits: r.deposits,
        withdrawals: r.withdrawals,
      }
    }
    const pnl = trades.filter((t) => t.status !== 'open').reduce((s, t) => s + t.pnl, 0)
    return {
      live: false,
      balance: localStart + pnl,
      equity: null,
      currency: 'USD',
      returnPct: localStart > 0 ? pnl / localStart : null,
      startingBalance: localStart,
      deposits: 0,
      withdrawals: 0,
    }
  }, [active, accounts, cash, localStart, trades])
}
