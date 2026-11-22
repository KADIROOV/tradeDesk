/**
 * MT5 wire types shared by the browser, the Vercel API and the tests.
 * This folder must stay dependency-free and use relative `.js` imports so the
 * serverless bundle can load it without the Vite path alias.
 */

/** ENUM_DEAL_TYPE */
export const DEAL_TYPE = {
  BUY: 0,
  SELL: 1,
  BALANCE: 2,
  CREDIT: 3,
  CHARGE: 4,
  CORRECTION: 5,
  BONUS: 6,
  COMMISSION: 7,
  COMMISSION_DAILY: 8,
  COMMISSION_MONTHLY: 9,
  COMMISSION_AGENT_DAILY: 10,
  COMMISSION_AGENT_MONTHLY: 11,
  INTEREST: 12,
  BUY_CANCELED: 13,
  SELL_CANCELED: 14,
  DIVIDEND: 15,
  DIVIDEND_FRANKED: 16,
  TAX: 17,
} as const

/** ENUM_DEAL_ENTRY */
export const DEAL_ENTRY = { IN: 0, OUT: 1, INOUT: 2, OUT_BY: 3 } as const

export interface Mt5Deal {
  ticket: number
  order: number
  position_id: number
  /** UTC epoch seconds (the EA converts from broker server time). */
  time: number
  /** UTC epoch milliseconds, for ordering deals inside the same second. */
  time_msc?: number
  type: number
  entry: number
  symbol: string
  volume: number
  price: number
  profit: number
  commission: number
  swap: number
  fee: number
  sl: number
  tp: number
  magic: number
  comment: string
  reason?: number
}

export const isTradeDeal = (d: Pick<Mt5Deal, 'type'>) =>
  d.type === DEAL_TYPE.BUY || d.type === DEAL_TYPE.SELL

/** Deposits, withdrawals, credit, bonuses: cash moving in or out without trading. */
export const isExternalFlow = (d: Pick<Mt5Deal, 'type'>) =>
  d.type === DEAL_TYPE.BALANCE ||
  d.type === DEAL_TYPE.CREDIT ||
  d.type === DEAL_TYPE.BONUS ||
  d.type === DEAL_TYPE.CORRECTION

/** Net cash effect of any deal on the balance. */
export const dealCash = (d: Pick<Mt5Deal, 'profit' | 'commission' | 'swap' | 'fee'>) =>
  d.profit + d.commission + d.swap + d.fee
