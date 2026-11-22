import { describe, expect, it } from 'vitest'
import { DEFAULT_SYMBOL_SPECS } from '@/data/symbolSpecs'
import type { SymbolSpec } from '@/lib/types'
import { conversionPairLabel, usdPerQuote } from './conversion'
import {
  floorToStep,
  pipValuePerLot,
  plannedRR,
  positionSize,
  rMultiple,
  tradePnl,
  valuePerPointPerLot,
} from './position'

const spec = (s: string): SymbolSpec => {
  const found = DEFAULT_SYMBOL_SPECS.find((x) => x.symbol === s)
  if (!found) throw new Error(s)
  return found
}

describe('conversion', () => {
  it('USD quote needs no conversion', () => {
    expect(usdPerQuote('USD', 0)).toBe(1)
  })
  it('JPY/CAD/CHF are quoted as USDxxx → inverted', () => {
    expect(usdPerQuote('JPY', 150)).toBeCloseTo(1 / 150)
    expect(conversionPairLabel('JPY')).toBe('USDJPY')
  })
  it('GBP/EUR/AUD/NZD are quoted as xxxUSD → used directly', () => {
    expect(usdPerQuote('GBP', 1.27)).toBeCloseTo(1.27)
    expect(conversionPairLabel('GBP')).toBe('GBPUSD')
  })
  it('invalid rate gives NaN', () => {
    expect(usdPerQuote('JPY', 0)).toBeNaN()
  })
})

describe('value per point / pip', () => {
  it('XAUUSD: $1 move = $100 per 1.0 lot', () => {
    expect(valuePerPointPerLot(spec('XAUUSD'))).toBeCloseTo(100)
  })
  it('NAS100: $1 per point per 1.0 lot', () => {
    expect(valuePerPointPerLot(spec('NAS100'))).toBeCloseTo(1)
  })
  it('EURUSD: $10 per pip per standard lot', () => {
    expect(pipValuePerLot(spec('EURUSD'))).toBeCloseTo(10)
  })
  it('USDJPY at 150: ¥1000 per pip = $6.67', () => {
    expect(pipValuePerLot(spec('USDJPY'), 150)).toBeCloseTo(6.6667, 3)
  })
  it('EURGBP at GBPUSD 1.27: £10 per pip = $12.70', () => {
    expect(pipValuePerLot(spec('EURGBP'), 1.27)).toBeCloseTo(12.7)
  })
})

describe('floorToStep', () => {
  it('handles floating point noise', () => {
    expect(floorToStep(0.49999999999, 0.01)).toBeCloseTo(0.5)
    expect(floorToStep(0.256, 0.01)).toBeCloseTo(0.25)
  })
})

describe('positionSize', () => {
  it('XAUUSD: $10k, 1% risk, 5.00 stop → 0.20 lots', () => {
    const r = positionSize({
      spec: spec('XAUUSD'),
      balance: 10000,
      riskMode: 'percent',
      risk: 1,
      entry: 2000,
      stop: 1995,
      takeProfit: 2015,
      leverage: 100,
    })
    expect(r?.lots).toBeCloseTo(0.2)
    expect(r?.riskActual).toBeCloseTo(100)
    expect(r?.pips).toBeCloseTo(50)
    expect(r?.rr).toBeCloseTo(3)
    expect(r?.reward).toBeCloseTo(300)
    // notional = 0.2 × 100 oz × $2000 = $40,000; margin at 1:100 = $400
    expect(r?.notional).toBeCloseTo(40000)
    expect(r?.margin).toBeCloseTo(400)
    expect(r?.direction).toBe('long')
  })
  it('EURUSD: $10k, 1% risk, 20 pip stop → 0.50 lots', () => {
    const r = positionSize({
      spec: spec('EURUSD'),
      balance: 10000,
      riskMode: 'percent',
      risk: 1,
      entry: 1.1,
      stop: 1.098,
    })
    expect(r?.lots).toBeCloseTo(0.5)
    expect(r?.pips).toBeCloseTo(20)
  })
  it('USDJPY: $100 risk, 20 pip stop at 150 → 0.75 lots', () => {
    const r = positionSize({
      spec: spec('USDJPY'),
      balance: 10000,
      riskMode: 'amount',
      risk: 100,
      entry: 150,
      stop: 150.2,
      conversionRate: 150,
    })
    // pip value = ¥1000 / 150 = $6.667; 20 pips × $6.667 = $133.33 per lot → 100 / 133.33
    expect(r?.lots).toBeCloseTo(0.75)
    expect(r?.pipValue).toBeCloseTo(5)
    expect(r?.direction).toBe('short')
  })
  it('NAS100: $250 risk, 50 point stop → 5.00 lots', () => {
    const r = positionSize({
      spec: spec('NAS100'),
      balance: 25000,
      riskMode: 'amount',
      risk: 250,
      entry: 18000,
      stop: 17950,
    })
    expect(r?.lots).toBeCloseTo(5)
    expect(r?.pips).toBeCloseTo(50)
  })
  it('rounds down so risk never exceeds the target', () => {
    const r = positionSize({
      spec: spec('XAUUSD'),
      balance: 10000,
      riskMode: 'percent',
      risk: 1,
      entry: 2000,
      stop: 1993,
    })
    expect(r?.lots).toBeCloseTo(0.14)
    expect(r?.riskActual ?? Infinity).toBeLessThanOrEqual(100)
  })
  it('returns null for invalid input', () => {
    expect(
      positionSize({
        spec: spec('XAUUSD'),
        balance: 10000,
        riskMode: 'percent',
        risk: 1,
        entry: 2000,
        stop: 2000,
      }),
    ).toBeNull()
    expect(
      positionSize({
        spec: spec('XAUUSD'),
        balance: 10000,
        riskMode: 'percent',
        risk: 0,
        entry: 2000,
        stop: 1990,
      }),
    ).toBeNull()
  })
})

describe('tradePnl', () => {
  it('XAUUSD long 0.5 lot from 2000 to 2010 = +$500, minus $7 fees', () => {
    const r = tradePnl({
      spec: spec('XAUUSD'),
      direction: 'long',
      entry: 2000,
      exit: 2010,
      lots: 0.5,
      fees: 7,
    })
    expect(r.gross).toBeCloseTo(500)
    expect(r.net).toBeCloseTo(493)
    expect(r.pips).toBeCloseTo(100)
  })
  it('EURUSD short 1 lot from 1.1000 to 1.1025 = −$250', () => {
    const r = tradePnl({
      spec: spec('EURUSD'),
      direction: 'short',
      entry: 1.1,
      exit: 1.1025,
      lots: 1,
    })
    expect(r.net).toBeCloseTo(-250)
    expect(r.pips).toBeCloseTo(-25)
  })
  it('GBPJPY long 1 lot +50 pips at USDJPY 150 = +$333.33', () => {
    const r = tradePnl({
      spec: spec('GBPJPY'),
      direction: 'long',
      entry: 190,
      exit: 190.5,
      lots: 1,
      conversionRate: 150,
    })
    expect(r.net).toBeCloseTo(333.33, 1)
  })
})

describe('R and RR', () => {
  it('long: entry 100, stop 95, exit 110 → +2R', () => {
    expect(rMultiple('long', 100, 95, 110)).toBeCloseTo(2)
  })
  it('short: entry 100, stop 102, exit 101 → −0.5R', () => {
    expect(rMultiple('short', 100, 102, 101)).toBeCloseTo(-0.5)
  })
  it('zero risk → undefined', () => {
    expect(rMultiple('long', 100, 100, 110)).toBeUndefined()
  })
  it('planned RR 1:2.5', () => {
    expect(plannedRR(100, 98, 105)).toBeCloseTo(2.5)
  })
})
