export const INSTRUMENT_GROUPS = ['Gold', 'Nasdaq', 'FX', 'Indices', 'Crypto', 'Other'] as const
export type InstrumentGroup = (typeof INSTRUMENT_GROUPS)[number]

export interface SymbolMapping {
  /** Canonical name used by calculators and symbol specs (e.g. GOLD → XAUUSD). */
  canonical: string
  group: InstrumentGroup
}

/** User overrides, keyed by the broker's raw symbol (upper-cased). */
export type SymbolOverrides = Record<string, Partial<SymbolMapping>>

const ALIASES: Record<string, { names: string[]; group: InstrumentGroup }> = {
  XAUUSD: { names: ['XAUUSD', 'GOLD', 'XAU'], group: 'Gold' },
  NAS100: {
    names: [
      'NAS100',
      'US100',
      'USTEC',
      'USTECH',
      'NDX',
      'NDX100',
      'NQ100',
      'NASDAQ',
      'NASDAQ100',
      'TECH100',
    ],
    group: 'Nasdaq',
  },
  US30: { names: ['US30', 'DJ30', 'WS30', 'DOW30', 'USA30', 'DOW', 'DJI'], group: 'Indices' },
  SPX500: { names: ['SPX500', 'US500', 'SP500', 'USA500', 'SPX'], group: 'Indices' },
  DE40: { names: ['DE40', 'GER40', 'DAX40', 'GER30', 'DE30', 'DAX'], group: 'Indices' },
  UK100: { names: ['UK100', 'FTSE100', 'FTSE'], group: 'Indices' },
  JP225: { names: ['JP225', 'JPN225', 'NIKKEI', 'NIK225'], group: 'Indices' },
  EU50: { names: ['EU50', 'EUSTX50', 'STOXX50'], group: 'Indices' },
  BTCUSD: { names: ['BTCUSD', 'BITCOIN', 'BTCUSDT', 'XBTUSD'], group: 'Crypto' },
  ETHUSD: { names: ['ETHUSD', 'ETHEREUM', 'ETHUSDT'], group: 'Crypto' },
  XAGUSD: { names: ['XAGUSD', 'SILVER', 'XAG'], group: 'Other' },
}

const BY_NAME = new Map<string, { canonical: string; group: InstrumentGroup }>()
for (const [canonical, { names, group }] of Object.entries(ALIASES))
  for (const n of names) BY_NAME.set(n, { canonical, group })

const CURRENCIES = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'HUF',
  'CZK',
  'TRY',
  'ZAR',
  'MXN',
  'SGD',
  'HKD',
  'CNH',
  'RUB',
  'ILS',
])
const CRYPTO = new Set([
  'BTC',
  'ETH',
  'LTC',
  'XRP',
  'SOL',
  'ADA',
  'DOGE',
  'BNB',
  'DOT',
  'LINK',
  'BCH',
  'XLM',
  'AVAX',
])

/** Common broker suffixes: XM "GOLDm#", "US100Cash", "EURUSDmicro", ".pro", "-ecn", "_i" … */
const SUFFIXES = [
  'CASH',
  'MICRO',
  'MINI',
  'PRO',
  'ECN',
  'RAW',
  'STD',
  'PLUS',
  'SPOT',
  'M',
  'C',
  'I',
  'X',
  'Z',
  'B',
  'S',
]

function classify(core: string): SymbolMapping | null {
  const hit = BY_NAME.get(core)
  if (hit) return hit
  if (/^[A-Z]{6}$/.test(core)) {
    const base = core.slice(0, 3)
    const quote = core.slice(3)
    if (CURRENCIES.has(base) && CURRENCIES.has(quote)) return { canonical: core, group: 'FX' }
    if (CRYPTO.has(base) && (quote === 'USD' || quote === 'EUR'))
      return { canonical: core, group: 'Crypto' }
  }
  if (/^[A-Z]{3,5}(USD|USDT)$/.test(core) && CRYPTO.has(core.replace(/USDT?$/, '')))
    return { canonical: core.replace(/USDT$/, 'USD'), group: 'Crypto' }
  return null
}

/** Map a raw broker symbol to a canonical name and instrument group. */
export function mapSymbol(raw: string, overrides: SymbolOverrides = {}): SymbolMapping {
  const key = raw.trim().toUpperCase()
  const fallback = autoMapSymbol(key)
  const o = overrides[key]
  return { canonical: o?.canonical || fallback.canonical, group: o?.group ?? fallback.group }
}

export function autoMapSymbol(raw: string): SymbolMapping {
  const upper = raw.trim().toUpperCase()
  // Drop anything after a separator, then any non-alphanumerics.
  let core = upper.split(/[.#_\-+! ]/)[0].replace(/[^A-Z0-9]/g, '')
  const direct = classify(core)
  if (direct) return direct
  // Strip known suffixes one at a time.
  for (let i = 0; i < 3; i++) {
    const suffix = SUFFIXES.find((s) => core.length - s.length >= 3 && core.endsWith(s))
    if (!suffix) break
    core = core.slice(0, -suffix.length)
    const hit = classify(core)
    if (hit) return hit
  }
  return { canonical: upper.replace(/[^A-Z0-9]/g, '') || upper, group: 'Other' }
}
