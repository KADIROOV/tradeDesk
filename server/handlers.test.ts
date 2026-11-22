import { beforeEach, describe, expect, it } from 'vitest'
import {
  handleHeartbeat,
  handleKeys,
  handleRecalculate,
  handleSync,
  route,
  type Deps,
} from './handlers.js'
import { generateSyncKey, hashSyncKey } from './keys.js'
import { MemoryStore } from './memoryStore.js'
import { RateLimiter } from './rateLimit.js'

const PEPPER = 'test-pepper-test-pepper-test-pepper-0123'
const USER = '00000000-0000-4000-8000-0000000000aa'
const OTHER = '00000000-0000-4000-8000-0000000000bb'
const ORIGIN = 'https://tradezdesk.vercel.app'

let store: MemoryStore
let deps: Deps
let accountId: string
let key: string

const snapshot = {
  login: 51234567,
  server: 'XMGlobal-MT5 7',
  currency: 'USD',
  leverage: 500,
  balance: 10492,
  equity: 10510,
}
const T = Date.UTC(2026, 2, 2, 9, 0) / 1000
const deals = [
  {
    ticket: 9001,
    order: 1,
    position_id: 0,
    time: T - 86400,
    type: 2,
    entry: 0,
    symbol: '',
    volume: 0,
    price: 0,
    profit: 10000,
    commission: 0,
    swap: 0,
    fee: 0,
    sl: 0,
    tp: 0,
    magic: 0,
    comment: 'Deposit',
  },
  {
    ticket: 9002,
    order: 2,
    position_id: 501,
    time: T,
    type: 0,
    entry: 0,
    symbol: 'GOLDm#',
    volume: 0.5,
    price: 2650,
    profit: 0,
    commission: -3.5,
    swap: 0,
    fee: 0,
    sl: 2640,
    tp: 2670,
    magic: 0,
    comment: '',
  },
  {
    ticket: 9003,
    order: 3,
    position_id: 501,
    time: T + 600,
    type: 1,
    entry: 1,
    symbol: 'GOLDm#',
    volume: 0.5,
    price: 2660,
    profit: 500,
    commission: -3.5,
    swap: -1,
    fee: 0,
    sl: 2640,
    tp: 2670,
    magic: 0,
    comment: '[tp 2660]',
  },
]

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://x.test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-key': key, ...headers },
    body: JSON.stringify(body),
  })
}
const run = (h: typeof handleSync) => route(h, () => deps, [ORIGIN])

beforeEach(async () => {
  store = new MemoryStore()
  accountId = store.addAccount(USER)
  key = generateSyncKey()
  await store.createKey(accountId, hashSyncKey(key, PEPPER), key.slice(0, 10))
  store.tokens.set('token-user', USER)
  store.tokens.set('token-other', OTHER)
  deps = {
    store,
    pepper: PEPPER,
    allowedOrigins: [ORIGIN],
    apiUrl: ORIGIN,
    limits: {
      sync: new RateLimiter(100, 60_000),
      heartbeat: new RateLimiter(100, 60_000),
      user: new RateLimiter(100, 60_000),
    },
  }
})

describe('POST /api/mt5/sync', () => {
  it('stores deals, builds trades and updates the account', async () => {
    const res = await run(handleSync)(post({ account: snapshot, deals }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      received: 3,
      stored: 3,
      duplicates: 0,
      invalid: 0,
      trades_upserted: 1,
      closed_trades: 1,
    })
    const [trade] = [...store.trades.values()]
    expect(trade).toMatchObject({
      symbol: 'XAUUSD',
      symbol_raw: 'GOLDm#',
      instrument_group: 'Gold',
      net_profit: 492,
      r_multiple: 1,
      user_id: USER,
      source: 'mt5',
    })
    const acc = store.accounts.get(accountId)
    expect(acc).toMatchObject({ login: 51234567, balance: 10492, equity: 10510 })
    expect(acc?.last_sync_at).toBeTruthy()
  })

  it('is idempotent: re-sending the same batch changes nothing and reports duplicates', async () => {
    await run(handleSync)(post({ account: snapshot, deals }))
    const before = JSON.stringify([...store.trades.values()].map(({ notes: _n, ...t }) => t))
    const res = await run(handleSync)(post({ account: snapshot, deals: [...deals, deals[1]] }))
    const body = await res.json()
    expect(body).toMatchObject({ stored: 0, duplicates: 3 })
    expect(store.deals.size).toBe(3)
    expect(store.trades.size).toBe(1)
    expect(JSON.stringify([...store.trades.values()].map(({ notes: _n, ...t }) => t))).toBe(before)
  })

  it('handles a position split across batches (open in one, close in the next)', async () => {
    await run(handleSync)(post({ account: snapshot, deals: [deals[1]] }))
    expect([...store.trades.values()][0].status).toBe('open')
    await run(handleSync)(post({ account: snapshot, deals: [deals[2]] }))
    expect([...store.trades.values()][0]).toMatchObject({ status: 'closed', net_profit: 492 })
  })

  it('keeps journal notes when the trade is rebuilt', async () => {
    await run(handleSync)(post({ account: snapshot, deals }))
    const k = [...store.trades.keys()][0]
    const t = store.trades.get(k)
    if (t) t.notes = 'textbook'
    await run(handleSync)(post({ account: snapshot, deals }))
    expect(store.trades.get(k)?.notes).toBe('textbook')
  })

  it('reports invalid items individually and still stores the valid ones', async () => {
    const res = await run(handleSync)(
      post({ account: snapshot, deals: [deals[1], { ticket: 'x' }, { ...deals[2], time: 5 }] }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: false, stored: 1, invalid: 2 })
    expect(body.results.filter((r: { status: string }) => r.status === 'invalid')).toHaveLength(2)
  })

  it('rejects unknown, malformed and revoked keys', async () => {
    expect(
      (await run(handleSync)(post({ account: snapshot, deals }, { 'x-sync-key': 'nope' }))).status,
    ).toBe(401)
    expect(
      (
        await run(handleSync)(
          post({ account: snapshot, deals }, { 'x-sync-key': generateSyncKey() }),
        )
      ).status,
    ).toBe(401)
    await store.revokeKeysForAccount(accountId, new Date().toISOString())
    const res = await run(handleSync)(post({ account: snapshot, deals }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatch(/revoked/)
  })

  it('refuses a different MT5 login on a key bound to another account', async () => {
    await run(handleSync)(post({ account: snapshot, deals }))
    const res = await run(handleSync)(post({ account: { ...snapshot, login: 999 }, deals }))
    expect(res.status).toBe(409)
  })

  it('never trusts a client-supplied user id', async () => {
    await run(handleSync)(post({ account: snapshot, deals, user_id: OTHER }))
    expect([...store.trades.values()][0].user_id).toBe(USER)
  })

  it('rejects batches over 500 deals and non-JSON bodies', async () => {
    const big = Array.from({ length: 501 }, (_, i) => ({ ...deals[1], ticket: 10000 + i }))
    expect((await run(handleSync)(post({ account: snapshot, deals: big }))).status).toBe(400)
    const bad = new Request('https://x.test', {
      method: 'POST',
      headers: { 'x-sync-key': key },
      body: '{not json',
    })
    expect((await run(handleSync)(bad)).status).toBe(400)
  })

  it('rate limits per key', async () => {
    deps.limits = {
      sync: new RateLimiter(2, 60_000),
      heartbeat: new RateLimiter(2, 60_000),
      user: new RateLimiter(2, 60_000),
    }
    await run(handleSync)(post({ account: snapshot, deals: [] }))
    await run(handleSync)(post({ account: snapshot, deals: [] }))
    const res = await run(handleSync)(post({ account: snapshot, deals: [] }))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
  })

  it('blocks browsers from other origins and answers 503 when not configured', async () => {
    expect(
      (
        await run(handleSync)(
          post({ account: snapshot, deals }, { origin: 'https://evil.example' }),
        )
      ).status,
    ).toBe(403)
    const unconfigured = route(handleSync, () => null, [ORIGIN])
    expect((await unconfigured(post({ account: snapshot, deals }))).status).toBe(503)
  })
})

describe('POST /api/mt5/heartbeat', () => {
  it('updates balance and equity and passes a one-time re-sync request to the EA', async () => {
    const a = store.accounts.get(accountId)
    if (a) a.resync_requested_at = new Date().toISOString()
    const res = await run(handleHeartbeat)(
      post({ account: { ...snapshot, equity: 10600 }, ea_version: '1.0.0' }),
    )
    expect(await res.json()).toMatchObject({ ok: true, resync: true })
    expect(store.accounts.get(accountId)).toMatchObject({
      equity: 10600,
      resync_requested_at: null,
    })
    const again = await run(handleHeartbeat)(post({ account: snapshot }))
    expect((await again.json()).resync).toBe(false)
  })
})

describe('POST /api/accounts/keys', () => {
  const authed = (body: unknown, token = 'token-user') =>
    new Request('https://x.test', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, origin: ORIGIN },
      body: JSON.stringify(body),
    })

  it('creates a key that works for sync, shown once and stored only as a hash', async () => {
    const res = await run(handleKeys)(
      authed({ action: 'create', account_id: accountId, revoke_others: true }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const body = await res.json()
    expect(body.key).toMatch(/^tdk_/)
    expect([...store.keys.values()].some((k) => k.key_hash === body.key)).toBe(false)
    key = body.key
    expect((await run(handleSync)(post({ account: snapshot, deals }))).status).toBe(200)
  })

  it('refuses other users’ accounts and missing sessions', async () => {
    expect(
      (await run(handleKeys)(authed({ action: 'create', account_id: accountId }, 'token-other')))
        .status,
    ).toBe(404)
    expect(
      (await run(handleKeys)(new Request('https://x.test', { method: 'POST', body: '{}' }))).status,
    ).toBe(401)
  })

  it('revokes a key', async () => {
    const keyId = [...store.keys.values()][0].id
    expect((await run(handleKeys)(authed({ action: 'revoke', key_id: keyId }))).status).toBe(200)
    expect((await run(handleSync)(post({ account: snapshot, deals }))).status).toBe(401)
  })
})

describe('POST /api/accounts/recalculate', () => {
  it('rebuilds trades from raw deals with the latest symbol mapping', async () => {
    await run(handleSync)(post({ account: snapshot, deals }))
    store.overrides.set(USER, { 'GOLDM#': { group: 'Other' } })
    const req = new Request('https://x.test', {
      method: 'POST',
      headers: { authorization: 'Bearer token-user' },
      body: JSON.stringify({ account_id: accountId }),
    })
    const res = await run(handleRecalculate)(req)
    expect(await res.json()).toMatchObject({ ok: true, deals: 3, trades: 1, removed: 0 })
    expect([...store.trades.values()][0].instrument_group).toBe('Other')
  })
})
