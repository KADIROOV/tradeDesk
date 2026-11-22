import { describe, expect, it } from 'vitest'
import {
  breakEvenWinRate,
  compoundProjection,
  drawdownRecoveryTable,
  expectancyR,
  lossesToDrawdown,
  recoveryGain,
  riskOfRuin,
} from './tools'

describe('break-even win rate', () => {
  it('1:1 needs 50%', () => expect(breakEvenWinRate(1)).toBeCloseTo(0.5))
  it('1:2 needs 33.3%', () => expect(breakEvenWinRate(2)).toBeCloseTo(1 / 3))
  it('1:3 needs 25%', () => expect(breakEvenWinRate(3)).toBeCloseTo(0.25))
  it('invalid RR → NaN', () => expect(breakEvenWinRate(0)).toBeNaN())
})

describe('expectancy', () => {
  it('45% at 1:2 → +0.35R', () => expect(expectancyR(0.45, 2)).toBeCloseTo(0.35))
  it('30% at 1:2 → −0.10R', () => expect(expectancyR(0.3, 2)).toBeCloseTo(-0.1))
})

describe('drawdown recovery', () => {
  it('10% loss needs 11.1%', () => expect(recoveryGain(0.1)).toBeCloseTo(0.1111, 3))
  it('50% loss needs 100%', () => expect(recoveryGain(0.5)).toBeCloseTo(1))
  it('100% loss is unrecoverable', () => expect(recoveryGain(1)).toBe(Infinity))
  it('table is monotonic', () => {
    const t = drawdownRecoveryTable()
    for (let i = 1; i < t.length; i++) expect(t[i].recovery).toBeGreaterThan(t[i - 1].recovery)
  })
})

describe('losses to drawdown', () => {
  it('1% risk → ~69 losses to lose 50%', () =>
    expect(lossesToDrawdown(0.01, 0.5)).toBeCloseTo(68.97, 1))
  it('2% risk → ~11 losses to lose 20%', () =>
    expect(lossesToDrawdown(0.02, 0.2)).toBeCloseTo(11.05, 1))
})

describe('risk of ruin', () => {
  it('matches the classic gambler’s ruin (q/p)^N for 1:1', () => {
    expect(riskOfRuin(0.6, 1, 10)).toBeCloseTo(Math.pow(0.4 / 0.6, 10), 6)
  })
  it('no edge → certain ruin', () => {
    expect(riskOfRuin(0.5, 1, 20)).toBe(1)
    expect(riskOfRuin(0.3, 2, 20)).toBe(1)
  })
  it('θ satisfies p·θ^(R+1) − θ + q = 0 for 1:2', () => {
    const p = 0.45
    const theta = riskOfRuin(p, 2, 1)
    expect(p * Math.pow(theta, 3) - theta + (1 - p)).toBeCloseTo(0, 8)
    expect(theta).toBeGreaterThan(0)
    expect(theta).toBeLessThan(1)
  })
  it('more units → lower ruin', () => {
    expect(riskOfRuin(0.5, 1.5, 50)).toBeLessThan(riskOfRuin(0.5, 1.5, 10))
  })
})

describe('compounding', () => {
  it('$10,000 at 2% for 12 months = $12,682.42', () => {
    const pts = compoundProjection(10000, 2, 12)
    expect(pts).toHaveLength(13)
    expect(pts[12].balance).toBeCloseTo(12682.42, 2)
  })
  it('contributions are added after growth', () => {
    const pts = compoundProjection(1000, 10, 2, 100)
    // 1000 → 1100 + 100 = 1200 → 1320 + 100 = 1420
    expect(pts[2].balance).toBeCloseTo(1420)
    expect(pts[2].contributed).toBe(1200)
    expect(pts[2].gain).toBeCloseTo(220)
  })
})
