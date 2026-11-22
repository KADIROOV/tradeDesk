/** Break-even win rate for a given reward:risk ratio, ignoring costs: 1 / (1 + RR). */
export function breakEvenWinRate(rr: number): number {
  if (!(rr > 0)) return NaN
  return 1 / (1 + rr)
}

/** Expectancy in R per trade: p·RR − (1 − p). */
export function expectancyR(winRate: number, rr: number): number {
  return winRate * rr - (1 - winRate)
}

/** Gain needed to recover from a fractional drawdown d: d / (1 − d). */
export function recoveryGain(drawdown: number): number {
  if (drawdown >= 1) return Infinity
  if (drawdown <= 0) return 0
  return drawdown / (1 - drawdown)
}

export function drawdownRecoveryTable(
  levels = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9],
) {
  return levels.map((d) => ({ drawdown: d, recovery: recoveryGain(d) }))
}

/** Consecutive losses needed to hit a drawdown with fixed-fractional risk r: ln(1−D)/ln(1−r). */
export function lossesToDrawdown(riskPerTrade: number, drawdown: number): number {
  if (!(riskPerTrade > 0 && riskPerTrade < 1) || !(drawdown > 0 && drawdown < 1)) return NaN
  return Math.log(1 - drawdown) / Math.log(1 - riskPerTrade)
}

/**
 * Risk of ruin for a random walk where each trade wins +RR units with probability p
 * or loses 1 unit. The probability of ever losing N units is θ^N, where θ ∈ (0, 1)
 * solves p·θ^(RR+1) − θ + (1 − p) = 0. Exact for RR = 1 (classic gambler's ruin:
 * θ = q/p) and the standard Lundberg-style estimate otherwise.
 *
 * `units` is the number of risk units between the current balance and the ruin level
 * (use lossesToDrawdown to convert a % drawdown with fixed-fractional risk).
 */
export function riskOfRuin(winRate: number, rr: number, units: number): number {
  if (!(winRate > 0) || !(rr > 0) || !(units > 0)) return 1
  if (winRate >= 1) return 0
  if (expectancyR(winRate, rr) <= 0) return 1
  const q = 1 - winRate
  const f = (x: number) => winRate * Math.pow(x, rr + 1) - x + q
  // f is convex on [0, 1] with f(0) = q > 0 and f(1) = 0. With a positive edge its minimum
  // x* = (1 / (p·(RR+1)))^(1/RR) lies inside (0, 1) and f(x*) < 0, so the root is in (0, x*).
  let lo = 0
  let hi = Math.pow(1 / (winRate * (rr + 1)), 1 / rr)
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
  }
  const theta = (lo + hi) / 2
  return Math.min(1, Math.pow(theta, units))
}

export interface CompoundPoint {
  period: number
  balance: number
  gain: number
  contributed: number
}

/** Compounding projection: each period grows by `ratePct` %, then adds a contribution. */
export function compoundProjection(
  start: number,
  ratePct: number,
  periods: number,
  contribution = 0,
): CompoundPoint[] {
  const out: CompoundPoint[] = [{ period: 0, balance: start, gain: 0, contributed: start }]
  let balance = start
  let contributed = start
  const n = Math.max(0, Math.min(600, Math.floor(periods)))
  for (let i = 1; i <= n; i++) {
    balance = balance * (1 + ratePct / 100) + contribution
    contributed += contribution
    out.push({ period: i, balance, gain: balance - contributed, contributed })
  }
  return out
}
