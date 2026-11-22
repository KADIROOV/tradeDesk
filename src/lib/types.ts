export type Direction = 'long' | 'short'
export type Session = 'asia' | 'london' | 'newyork' | 'overlap' | 'other'

export interface Trade {
  id: string
  symbol: string
  direction: Direction
  /** ISO timestamp the trade was opened. */
  openedAt: string
  entry?: number
  stop?: number
  takeProfit?: number
  exit?: number
  lots?: number
  fees: number
  /** Net P&L in account currency (USD). */
  pnl: number
  /** True when P&L was typed in rather than calculated from prices. */
  pnlManual: boolean
  session?: Session
  setup?: string
  emotion?: string
  /** idb-keyval key of the screenshot blob. */
  screenshotId?: string
  notes?: string
  rulesFollowed: boolean

  // ---- Cloud / MT5 fields (absent for trades kept only on this device) ----
  /** 'mt5' trades are synced from MetaTrader: numbers are read-only. */
  source?: TradeSource
  accountId?: string | null
  /** Close time (ISO). Calendar days and stats use this when present. */
  closedAt?: string
  status?: 'open' | 'closed'
  /** Server-computed R for MT5 trades; null means "R unknown" (no stop loss). */
  rMultiple?: number | null
  historyComplete?: boolean
  commission?: number
  swap?: number
  rating?: number
  /** Screenshot references: IndexedDB ids locally, storage paths ("sb:<path>") in the cloud. */
  screenshots?: string[]
  symbolRaw?: string
  group?: string
}

export type TradeSource = 'mt5' | 'manual' | 'csv'

export type InstrumentCategory = 'metal' | 'index' | 'crypto' | 'fx-major' | 'fx-minor'

export interface SymbolSpec {
  symbol: string
  name: string
  category: InstrumentCategory
  /** Units of the underlying per 1.0 lot (e.g. 100 oz gold, 100,000 FX units). */
  contractSize: number
  /** Minimum price increment. */
  tickSize: number
  /** Value of one tick for 1.0 lot, in the quote currency. */
  tickValue: number
  /** Size of one pip / point in price units. */
  pipSize: number
  quoteCurrency: string
  /** Manual conversion rate used when the quote currency is not USD (see lib/finance/conversion). */
  conversionRate: number
  /** Decimal places shown for prices. */
  digits: number
}
