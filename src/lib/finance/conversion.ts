/**
 * Converting quote-currency amounts into USD.
 *
 * The manual rate is entered the way traders quote it:
 *  - JPY, CAD, CHF … : USD is the base of the usual pair (USDJPY = 150) → usdPerQuote = 1 / rate
 *  - EUR, GBP, AUD, NZD: the currency is the base (GBPUSD = 1.27)       → usdPerQuote = rate
 */
const QUOTE_AS_BASE = new Set(['EUR', 'GBP', 'AUD', 'NZD'])

export function usdPerQuote(quoteCurrency: string, rate: number): number {
  const q = quoteCurrency.toUpperCase()
  if (q === 'USD') return 1
  if (!(rate > 0)) return NaN
  return QUOTE_AS_BASE.has(q) ? rate : 1 / rate
}

/** Human label for the rate input, e.g. "USDJPY rate". */
export function conversionPairLabel(quoteCurrency: string): string | null {
  const q = quoteCurrency.toUpperCase()
  if (q === 'USD') return null
  return QUOTE_AS_BASE.has(q) ? `${q}USD` : `USD${q}`
}
