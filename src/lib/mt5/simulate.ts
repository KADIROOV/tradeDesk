import { DEAL_ENTRY, DEAL_TYPE, type Mt5Deal } from './types.js'

/** Deterministic PRNG so simulations are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UNIVERSE = [
  // symbol as XM names it, price, $ per 1.0 price move per lot, typical stop distance, commission per lot per side
  { symbol: 'GOLD', price: 2650, perPoint: 100, stop: 6, commission: 0 },
  { symbol: 'US100Cash', price: 20800, perPoint: 1, stop: 45, commission: 0 },
  { symbol: 'EURUSD', price: 1.058, perPoint: 100000, stop: 0.002, commission: -3.5 },
  { symbol: 'GBPUSD', price: 1.268, perPoint: 100000, stop: 0.0025, commission: -3.5 },
] as const

export interface SimulationOptions {
  /** First deal ticket; tickets increase by one per deal. */
  startTicket: number
  /** UTC seconds of the first trade. */
  startTime: number
  trades: number
  seed?: number
  /** Seconds between trades. */
  spacing?: number
  /** Include a deposit deal before the first trade. */
  deposit?: number
}

/**
 * Realistic MT5 deals for testing the sync pipeline without trading:
 * entries with SL/TP, ~55% winners, occasional partial closes, commission and swap.
 */
export function simulateDeals(o: SimulationOptions): Mt5Deal[] {
  const rand = mulberry32(o.seed ?? o.startTicket)
  const deals: Mt5Deal[] = []
  let ticket = o.startTicket
  let t = o.startTime
  const base = {
    profit: 0,
    magic: 0,
    comment: '',
    fee: 0,
    swap: 0,
    commission: 0,
    tp: 0,
    sl: 0,
    reason: 0,
  }
  if (o.deposit) {
    deals.push({
      ...base,
      ticket,
      order: 0,
      position_id: 0,
      time: t - 60,
      type: DEAL_TYPE.BALANCE,
      entry: DEAL_ENTRY.IN,
      symbol: '',
      volume: 0,
      price: 0,
      profit: o.deposit,
      comment: 'Deposit',
    })
    ticket++
  }
  for (let i = 0; i < o.trades; i++) {
    const u = UNIVERSE[Math.floor(rand() * UNIVERSE.length)]
    const long = rand() < 0.55
    const sign = long ? 1 : -1
    const lots = Math.max(0.01, Math.round((100 / (u.stop * u.perPoint)) * 100) / 100)
    const entry = u.price * (1 + (rand() - 0.5) * 0.01)
    const sl = entry - sign * u.stop
    const rr = [1.5, 2, 2.5][Math.floor(rand() * 3)]
    const tp = entry + sign * u.stop * rr
    const roll = rand()
    const r = roll < 0.45 ? rr : roll < 0.55 ? 0.5 + rand() : roll < 0.6 ? 0 : -1
    const position = ticket
    const digits = u.price < 10 ? 5 : 2
    const px = (v: number) => Number(v.toFixed(digits))
    const commission = Math.round(u.commission * lots * 100) / 100
    deals.push({
      ...base,
      ticket: ticket++,
      order: position,
      position_id: position,
      time: t,
      time_msc: t * 1000,
      type: long ? DEAL_TYPE.BUY : DEAL_TYPE.SELL,
      entry: DEAL_ENTRY.IN,
      symbol: u.symbol,
      volume: lots,
      price: px(entry),
      sl: px(sl),
      tp: px(tp),
      commission,
    })
    const hold = 300 + Math.floor(rand() * 3000)
    const exit = entry + sign * u.stop * r
    const closeType = long ? DEAL_TYPE.SELL : DEAL_TYPE.BUY
    const partial = lots >= 0.04 && rand() < 0.3
    const parts = partial
      ? [
          Math.round((lots / 2) * 100) / 100,
          Math.round((lots - Math.round((lots / 2) * 100) / 100) * 100) / 100,
        ]
      : [lots]
    parts.forEach((vol, k) => {
      const at = t + hold + k * 240
      const price = k === parts.length - 1 ? exit : entry + sign * u.stop * Math.max(r, 0.8)
      const profit = Math.round((price - entry) * sign * u.perPoint * vol * 100) / 100
      deals.push({
        ...base,
        ticket: ticket++,
        order: ticket + 10_000,
        position_id: position,
        time: at,
        time_msc: at * 1000 + k,
        type: closeType,
        entry: DEAL_ENTRY.OUT,
        symbol: u.symbol,
        volume: vol,
        price: px(price),
        profit,
        commission: Math.round(u.commission * vol * 100) / 100,
        swap: hold > 2500 && k === parts.length - 1 ? -0.6 : 0,
        sl: px(sl),
        tp: px(tp),
        reason: r === rr ? 5 : r === -1 ? 4 : 0,
        comment: r === rr ? `[tp ${px(tp)}]` : r === -1 ? `[sl ${px(sl)}]` : '',
      })
    })
    t += o.spacing ?? 3600 + Math.floor(rand() * 7200)
  }
  return deals
}
