import type { Trade } from './types'

/** Two trades are duplicates when symbol, side, open minute, entry and size all match. */
export function duplicateKey(t: Trade): string {
  const minute = t.openedAt.slice(0, 16)
  return [t.symbol, t.direction, minute, t.entry ?? '', t.lots ?? '', t.pnl.toFixed(2)].join('|')
}

export interface MergeResult {
  trades: Trade[]
  removed: number
}

/**
 * Collapse duplicate trades, keeping the first occurrence and filling any blank fields
 * from later copies. Notes from different copies are joined.
 */
export function mergeDuplicates(trades: Trade[]): MergeResult {
  const byKey = new Map<string, Trade>()
  let removed = 0
  for (const t of trades) {
    const k = duplicateKey(t)
    const existing = byKey.get(k)
    if (!existing) {
      byKey.set(k, { ...t })
      continue
    }
    removed++
    const merged: Trade = { ...existing }
    for (const key of Object.keys(t) as (keyof Trade)[]) {
      if (merged[key] === undefined || merged[key] === '') {
        Object.assign(merged, { [key]: t[key] })
      }
    }
    if (t.notes && existing.notes && t.notes !== existing.notes) {
      merged.notes = `${existing.notes}\n\n${t.notes}`
    }
    byKey.set(k, merged)
  }
  return { trades: [...byKey.values()], removed }
}

export function countDuplicates(trades: Trade[]): number {
  return trades.length - new Set(trades.map(duplicateKey)).size
}
