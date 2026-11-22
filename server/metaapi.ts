import { DEAL_ENTRY, type Mt5Deal } from '../src/lib/mt5/types.js'

/**
 * Minimal MetaApi (metaapi.cloud) REST client. MetaApi runs the MT5 terminal in
 * the cloud; with the investor password the connection is read-only.
 * Docs: https://metaapi.cloud/docs/provisioning/ and https://metaapi.cloud/docs/client/
 */
const PROVISIONING = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'
const clientHost = (region: string | null | undefined) =>
  `https://mt-client-api-v1.${region && /^[a-z0-9-]+$/.test(region) ? region : 'new-york'}.agiliumtrade.ai`

export type MetaApiErrorCode = 'auth' | 'server' | 'otp' | 'password-change' | 'disabled' | 'other'

export class MetaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: MetaApiErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export interface MetaApiDeal {
  id: string
  type: string
  entryType?: string
  time: string
  profit: number
  symbol?: string
  magic?: number
  volume?: number
  price?: number
  commission?: number
  swap?: number
  positionId?: string
  orderId?: string
  comment?: string
  reason?: string
  stopLoss?: number
  takeProfit?: number
}

export interface MetaApiAccountState {
  state: string
  connectionStatus: string
  region: string | null
}

export interface MetaApiAccountInfo {
  balance: number
  equity: number
  currency: string
  leverage: number
  login: number
  server: string
  investorMode?: boolean
}

export type CreateResult = { kind: 'created'; id: string } | { kind: 'pending'; retryAfter: number }

export interface MetaApi {
  createAccount(
    input: { login: string; password: string; server: string; name: string },
    transactionId: string,
  ): Promise<CreateResult>
  getAccount(id: string): Promise<MetaApiAccountState>
  accountInfo(id: string, region: string | null): Promise<MetaApiAccountInfo>
  deals(id: string, region: string | null, from: Date, to: Date): Promise<MetaApiDeal[]>
  deleteAccount(id: string): Promise<void>
}

function classify(body: unknown): MetaApiErrorCode {
  const text = JSON.stringify(body ?? '')
  if (text.includes('E_AUTH')) return 'auth'
  if (text.includes('E_SRV_NOT_FOUND')) return 'server'
  if (text.includes('ERR_OTP_REQUIRED')) return 'otp'
  if (text.includes('E_PASSWORD_CHANGE_REQUIRED')) return 'password-change'
  if (text.includes('E_TRADING_ACCOUNT_DISABLED')) return 'disabled'
  return 'other'
}

function retryAfterSeconds(header: string | null): number {
  if (!header) return 30
  const n = Number(header)
  if (Number.isFinite(n)) return Math.max(5, Math.min(120, n))
  const at = Date.parse(header)
  return Number.isFinite(at) ? Math.max(5, Math.min(120, Math.round((at - Date.now()) / 1000))) : 30
}

export function createMetaApi(token: string, fetchImpl: typeof fetch = fetch): MetaApi {
  async function call(url: string, init: RequestInit = {}) {
    const res = await fetchImpl(url, {
      ...init,
      headers: { 'auth-token': token, 'content-type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    })
    return res
  }
  async function fail(res: Response): Promise<never> {
    const body: unknown = await res.json().catch(() => ({}))
    const message =
      typeof body === 'object' && body && 'message' in body && typeof body.message === 'string'
        ? body.message
        : `MetaApi HTTP ${res.status}`
    throw new MetaApiError(res.status, classify(body), message)
  }

  return {
    async createAccount(input, transactionId) {
      const res = await call(`${PROVISIONING}/users/current/accounts`, {
        method: 'POST',
        headers: { 'transaction-id': transactionId },
        body: JSON.stringify({
          login: input.login,
          password: input.password,
          name: input.name,
          server: input.server,
          platform: 'mt5',
          magic: 0,
          type: 'cloud-g2',
          keywords: ['tradedesk'],
        }),
      })
      if (res.status === 202)
        return { kind: 'pending', retryAfter: retryAfterSeconds(res.headers.get('retry-after')) }
      if (!res.ok) return fail(res)
      const body = (await res.json()) as { id: string }
      return { kind: 'created', id: body.id }
    },
    async getAccount(id) {
      const res = await call(`${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}`)
      if (!res.ok) return fail(res)
      const b = (await res.json()) as { state?: string; connectionStatus?: string; region?: string }
      return {
        state: b.state ?? 'UNKNOWN',
        connectionStatus: b.connectionStatus ?? 'DISCONNECTED',
        region: b.region ?? null,
      }
    },
    async accountInfo(id, region) {
      const res = await call(
        `${clientHost(region)}/users/current/accounts/${encodeURIComponent(id)}/account-information`,
      )
      if (!res.ok) return fail(res)
      return (await res.json()) as MetaApiAccountInfo
    },
    async deals(id, region, from, to) {
      const out: MetaApiDeal[] = []
      for (let offset = 0; offset < 50_000; offset += 1000) {
        const url = `${clientHost(region)}/users/current/accounts/${encodeURIComponent(id)}/history-deals/time/${from.toISOString()}/${to.toISOString()}?offset=${offset}&limit=1000`
        const res = await call(url)
        if (!res.ok) return fail(res)
        const page = (await res.json()) as MetaApiDeal[]
        out.push(...page)
        if (page.length < 1000) break
      }
      return out
    },
    async deleteAccount(id) {
      const res = await call(`${PROVISIONING}/users/current/accounts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 404) await fail(res)
    },
  }
}

// ---------------------------------------------------------------- mapping

const TYPES = [
  'DEAL_TYPE_BUY',
  'DEAL_TYPE_SELL',
  'DEAL_TYPE_BALANCE',
  'DEAL_TYPE_CREDIT',
  'DEAL_TYPE_CHARGE',
  'DEAL_TYPE_CORRECTION',
  'DEAL_TYPE_BONUS',
  'DEAL_TYPE_COMMISSION',
  'DEAL_TYPE_COMMISSION_DAILY',
  'DEAL_TYPE_COMMISSION_MONTHLY',
  'DEAL_TYPE_COMMISSION_AGENT_DAILY',
  'DEAL_TYPE_COMMISSION_AGENT_MONTHLY',
  'DEAL_TYPE_INTEREST',
  'DEAL_TYPE_BUY_CANCELED',
  'DEAL_TYPE_SELL_CANCELED',
  'DEAL_DIVIDEND',
  'DEAL_DIVIDEND_FRANKED',
  'DEAL_TAX',
]
const ENTRIES: Record<string, number> = {
  DEAL_ENTRY_IN: DEAL_ENTRY.IN,
  DEAL_ENTRY_OUT: DEAL_ENTRY.OUT,
  DEAL_ENTRY_INOUT: DEAL_ENTRY.INOUT,
  DEAL_ENTRY_OUT_BY: DEAL_ENTRY.OUT_BY,
}
const REASONS: Record<string, number> = {
  DEAL_REASON_CLIENT: 0,
  DEAL_REASON_MOBILE: 1,
  DEAL_REASON_WEB: 2,
  DEAL_REASON_EXPERT: 3,
  DEAL_REASON_SL: 4,
  DEAL_REASON_TP: 5,
  DEAL_REASON_SO: 6,
  DEAL_REASON_ROLLOVER: 7,
  DEAL_REASON_VMARGIN: 8,
  DEAL_REASON_SPLIT: 9,
}

const int = (v: string | number | undefined) => {
  const n = Number(v ?? 0)
  return Number.isSafeInteger(n) && n >= 0 ? n : 0
}

/** MetaApi deal → the EA's wire format, so the same trade builder handles both. Times are already UTC. */
export function mapMetaApiDeal(d: MetaApiDeal): Mt5Deal | null {
  const ticket = int(d.id)
  const type = TYPES.indexOf(d.type)
  const ms = Date.parse(d.time)
  if (!ticket || type < 0 || !Number.isFinite(ms)) return null
  return {
    ticket,
    order: int(d.orderId),
    position_id: int(d.positionId),
    time: Math.floor(ms / 1000),
    time_msc: ms,
    type,
    entry: ENTRIES[d.entryType ?? ''] ?? DEAL_ENTRY.IN,
    symbol: (d.symbol ?? '').slice(0, 40),
    volume: d.volume ?? 0,
    price: d.price ?? 0,
    profit: d.profit ?? 0,
    commission: d.commission ?? 0,
    swap: d.swap ?? 0,
    fee: 0,
    sl: d.stopLoss ?? 0,
    tp: d.takeProfit ?? 0,
    magic: Number.isSafeInteger(d.magic) ? (d.magic as number) : 0,
    comment: (d.comment ?? '').slice(0, 255),
    reason: REASONS[d.reason ?? ''],
  }
}

/** A 32-character id MetaApi uses to make account creation idempotent. */
export const isTransactionId = (s: string) => /^[A-Za-z0-9]{32}$/.test(s)
