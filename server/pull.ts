import { isTradeDeal, type Mt5Deal } from '../src/lib/mt5/types.js'
import { rebuildPositions } from './handlers.js'
import { mapMetaApiDeal, MetaApiError, type MetaApi } from './metaapi.js'
import type { PullAccount, SyncStore } from './store.js'

const DAY = 86_400_000
/** First sync reaches this far back; later syncs overlap by a few days to catch late deals. */
export const HISTORY_DAYS = 90
const OVERLAP_DAYS = 3
/** MetaApi needs a little time to start a new terminal before it reports CONNECTED. */
const CONNECT_GRACE_MS = 5 * 60_000

export type PullOutcome =
  | { state: 'connecting' }
  | { state: 'error'; error: string }
  | { state: 'connected'; newDeals: number; trades: number; balance: number }

/**
 * Bring one password-connected (MetaApi) account up to date: check the terminal
 * connection, read balance/equity and fetch deals since the last sync. Deals go
 * through the same idempotent store + trade builder as the EA path.
 */
export async function pullPasswordAccount(
  store: SyncStore,
  api: MetaApi,
  acc: PullAccount,
  now: Date,
): Promise<PullOutcome> {
  if (acc.connection_type !== 'metaapi' || !acc.metaapi_account_id)
    return { state: 'error', error: 'This account is not connected with a password' }
  const at = now.toISOString()

  const remote = await api.getAccount(acc.metaapi_account_id)
  const region = remote.region ?? acc.metaapi_region
  if (remote.state !== 'DEPLOYED' || remote.connectionStatus !== 'CONNECTED') {
    const young = now.getTime() - Date.parse(acc.created_at) < CONNECT_GRACE_MS
    const failed = remote.state.endsWith('FAILED')
    const brokerRejected = remote.connectionStatus === 'DISCONNECTED_FROM_BROKER' && !young
    if (failed || brokerRejected) {
      const error = brokerRejected
        ? 'The broker rejected the connection. Check the account number, investor password and server.'
        : 'The cloud terminal could not start. Try reconnecting.'
      await store.updateAccount(acc.id, {
        connection_state: 'error',
        connection_error: error,
        last_pull_at: at,
        metaapi_region: region,
      })
      return { state: 'error', error }
    }
    await store.updateAccount(acc.id, {
      connection_state:
        young || acc.connection_state === 'connecting' ? 'connecting' : 'disconnected',
      last_pull_at: at,
      metaapi_region: region,
    })
    return { state: 'connecting' }
  }

  const info = await api.accountInfo(acc.metaapi_account_id, region)
  const lastDeal = acc.last_deal_time ? Date.parse(acc.last_deal_time) : NaN
  const from = new Date(
    Number.isFinite(lastDeal) ? lastDeal - OVERLAP_DAYS * DAY : now.getTime() - HISTORY_DAYS * DAY,
  )
  const to = new Date(now.getTime() + DAY)
  const deals = (await api.deals(acc.metaapi_account_id, region, from, to))
    .map(mapMetaApiDeal)
    .filter((d): d is Mt5Deal => d !== null)

  const existing = await store.existingTickets(
    acc.id,
    deals.map((d) => d.ticket),
  )
  const fresh = deals.filter((d) => !existing.has(d.ticket))
  if (deals.length) await store.upsertDeals(acc.id, deals)

  let trades = 0
  const positions = [
    ...new Set(fresh.filter((d) => isTradeDeal(d) && d.position_id > 0).map((d) => d.position_id)),
  ]
  if (positions.length) {
    const all = await store.dealsForPositions(acc.id, positions)
    trades = (await rebuildPositions(store, acc.user_id, acc.id, all)).length
  }

  const newest = deals.reduce(
    (m, d) => Math.max(m, d.time_msc ?? d.time * 1000),
    Number.isFinite(lastDeal) ? lastDeal : 0,
  )
  await store.updateAccount(acc.id, {
    login: Number(info.login) || undefined,
    server: info.server,
    currency: info.currency,
    leverage: info.leverage ?? null,
    balance: info.balance,
    equity: info.equity,
    investor_mode: typeof info.investorMode === 'boolean' ? info.investorMode : null,
    connection_state: 'connected',
    connection_error: null,
    metaapi_region: region,
    last_sync_at: at,
    last_heartbeat_at: at,
    last_pull_at: at,
    ...(newest > 0 ? { last_deal_time: new Date(newest).toISOString() } : {}),
  })
  return { state: 'connected', newDeals: fresh.length, trades, balance: info.balance }
}

export function describeMetaApiError(e: unknown): {
  status: number
  code: string
  message: string
} {
  if (e instanceof MetaApiError) {
    const messages: Record<string, string> = {
      auth: 'Wrong account number or password for this server. Use the investor (read-only) password.',
      server: 'Server not found. Pick the exact server name shown in MT5 (e.g. XMGlobal-MT5 7).',
      otp: 'This account requires a one-time password and cannot be connected this way.',
      'password-change': 'The broker requires a password change before this account can connect.',
      disabled: 'The broker reports this trading account as disabled.',
    }
    return {
      status: e.code === 'other' ? 502 : 400,
      code: e.code,
      message: messages[e.code] ?? e.message,
    }
  }
  return {
    status: 502,
    code: 'other',
    message: 'The MT5 cloud connection is not responding. Try again in a minute.',
  }
}
