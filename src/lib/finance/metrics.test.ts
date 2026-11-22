import { describe, expect, it } from 'vitest'
import type { Trade } from '@/lib/types'
import { computeStats, currentStreak, dailySummaries, equityCurve, maxDrawdown } from './metrics'

let n = 0
const t = (pnl: number, day: number, extra: Partial<Trade> = {}): Trade => ({
  id: String(++n),
  symbol: 'XAUUSD',
  direction: 'long',
  openedAt: new Date(2026, 0, day, 10).toISOString(),
  fees: 0,
  pnl,
  pnlManual: true,
  rulesFollowed: true,
  ...extra,
})

describe('computeStats', () => {
  const trades = [
    t(200, 1, { entry: 100, stop: 99, exit: 102 }),
    t(-100, 2, { entry: 100, stop: 99, exit: 99 }),
    t(300, 3, { entry: 100, stop: 99, exit: 103 }),
    t(-100, 4),
    t(0, 5),
  ]
  const s = computeStats(trades)
  it('counts outcomes (breakeven excluded from win rate)', () => {
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(2)
    expect(s.breakeven).toBe(1)
    expect(s.winRate).toBeCloseTo(0.5)
  })
  it('profit factor = 500 / 200 = 2.5', () => expect(s.profitFactor).toBeCloseTo(2.5))
  it('avg win / loss', () => {
    expect(s.avgWin).toBeCloseTo(250)
    expect(s.avgLoss).toBeCloseTo(100)
  })
  it('expectancy = 300 / 5 = 60 per trade', () => expect(s.expectancy).toBeCloseTo(60))
  it('avg win R = (2 + 3) / 2', () => expect(s.avgWinR).toBeCloseTo(2.5))
  it('total', () => expect(s.totalPnl).toBe(300))
  it('profit factor is Infinity with no losses', () => {
    expect(computeStats([t(10, 1)]).profitFactor).toBe(Infinity)
  })
  it('empty list is all zeros', () => {
    const e = computeStats([])
    expect(e.count).toBe(0)
    expect(e.winRate).toBe(0)
  })
})

describe('maxDrawdown', () => {
  it('peak-to-trough', () => {
    // equity: 100, 50, 150, 30, 80 → biggest drop 150 → 30 = 120
    expect(maxDrawdown([100, -50, 100, -120, 50]).amount).toBe(120)
  })
  it('percentage uses the starting balance', () => {
    const dd = maxDrawdown([1000, -2200], 10000)
    expect(dd.amount).toBe(2200)
    expect(dd.pct).toBeCloseTo(0.2)
  })
})

describe('currentStreak', () => {
  it('counts the latest run and skips breakevens', () => {
    expect(currentStreak([t(10, 1), t(-5, 2), t(-5, 3), t(0, 4), t(-1, 5)])).toEqual({
      kind: 'loss',
      count: 3,
    })
  })
})

describe('equity and days', () => {
  it('equity curve is cumulative in time order', () => {
    const c = equityCurve([t(50, 3), t(100, 1), t(-30, 2)])
    expect(c.map((p) => p.equity)).toEqual([100, 70, 120])
  })
  it('daily summary groups by local date', () => {
    const d = dailySummaries([t(50, 3), t(-20, 3), t(10, 4)])
    expect(d.size).toBe(2)
    const first = [...d.values()].find((x) => x.count === 2)
    expect(first?.pnl).toBe(30)
  })
})
