import type { Direction, SymbolSpec } from '@/lib/types'
import { usdPerQuote } from './conversion'

/** Tolerance in lot-step units, so 0.4999999999 lots still rounds to 0.50. */
const EPS = 1e-7

/** USD value of a 1.0 price-unit move for 1.0 lot. */
export function valuePerPointPerLot(
  spec: SymbolSpec,
  conversionRate = spec.conversionRate,
): number {
  return (spec.tickValue / spec.tickSize) * usdPerQuote(spec.quoteCurrency, conversionRate)
}

/** USD value of one pip (spec.pipSize) for 1.0 lot. */
export function pipValuePerLot(spec: SymbolSpec, conversionRate = spec.conversionRate): number {
  return valuePerPointPerLot(spec, conversionRate) * spec.pipSize
}

export function floorToStep(value: number, step: number): number {
  if (!(step > 0)) return value
  return Math.floor(value / step + EPS) * step
}

export interface PositionSizeInput {
  spec: SymbolSpec
  balance: number
  riskMode: 'percent' | 'amount'
  /** Percent (1 = 1 %) or USD amount depending on riskMode. */
  risk: number
  entry: number
  stop: number
  takeProfit?: number
  leverage?: number
  conversionRate?: number
  lotStep?: number
}

export interface PositionSizeResult {
  lots: number
  rawLots: number
  riskTarget: number
  riskActual: number
  riskPercentActual: number
  distance: number
  pips: number
  pipValue: number
  rr: number | null
  reward: number | null
  notional: number
  margin: number | null
  direction: Direction
}

export function positionSize(input: PositionSizeInput): PositionSizeResult | null {
  const { spec, balance, riskMode, risk, entry, stop, takeProfit, leverage } = input
  const rate = input.conversionRate ?? spec.conversionRate
  const step = input.lotStep ?? 0.01
  if (!(entry > 0) || !(stop > 0) || entry === stop || !(risk > 0)) return null
  const riskTarget = riskMode === 'percent' ? (balance * risk) / 100 : risk
  if (!(riskTarget > 0)) return null

  const distance = Math.abs(entry - stop)
  const perPoint = valuePerPointPerLot(spec, rate)
  if (!Number.isFinite(perPoint) || perPoint <= 0) return null
  const lossPerLot = distance * perPoint
  const rawLots = riskTarget / lossPerLot
  const lots = Number(floorToStep(rawLots, step).toFixed(6))
  const riskActual = lots * lossPerLot
  const direction: Direction = entry > stop ? 'long' : 'short'

  let rr: number | null = null
  let reward: number | null = null
  if (takeProfit !== undefined && takeProfit > 0) {
    const tpDistance = direction === 'long' ? takeProfit - entry : entry - takeProfit
    rr = tpDistance / distance
    reward = tpDistance * perPoint * lots
  }

  const notional = lots * spec.contractSize * entry * usdPerQuote(spec.quoteCurrency, rate)
  const margin = leverage && leverage > 0 ? notional / leverage : null

  return {
    lots,
    rawLots,
    riskTarget,
    riskActual,
    riskPercentActual: balance > 0 ? (riskActual / balance) * 100 : 0,
    distance,
    pips: distance / spec.pipSize,
    pipValue: pipValuePerLot(spec, rate) * lots,
    rr,
    reward,
    notional,
    margin,
    direction,
  }
}

export interface PnlInput {
  spec: SymbolSpec
  direction: Direction
  entry: number
  exit: number
  lots: number
  fees?: number
  conversionRate?: number
}

export interface PnlResult {
  gross: number
  net: number
  pips: number
  priceMove: number
}

export function tradePnl(input: PnlInput): PnlResult {
  const { spec, direction, entry, exit, lots } = input
  const sign = direction === 'long' ? 1 : -1
  const priceMove = (exit - entry) * sign
  const gross =
    priceMove * valuePerPointPerLot(spec, input.conversionRate ?? spec.conversionRate) * lots
  const net = gross - (input.fees ?? 0)
  return { gross, net, pips: priceMove / spec.pipSize, priceMove }
}

/** Realised R-multiple: price move in units of initial risk. */
export function rMultiple(
  direction: Direction,
  entry: number,
  stop: number,
  exit: number,
): number | undefined {
  const risk = Math.abs(entry - stop)
  if (!(risk > 0)) return undefined
  const sign = direction === 'long' ? 1 : -1
  return ((exit - entry) * sign) / risk
}

/** Planned reward-to-risk from entry/stop/target. */
export function plannedRR(entry: number, stop: number, takeProfit: number): number | undefined {
  const risk = Math.abs(entry - stop)
  if (!(risk > 0)) return undefined
  return Math.abs(takeProfit - entry) / risk
}
