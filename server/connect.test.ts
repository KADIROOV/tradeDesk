import { beforeEach, describe, expect, it } from 'vitest'
import { handleConnect, handleCronPull, handleDisconnect, handlePull } from './connect.js'
import { route, type Deps } from './handlers.js'
import { MemoryStore } from './memoryStore.js'
import {
  mapMetaApiDeal,
  MetaApiError,
  type CreateResult,
  type MetaApi,
  type MetaApiAccountState,
  type MetaApiDeal,
} from './metaapi.js'
import { RateLimiter } from './rateLimit.js'

const USER = '00000000-0000-4000-8000-0000000000aa'
const OTHER = '00000000-0000-4000-8000-0000000000bb'
const ORIGIN = 'https://tradezdesk.vercel.app'
const TX = 'a'.repeat(32)

function acct(store: MemoryStore, id: string) {
  const a = store.accounts.get(id)
  if (!a) throw new Error('missing account')
  return a
}

class FakeMetaApi implements MetaApi {
  pendingRounds = 0
  authError = false
  state: MetaApiAccountState = {
    state: 'DEPLOYED',
    connectionStatus: 'CONNECTED',
    region: 'london',
  }
  remoteDeals: MetaApiDeal[] = []
  deleted: string[] = []
  created: { login: string; password: string; server: string }[] = []
  async createAccount(input: {
    login: string
    password: string
    server: string
    name: string
  }): Promise<CreateResult> {
    if (this.authError) throw new MetaApiError(400, 'auth', 'E_AUTH')
    if (this.pendingRounds-- > 0) return { kind: 'pending', retryAfter: 10 }
    this.created.push(input)
    return { kind: 'created', id: 'meta-1' }
  }
  async getAccount() {
    return this.state
  }
  async accountInfo() {
    return {
      balance: 10_496,
      equity: 10_510,
      currency: 'USD',
      leverage: 500,
      login: 51234567,
      server: 'XMGlobal-MT5 7',
      investorMode: true,
    }
  }
  async deals() {
    return this.remoteDeals
  }
  async deleteAccount(id: string) {
    this.deleted.push(id)
  }
}

let store: MemoryStore
let api: FakeMetaApi
let deps: Deps
let accountId: string

const call = (
  h: typeof handleConnect,
  body: unknown,
  token = 'token-user',
  method: 'POST' | 'GET' = 'POST',
  headers: Record<string, string> = {},
) =>
  route(
    h,
    () => deps,
    [ORIGIN],
    method,
  )(
    new Request('https://x.test', {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }),
  )

const goldDeals: MetaApiDeal[] = [
  { id: '9001', type: 'DEAL_TYPE_BALANCE', time: '2026-03-01T06:00:00.000Z', profit: 10_000 },
  {
    id: '9002',
    type: 'DEAL_TYPE_BUY',
    entryType: 'DEAL_ENTRY_IN',
    time: '2026-03-02T09:00:00.000Z',
    profit: 0,
    symbol: 'GOLD',
    volume: 0.5,
    price: 2650,
    commission: -3.5,
    positionId: '501',
    orderId: '501',
    stopLoss: 2640,
  },
  {
    id: '9003',
    type: 'DEAL_TYPE_SELL',
    entryType: 'DEAL_ENTRY_OUT',
    time: '2026-03-02T09:10:00.000Z',
    profit: 500,
    symbol: 'GOLD',
    volume: 0.5,
    price: 2660,
    commission: -3.5,
    swap: -1,
    positionId: '501',
    reason: 'DEAL_REASON_TP',
  },
]

beforeEach(() => {
  store = new MemoryStore()
  api = new FakeMetaApi()
  accountId = store.addAccount(USER)
  store.tokens.set('token-user', USER)
  store.tokens.set('token-other', OTHER)
  deps = {
    store,
    pepper: 'p'.repeat(40),
    allowedOrigins: [ORIGIN],
    apiUrl: ORIGIN,
    metaapi: api,
    cronSecret: 'cron-secret',
    limits: {
      sync: new RateLimiter(100, 60_000),
      heartbeat: new RateLimiter(100, 60_000),
      user: new RateLimiter(100, 60_000),
    },
  }
})

const connectBody = {
  account_id: '',
  login: '51234567',
  password: 'investor-pass',
  server: 'XMGlobal-MT5 7',
  transaction_id: TX,
}

describe('mapMetaApiDeal', () => {
  it('maps MetaApi enums and strings to the EA wire format (UTC kept)', () => {
    const d = mapMetaApiDeal(goldDeals[2])
    expect(d).toMatchObject({
      ticket: 9003,
      position_id: 501,
      type: 1,
      entry: 1,
      symbol: 'GOLD',
      volume: 0.5,
      price: 2660,
      profit: 500,
      swap: -1,
      reason: 5,
    })
    expect(d?.time).toBe(Date.parse('2026-03-02T09:10:00.000Z') / 1000)
  })
  it('maps balance deals and rejects junk', () => {
    expect(mapMetaApiDeal(goldDeals[0])).toMatchObject({ type: 2, entry: 0, position_id: 0 })
    expect(mapMetaApiDeal({ id: 'x', type: 'DEAL_TYPE_BUY', time: 'nope', profit: 0 })).toBeNull()
    expect(
      mapMetaApiDeal({ id: '1', type: 'SOMETHING', time: '2026-01-01T00:00:00Z', profit: 0 }),
    ).toBeNull()
  })
})

describe('POST /api/accounts/connect', () => {
  it('retries while MetaApi detects broker settings, then stores only the MetaApi id', async () => {
    api.pendingRounds = 1
    const first = await call(handleConnect, { ...connectBody, account_id: accountId })
    expect(first.status).toBe(202)
    expect((await first.json()).status).toBe('pending')
    const second = await call(handleConnect, { ...connectBody, account_id: accountId })
    expect(second.status).toBe(200)
    const a = store.accounts.get(accountId)
    expect(a).toMatchObject({
      connection_type: 'metaapi',
      metaapi_account_id: 'meta-1',
      connection_state: 'connecting',
      login: 51234567,
    })
    expect(JSON.stringify(a)).not.toContain('investor-pass')
  })
  it('explains a wrong password', async () => {
    api.authError = true
    const res = await call(handleConnect, { ...connectBody, account_id: accountId })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error_code: 'auth' })
  })
  it('validates input and ownership', async () => {
    expect(
      (await call(handleConnect, { ...connectBody, account_id: accountId, login: 'abc' })).status,
    ).toBe(400)
    expect(
      (
        await call(handleConnect, {
          ...connectBody,
          account_id: accountId,
          transaction_id: 'short',
        })
      ).status,
    ).toBe(400)
    expect(
      (await call(handleConnect, { ...connectBody, account_id: accountId }, 'token-other')).status,
    ).toBe(404)
  })
  it('answers 503 when MetaApi is not configured', async () => {
    deps.metaapi = null
    expect((await call(handleConnect, { ...connectBody, account_id: accountId })).status).toBe(503)
  })
})

describe('POST /api/accounts/pull', () => {
  beforeEach(async () => {
    await call(handleConnect, { ...connectBody, account_id: accountId })
  })

  it('reports connecting while the cloud terminal starts', async () => {
    api.state = { state: 'DEPLOYING', connectionStatus: 'DISCONNECTED', region: 'london' }
    const res = await call(handlePull, { account_id: accountId })
    expect(await res.json()).toMatchObject({ state: 'connecting' })
  })

  it('imports deals into trades, balance and equity, and is idempotent', async () => {
    api.remoteDeals = goldDeals
    const res = await call(handlePull, { account_id: accountId })
    expect(await res.json()).toMatchObject({
      state: 'connected',
      newDeals: 3,
      trades: 1,
      balance: 10_496,
    })
    const [trade] = [...store.trades.values()]
    expect(trade).toMatchObject({
      symbol: 'XAUUSD',
      instrument_group: 'Gold',
      net_profit: 492,
      r_multiple: 1,
      source: 'mt5',
    })
    expect(store.accounts.get(accountId)).toMatchObject({
      balance: 10_496,
      equity: 10_510,
      connection_state: 'connected',
      investor_mode: true,
    })
    // A later pull with the same deals adds nothing (after the throttle window).
    acct(store, accountId).last_pull_at = new Date(Date.now() - 60_000).toISOString()
    const again = await call(handlePull, { account_id: accountId })
    expect(await again.json()).toMatchObject({ newDeals: 0 })
    expect(store.trades.size).toBe(1)
    expect(store.deals.size).toBe(3)
  })

  it('throttles rapid repeat pulls', async () => {
    api.remoteDeals = goldDeals
    await call(handlePull, { account_id: accountId })
    expect(await (await call(handlePull, { account_id: accountId })).json()).toMatchObject({
      throttled: true,
    })
  })

  it('flags a broker rejection after the grace period', async () => {
    acct(store, accountId).created_at = new Date(Date.now() - 10 * 60_000).toISOString()
    api.state = {
      state: 'DEPLOYED',
      connectionStatus: 'DISCONNECTED_FROM_BROKER',
      region: 'london',
    }
    const res = await call(handlePull, { account_id: accountId })
    expect(await res.json()).toMatchObject({ state: 'error' })
    expect(store.accounts.get(accountId)?.connection_state).toBe('error')
  })
})

describe('disconnect and cron', () => {
  it('disconnect stops the cloud terminal and removes the account', async () => {
    await call(handleConnect, { ...connectBody, account_id: accountId })
    const res = await call(handleDisconnect, { account_id: accountId })
    expect(res.status).toBe(200)
    expect(api.deleted).toEqual(['meta-1'])
    expect(store.accounts.has(accountId)).toBe(false)
  })
  it('cron requires the secret and syncs every password account', async () => {
    await call(handleConnect, { ...connectBody, account_id: accountId })
    api.remoteDeals = goldDeals
    expect((await call(handleCronPull, null, 'wrong', 'GET')).status).toBe(401)
    const res = await call(handleCronPull, null, 'cron-secret', 'GET')
    expect(await res.json()).toMatchObject({ accounts: 1, results: [{ state: 'connected' }] })
  })
})
