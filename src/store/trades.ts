import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { APP_CONFIG } from '@/config'
import { generateDemoTrades } from '@/data/demoTrades'
import { mergeDuplicates } from '@/lib/dedupe'
import type { Trade } from '@/lib/types'

interface TradesState {
  trades: Trade[]
  addTrade: (t: Trade) => void
  updateTrade: (id: string, t: Trade) => void
  deleteTrade: (id: string) => void
  importTrades: (ts: Trade[]) => void
  loadDemo: () => void
  clearAll: () => void
  mergeDuplicates: () => number
}

export const useTrades = create<TradesState>()(
  persist(
    (set, get) => ({
      trades: [],
      addTrade: (t) => set((s) => ({ trades: [...s.trades, t] })),
      updateTrade: (id, t) => set((s) => ({ trades: s.trades.map((x) => (x.id === id ? t : x)) })),
      deleteTrade: (id) => set((s) => ({ trades: s.trades.filter((x) => x.id !== id) })),
      importTrades: (ts) => {
        const existing = new Set(get().trades.map((t) => t.id))
        set((s) => ({ trades: [...s.trades, ...ts.filter((t) => !existing.has(t.id))] }))
      },
      loadDemo: () =>
        set((s) => ({
          trades: [...s.trades.filter((t) => !t.id.startsWith('demo-')), ...generateDemoTrades()],
        })),
      clearAll: () => set({ trades: [] }),
      mergeDuplicates: () => {
        const r = mergeDuplicates(get().trades)
        set({ trades: r.trades })
        return r.removed
      },
    }),
    {
      name: `${APP_CONFIG.storagePrefix}:trades`,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ trades: s.trades }),
    },
  ),
)
