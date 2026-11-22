import { describe, expect, it } from 'vitest'
import { accountReturn, dailyClosingBalances } from './balance.js'
import { isEuDst, isUsDst, serverOffsetHours, serverToUtc, utcToServer } from './serverTime.js'
import { autoMapSymbol, mapSymbol } from './symbols.js'
import { dayKeyInZone, isValidTimeZone } from './tz.js'
import { DEAL_TYPE } from './types.js'

const utc = (s: string) => Date.parse(`${s}Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)

describe('broker server time (XM: GMT+2 winter, GMT+3 summer, US DST dates)', () => {
  it('US DST 2026 starts 8 Mar 07:00 UTC and ends 1 Nov 06:00 UTC', () => {
    expect(isUsDst(utc('2026-03-08T06:59'))).toBe(false)
    expect(isUsDst(utc('2026-03-08T07:00'))).toBe(true)
    expect(isUsDst(utc('2026-11-01T05:59'))).toBe(true)
    expect(isUsDst(utc('2026-11-01T06:00'))).toBe(false)
  })
  it('EU DST 2026 runs 29 Mar → 25 Oct', () => {
    expect(isEuDst(utc('2026-03-29T00:59'))).toBe(false)
    expect(isEuDst(utc('2026-03-29T01:00'))).toBe(true)
    expect(isEuDst(utc('2026-10-25T01:00'))).toBe(false)
  })
  it('winter: server 12:00 = 10:00 UTC', () => {
    expect(iso(serverToUtc(utc('2026-01-15T12:00')))).toBe('2026-01-15T10:00')
  })
  it('summer: server 12:00 = 09:00 UTC', () => {
    expect(iso(serverToUtc(utc('2026-07-15T12:00')))).toBe('2026-07-15T09:00')
  })
  it('the US and EU rules differ in the March gap', () => {
    expect(iso(serverToUtc(utc('2026-03-20T12:00'), 'us'))).toBe('2026-03-20T09:00')
    expect(iso(serverToUtc(utc('2026-03-20T12:00'), 'eu'))).toBe('2026-03-20T10:00')
  })
  it('server midnight after the November switch maps to 22:00 UTC the day before', () => {
    expect(iso(serverToUtc(utc('2026-11-03T00:00')))).toBe('2026-11-02T22:00')
  })
  it('fixed offsets and round trips', () => {
    expect(iso(serverToUtc(utc('2026-06-01T05:00'), { fixed: 0 }))).toBe('2026-06-01T05:00')
    for (const s of ['2026-01-10T03:00', '2026-06-10T23:30', '2026-11-20T00:15']) {
      expect(serverToUtc(utcToServer(utc(s)))).toBe(utc(s))
    }
    expect(serverOffsetHours(utc('2026-07-01T00:00'))).toBe(3)
  })
})

describe('day bucketing by the user’s timezone', () => {
  it('20:30 UTC is already the next day in Tashkent (UTC+5)', () => {
    expect(dayKeyInZone('2026-03-01T20:30:00Z', 'Asia/Tashkent')).toBe('2026-03-02')
    expect(dayKeyInZone('2026-03-01T20:30:00Z', 'UTC')).toBe('2026-03-01')
    expect(dayKeyInZone('2026-03-01T03:30:00Z', 'America/New_York')).toBe('2026-02-28')
  })
  it('validates time zones', () => {
    expect(isValidTimeZone('Asia/Tashkent')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('symbol mapping', () => {
  const cases: [string, string, string][] = [
    ['GOLD', 'XAUUSD', 'Gold'],
    ['GOLDm#', 'XAUUSD', 'Gold'],
    ['XAUUSD.pro', 'XAUUSD', 'Gold'],
    ['US100Cash', 'NAS100', 'Nasdaq'],
    ['USTEC', 'NAS100', 'Nasdaq'],
    ['US30Cash', 'US30', 'Indices'],
    ['GER40Cash', 'DE40', 'Indices'],
    ['DE40', 'DE40', 'Indices'],
    ['US500Cash', 'SPX500', 'Indices'],
    ['EURUSDm', 'EURUSD', 'FX'],
    ['USDJPY#', 'USDJPY', 'FX'],
    ['GBPJPYmicro', 'GBPJPY', 'FX'],
    ['BTCUSD', 'BTCUSD', 'Crypto'],
    ['ETHUSDT', 'ETHUSD', 'Crypto'],
    ['SOMETHING', 'SOMETHING', 'Other'],
  ]
  for (const [raw, canonical, group] of cases) {
    it(`${raw} → ${canonical} (${group})`, () => {
      expect(autoMapSymbol(raw)).toEqual({ canonical, group })
    })
  }
  it('user overrides win', () => {
    expect(mapSymbol('US100Cash', { US100CASH: { group: 'Indices' } })).toEqual({
      canonical: 'NAS100',
      group: 'Indices',
    })
    expect(mapSymbol('weird', { WEIRD: { canonical: 'XAUUSD', group: 'Gold' } })).toEqual({
      canonical: 'XAUUSD',
      group: 'Gold',
    })
  })
})

describe('balance and return', () => {
  const t = (iso: string) => Date.parse(iso) / 1000
  const deals = [
    {
      time: t('2026-03-01T06:00:00Z'),
      type: DEAL_TYPE.BALANCE,
      profit: 10000,
      commission: 0,
      swap: 0,
      fee: 0,
    },
    {
      time: t('2026-03-02T10:00:00Z'),
      type: DEAL_TYPE.SELL,
      profit: 500,
      commission: -7,
      swap: 0,
      fee: 0,
    },
    {
      time: t('2026-03-03T10:00:00Z'),
      type: DEAL_TYPE.BUY,
      profit: -200,
      commission: -7,
      swap: -2,
      fee: 0,
    },
    {
      time: t('2026-03-04T10:00:00Z'),
      type: DEAL_TYPE.BALANCE,
      profit: -1000,
      commission: 0,
      swap: 0,
      fee: 0,
    },
  ]
  it('deposits and withdrawals are not P&L', () => {
    const r = accountReturn(deals, 9284)
    expect(r.tradingPnl).toBe(284) // 500 − 7 − 200 − 7 − 2
    expect(r.deposits).toBe(10000)
    expect(r.withdrawals).toBe(1000)
    expect(r.derivedStart).toBe(0)
    expect(r.returnPct).toBeCloseTo(284 / 9000)
  })
  it('a user-set starting balance is used as the base', () => {
    expect(accountReturn(deals.slice(1, 3), 10284, 10000).returnPct).toBeCloseTo(284 / 10000)
  })
  it('closing balances are derived backwards from the current balance', () => {
    const m = dailyClosingBalances(deals, 9284, 'UTC')
    expect(m.get('2026-03-04')).toBe(9284)
    expect(m.get('2026-03-03')).toBe(10284)
    expect(m.get('2026-03-02')).toBe(10493)
    expect(m.get('2026-03-01')).toBe(10000)
  })
})
