import { DEFAULT_SYMBOL_SPECS } from './symbolSpecs'
import { tradePnl } from '@/lib/finance/position'
import { sessionForInstant } from '@/lib/sessions'
import type { Trade } from '@/lib/types'

/** Small deterministic PRNG so the demo set is the same on every load. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UNIVERSE: { symbol: string; price: number; stop: [number, number]; weight: number }[] = [
  { symbol: 'XAUUSD', price: 2640, stop: [3, 9], weight: 6 },
  { symbol: 'NAS100', price: 20800, stop: [25, 70], weight: 5 },
  { symbol: 'EURUSD', price: 1.058, stop: [0.0012, 0.0028], weight: 3 },
  { symbol: 'GBPUSD', price: 1.268, stop: [0.0014, 0.0032], weight: 2 },
  { symbol: 'US30', price: 43800, stop: [40, 110], weight: 2 },
  { symbol: 'USDJPY', price: 153.4, stop: [0.15, 0.35], weight: 1 },
  { symbol: 'BTCUSD', price: 95000, stop: [600, 1500], weight: 1 },
]
const SETUPS = [
  'Breakout retest',
  'Liquidity sweep',
  'Trend pullback',
  'Range fade',
  'Opening drive',
  'FVG fill',
]
const EMOTIONS = ['Calm', 'Confident', 'Patient', 'Hesitant', 'FOMO', 'Frustrated']
const NOTES = [
  'Clean setup at the level, held to target without interfering.',
  'Entered early before confirmation. Got lucky — not repeatable.',
  'Stopped out by a wick, idea played out an hour later. Stop was too tight for the session volatility.',
  'Followed the plan exactly. Partial at 1R, runner to the target.',
  'News spike against me. Should have been flat before CPI.',
  'Moved the stop to break-even too early and got shaken out.',
  'Patient entry on the second touch. Best execution this week.',
  '',
]

const pick = <T>(rand: () => number, arr: T[]) => arr[Math.floor(rand() * arr.length)]

export function generateDemoTrades(count = 60, now = new Date()): Trade[] {
  const rand = mulberry32(20251122)
  const totalWeight = UNIVERSE.reduce((s, u) => s + u.weight, 0)
  const trades: Trade[] = []
  // Walk back over weekdays from today, 0–2 trades per day.
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  while (trades.length < count) {
    day.setDate(day.getDate() - 1)
    const dow = day.getDay()
    if (dow === 0 || dow === 6) continue
    const n = rand() < 0.25 ? 0 : rand() < 0.65 ? 1 : 2
    for (let i = 0; i < n && trades.length < count; i++) {
      let r = rand() * totalWeight
      const u = UNIVERSE.find((x) => (r -= x.weight) < 0) ?? UNIVERSE[0]
      const spec = DEFAULT_SYMBOL_SPECS.find((s) => s.symbol === u.symbol)
      if (!spec) continue
      const opened = new Date(day)
      // Mostly London open and NY morning (in UTC terms, viewed locally).
      const hourUtc = rand() < 0.55 ? 7 + rand() * 3 : 13 + rand() * 3
      opened.setUTCHours(Math.floor(hourUtc), Math.floor(rand() * 60), 0, 0)
      const direction = rand() < 0.55 ? 'long' : 'short'
      const sign = direction === 'long' ? 1 : -1
      const drift = 1 + (rand() - 0.5) * 0.04
      const entry = Number((u.price * drift).toFixed(spec.digits))
      const stopDist = u.stop[0] + rand() * (u.stop[1] - u.stop[0])
      const stop = Number((entry - sign * stopDist).toFixed(spec.digits))
      const rr = [1.5, 2, 2, 2.5, 3][Math.floor(rand() * 5)]
      const takeProfit = Number((entry + sign * stopDist * rr).toFixed(spec.digits))
      // Outcome: ~54% winners; winners mostly hit TP, some partials; some scratches.
      const roll = rand()
      const rMult =
        roll < 0.42
          ? rr
          : roll < 0.54
            ? 0.4 + rand() * 1.1
            : roll < 0.6
              ? 0
              : roll < 0.94
                ? -1
                : -0.4 - rand() * 0.5
      const exit = Number((entry + sign * stopDist * rMult).toFixed(spec.digits))
      // Risk roughly $80–$140 per trade.
      const riskUsd = 80 + rand() * 60
      const perLotLoss = Math.abs(tradePnl({ spec, direction, entry, exit: stop, lots: 1 }).gross)
      const lots = Math.max(0.01, Math.floor((riskUsd / perLotLoss) * 100) / 100)
      const fees = Number((lots * (spec.category === 'index' ? 0.5 : 7)).toFixed(2))
      const pnl = Number(tradePnl({ spec, direction, entry, exit, lots, fees }).net.toFixed(2))
      const followed = rMult >= 0 ? rand() < 0.9 : rand() < 0.6
      trades.push({
        id: `demo-${trades.length + 1}`,
        symbol: u.symbol,
        direction,
        openedAt: opened.toISOString(),
        entry,
        stop,
        takeProfit,
        exit,
        lots,
        fees,
        pnl,
        pnlManual: false,
        session: sessionForInstant(opened),
        setup: pick(rand, SETUPS),
        emotion: followed ? pick(rand, EMOTIONS.slice(0, 4)) : pick(rand, EMOTIONS.slice(3)),
        notes: pick(rand, NOTES) || undefined,
        rulesFollowed: followed,
      })
    }
  }
  return trades.sort((a, b) => a.openedAt.localeCompare(b.openedAt))
}
