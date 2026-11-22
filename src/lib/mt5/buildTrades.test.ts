import { describe, expect, it } from 'vitest'
import { buildTrades } from './buildTrades.js'
import { DEAL_ENTRY, DEAL_TYPE, type Mt5Deal } from './types.js'

let seq = 1000
const T0 = Date.UTC(2026, 2, 2, 8, 0) / 1000

function deal(
  p: Partial<Mt5Deal> & Pick<Mt5Deal, 'position_id' | 'type' | 'entry' | 'volume' | 'price'>,
): Mt5Deal {
  const ticket = p.ticket ?? ++seq
  return {
    ticket,
    order: ticket,
    time: p.time ?? T0 + (ticket - 1000) * 60,
    symbol: 'XAUUSD',
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    sl: 0,
    tp: 0,
    magic: 0,
    comment: '',
    ...p,
  }
}
const { BUY, SELL, BALANCE } = DEAL_TYPE
const { IN, OUT, INOUT, OUT_BY } = DEAL_ENTRY

describe('buildTrades: hedging basics', () => {
  it('one entry, one exit: prices, costs, net P&L and R', () => {
    const [t] = buildTrades([
      deal({
        position_id: 1,
        type: BUY,
        entry: IN,
        volume: 1,
        price: 2000,
        sl: 1990,
        tp: 2030,
        commission: -3.5,
      }),
      deal({
        position_id: 1,
        type: SELL,
        entry: OUT,
        volume: 1,
        price: 2010,
        profit: 1000,
        commission: -3.5,
        swap: -1,
      }),
    ])
    expect(t.status).toBe('closed')
    expect(t.direction).toBe('long')
    expect(t.open_price).toBe(2000)
    expect(t.close_price).toBe(2010)
    expect(t.volume).toBe(1)
    expect(t.gross_profit).toBe(1000)
    expect(t.commission).toBe(-7)
    expect(t.net_profit).toBe(992) // 1000 − 3.5 − 3.5 − 1
    expect(t.initial_sl).toBe(1990)
    expect(t.r_multiple).toBe(1)
    expect(t.ticket_out).toHaveLength(1)
  })

  it('short trade R: sell 100, stop 102, buy back 97 → +1.5R', () => {
    const [t] = buildTrades([
      deal({ position_id: 2, type: SELL, entry: IN, volume: 1, price: 100, sl: 102 }),
      deal({ position_id: 2, type: BUY, entry: OUT, volume: 1, price: 97, profit: 300 }),
    ])
    expect(t.direction).toBe('short')
    expect(t.r_multiple).toBe(1.5)
  })

  it('scale-in: open price is the volume-weighted average of entries', () => {
    const [t] = buildTrades([
      deal({ position_id: 3, type: BUY, entry: IN, volume: 0.5, price: 100 }),
      deal({ position_id: 3, type: BUY, entry: IN, volume: 1.5, price: 104 }),
      deal({ position_id: 3, type: SELL, entry: OUT, volume: 2, price: 106, profit: 50 }),
    ])
    expect(t.volume).toBe(2)
    expect(t.open_price).toBe(103) // (0.5×100 + 1.5×104) / 2
  })

  it('partial closes: close price is the volume-weighted average of exits', () => {
    const [t] = buildTrades([
      deal({ position_id: 4, type: BUY, entry: IN, volume: 1, price: 100 }),
      deal({ position_id: 4, type: SELL, entry: OUT, volume: 0.4, price: 104, profit: 16 }),
      deal({ position_id: 4, type: SELL, entry: OUT, volume: 0.6, price: 98, profit: -12 }),
    ])
    expect(t.status).toBe('closed')
    expect(t.close_price).toBeCloseTo(100.4) // 0.4×104 + 0.6×98
    expect(t.net_profit).toBe(4)
    expect(t.ticket_out).toHaveLength(2)
  })

  it('a partially closed position stays open', () => {
    const [t] = buildTrades([
      deal({ position_id: 5, type: BUY, entry: IN, volume: 1, price: 100 }),
      deal({ position_id: 5, type: SELL, entry: OUT, volume: 0.5, price: 101, profit: 5 }),
    ])
    expect(t.status).toBe('open')
    expect(t.close_time).toBeNull()
    expect(t.closed_volume).toBe(0.5)
    expect(t.r_multiple).toBeNull()
  })

  it('close-by: both opposite positions close against each other', () => {
    const trades = buildTrades([
      deal({ position_id: 10, type: BUY, entry: IN, volume: 1, price: 100 }),
      deal({ position_id: 11, type: SELL, entry: IN, volume: 1, price: 105 }),
      deal({ position_id: 10, type: SELL, entry: OUT_BY, volume: 1, price: 105, profit: 500 }),
      deal({ position_id: 11, type: BUY, entry: OUT_BY, volume: 1, price: 105, profit: 0 }),
    ])
    expect(trades).toHaveLength(2)
    const long = trades.find((t) => t.position_id === 10)
    const short = trades.find((t) => t.position_id === 11)
    expect(long?.status).toBe('closed')
    expect(long?.net_profit).toBe(500)
    expect(short?.status).toBe('closed')
    expect(short?.close_price).toBe(105)
  })
})

describe('buildTrades: netting', () => {
  it('reversal (INOUT) splits one position into two legs', () => {
    const trades = buildTrades([
      deal({
        position_id: 20,
        type: BUY,
        entry: IN,
        volume: 1,
        price: 100,
        sl: 95,
        commission: -2,
      }),
      // Sell 3: closes the long 1 and opens a short 2. Commission −6 splits 1/3 : 2/3.
      deal({
        position_id: 20,
        type: SELL,
        entry: INOUT,
        volume: 3,
        price: 110,
        profit: 1000,
        commission: -6,
        sl: 115,
      }),
      deal({
        position_id: 20,
        type: BUY,
        entry: OUT,
        volume: 2,
        price: 105,
        profit: 1000,
        commission: -4,
      }),
    ])
    expect(trades).toHaveLength(2)
    const [a, b] = trades.sort((x, y) => x.leg - y.leg)
    expect(a.leg).toBe(0)
    expect(a.direction).toBe('long')
    expect(a.volume).toBe(1)
    expect(a.close_price).toBe(110)
    expect(a.net_profit).toBe(996) // 1000 − 2 − 2
    expect(a.r_multiple).toBe(2) // (110 − 100) / 5
    expect(b.leg).toBe(1)
    expect(b.direction).toBe('short')
    expect(b.volume).toBe(2)
    expect(b.open_price).toBe(110)
    expect(b.close_price).toBe(105)
    expect(b.net_profit).toBe(992) // 1000 − 4 − 4
    expect(b.initial_sl).toBe(115)
    expect(b.r_multiple).toBe(1)
  })

  it('scale-in and partial close on one netting position id', () => {
    const [t] = buildTrades([
      deal({ position_id: 30, type: SELL, entry: IN, volume: 1, price: 50 }),
      deal({ position_id: 30, type: SELL, entry: IN, volume: 1, price: 52 }),
      deal({ position_id: 30, type: BUY, entry: OUT, volume: 1.5, price: 49, profit: 30 }),
      deal({ position_id: 30, type: BUY, entry: OUT, volume: 0.5, price: 48, profit: 15 }),
    ])
    expect(t.direction).toBe('short')
    expect(t.open_price).toBe(51)
    expect(t.close_price).toBeCloseTo(48.75)
    expect(t.status).toBe('closed')
    expect(t.net_profit).toBe(45)
  })
})

describe('buildTrades: robustness', () => {
  it('ignores balance, deposit and credit deals', () => {
    expect(
      buildTrades([
        deal({ position_id: 0, type: BALANCE, entry: IN, volume: 0, price: 0, profit: 10000 }),
      ]),
    ).toEqual([])
  })

  it('is idempotent when the same deal arrives twice', () => {
    const d1 = deal({ position_id: 40, type: BUY, entry: IN, volume: 1, price: 100 })
    const d2 = deal({ position_id: 40, type: SELL, entry: OUT, volume: 1, price: 101, profit: 100 })
    expect(buildTrades([d1, d2, d2, d1])).toEqual(buildTrades([d1, d2]))
  })

  it('orders deals by time, not by arrival', () => {
    const d1 = deal({ position_id: 41, type: BUY, entry: IN, volume: 1, price: 100 })
    const d2 = deal({ position_id: 41, type: SELL, entry: OUT, volume: 1, price: 101, profit: 100 })
    expect(buildTrades([d2, d1])).toEqual(buildTrades([d1, d2]))
  })

  it('an exit whose entry is outside the history window is flagged, not dropped', () => {
    const [t] = buildTrades([
      deal({ position_id: 50, type: SELL, entry: OUT, volume: 0.3, price: 2400, profit: 75 }),
    ])
    expect(t.history_complete).toBe(false)
    expect(t.direction).toBe('long')
    expect(t.open_price).toBeNull()
    expect(t.status).toBe('closed')
    expect(t.net_profit).toBe(75)
    expect(t.r_multiple).toBeNull()
  })

  it('no stop loss → R unknown', () => {
    const [t] = buildTrades([
      deal({ position_id: 60, type: BUY, entry: IN, volume: 1, price: 100 }),
      deal({ position_id: 60, type: SELL, entry: OUT, volume: 1, price: 102, profit: 2 }),
    ])
    expect(t.initial_sl).toBeNull()
    expect(t.r_multiple).toBeNull()
  })

  it('stop already at break-even or in profit → R unknown, not infinite', () => {
    const [t] = buildTrades([
      deal({ position_id: 61, type: BUY, entry: IN, volume: 1, price: 100, sl: 100 }),
      deal({ position_id: 61, type: SELL, entry: OUT, volume: 1, price: 102, profit: 2 }),
    ])
    expect(t.r_multiple).toBeNull()
  })

  it('falls back to the first SL seen on an exit when the entry had none', () => {
    const [t] = buildTrades([
      deal({ position_id: 62, type: BUY, entry: IN, volume: 1, price: 100 }),
      deal({
        position_id: 62,
        type: SELL,
        entry: OUT,
        volume: 1,
        price: 96,
        sl: 96,
        profit: -4,
        reason: 4,
      }),
    ])
    expect(t.initial_sl).toBe(96)
    expect(t.r_multiple).toBe(-1)
  })
})
