import { buildTrades } from '../src/lib/mt5/buildTrades.js'
import { mapSymbol } from '../src/lib/mt5/symbols.js'
import { isTradeDeal, type Mt5Deal } from '../src/lib/mt5/types.js'
import { assertOrigin, bearer, HttpError, json, readJson } from './http.js'
import type { MetaApi } from './metaapi.js'
import { generateSyncKey, hashSyncKey, isWellFormedKey, keyDisplayPrefix } from './keys.js'
import { RateLimiter } from './rateLimit.js'
import {
  DealSchema,
  HeartbeatSchema,
  KeysBodySchema,
  RecalculateSchema,
  SyncBodySchema,
  type AccountSnapshot,
} from './schemas.js'
import type { KeyRecord, SyncStore, TradeRow } from './store.js'

export interface Deps {
  store: SyncStore
  pepper: string
  allowedOrigins: string[]
  apiUrl: string
  now?: () => Date
  limits?: { sync: RateLimiter; heartbeat: RateLimiter; user: RateLimiter }
  /** MetaApi client for password connections; null when METAAPI_TOKEN is not set. */
  metaapi?: MetaApi | null
  /** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
  cronSecret?: string
}

const defaultLimits = {
  sync: new RateLimiter(30, 60_000),
  heartbeat: new RateLimiter(20, 60_000),
  user: new RateLimiter(30, 60_000),
}

export type Handler = (req: Request, deps: Deps) => Promise<Response>

/** Wraps a handler with error handling; dependencies may be null when env vars are missing. */
export function route(
  handler: Handler,
  getDeps: () => Deps | null,
  allowedFallback: string[],
  method: 'POST' | 'GET' = 'POST',
) {
  return async (req: Request): Promise<Response> => {
    const deps = getDeps()
    const allowed = deps?.allowedOrigins ?? allowedFallback
    try {
      if (!deps) throw new HttpError(503, 'Sync is not configured on this deployment yet')
      if (req.method !== method) throw new HttpError(405, `Use ${method}`)
      assertOrigin(req, allowed)
      return await handler(req, deps)
    } catch (e) {
      if (e instanceof HttpError) {
        const headers: Record<string, string> = {}
        if (typeof e.extra.retry_after === 'number')
          headers['retry-after'] = String(e.extra.retry_after)
        return json(req, allowed, e.status, { ok: false, error: e.message, ...e.extra }, headers)
      }
      console.error('[api] unexpected error', e instanceof Error ? e.message : e)
      return json(req, allowed, 500, { ok: false, error: 'Internal error' })
    }
  }
}

async function authenticateKey(req: Request, deps: Deps, limiter: RateLimiter): Promise<KeyRecord> {
  const key = (req.headers.get('x-sync-key') ?? '').trim()
  if (!isWellFormedKey(key)) throw new HttpError(401, 'Missing or malformed X-Sync-Key')
  const hash = hashSyncKey(key, deps.pepper)
  const wait = limiter.check(hash, (deps.now?.() ?? new Date()).getTime())
  if (wait) throw new HttpError(429, 'Too many requests', { retry_after: wait })
  const rec = await deps.store.findKeyByHash(hash)
  if (!rec) throw new HttpError(401, 'Unknown sync key')
  if (rec.revoked) throw new HttpError(401, 'This sync key was revoked')
  return rec
}

function assertSameAccount(rec: KeyRecord, snap: AccountSnapshot) {
  if (rec.accountLogin !== null && rec.accountLogin !== snap.login) {
    throw new HttpError(
      409,
      `This sync key belongs to MT5 account ${rec.accountLogin}, not ${snap.login}. Create a separate account in TradeDesk for each login.`,
    )
  }
}

function snapshotPatch(snap: AccountSnapshot, at: string, eaVersion?: string) {
  return {
    login: snap.login,
    server: snap.server,
    currency: snap.currency,
    leverage: snap.leverage ?? null,
    balance: snap.balance,
    equity: snap.equity,
    last_heartbeat_at: at,
    ...(eaVersion ? { ea_version: eaVersion } : {}),
  }
}

export async function rebuildPositions(
  store: SyncStore,
  userId: string,
  accountId: string,
  deals: Mt5Deal[],
): Promise<TradeRow[]> {
  const overrides = await store.symbolOverrides(userId)
  const rows: TradeRow[] = buildTrades(deals).map((t) => {
    const m = mapSymbol(t.symbol, overrides)
    return {
      ...t,
      symbol: m.canonical,
      symbol_raw: t.symbol,
      instrument_group: m.group,
      user_id: userId,
      account_id: accountId,
      source: 'mt5',
    }
  })
  if (rows.length) await store.upsertTrades(rows)
  return rows
}

type ItemResult =
  | { ticket: number; status: 'stored' | 'duplicate'; kind: 'trade' | 'cash' }
  | { index: number; ticket?: number; status: 'invalid'; error: string }

/** POST /api/mt5/sync */
export const handleSync: Handler = async (req, deps) => {
  const now = deps.now?.() ?? new Date()
  const rec = await authenticateKey(req, deps, deps.limits?.sync ?? defaultLimits.sync)
  const parsed = SyncBodySchema.safeParse(await readJson(req))
  if (!parsed.success)
    throw new HttpError(400, 'Invalid body', { issues: parsed.error.issues.slice(0, 20) })
  const body = parsed.data
  assertSameAccount(rec, body.account)

  const results: ItemResult[] = []
  const valid = new Map<number, Mt5Deal>()
  body.deals.forEach((raw, index) => {
    const r = DealSchema.safeParse(raw)
    if (!r.success) {
      const t =
        typeof raw === 'object' && raw && 'ticket' in raw && typeof raw.ticket === 'number'
          ? raw.ticket
          : undefined
      results.push({
        index,
        ticket: t,
        status: 'invalid',
        error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    } else valid.set(r.data.ticket, r.data)
  })
  const deals = [...valid.values()]
  const existing = await deps.store.existingTickets(
    rec.accountId,
    deals.map((d) => d.ticket),
  )
  if (deals.length) await deps.store.upsertDeals(rec.accountId, deals)
  for (const d of deals)
    results.push({
      ticket: d.ticket,
      status: existing.has(d.ticket) ? 'duplicate' : 'stored',
      kind: isTradeDeal(d) ? 'trade' : 'cash',
    })

  const positions = [
    ...new Set(deals.filter((d) => isTradeDeal(d) && d.position_id > 0).map((d) => d.position_id)),
  ]
  let trades: TradeRow[] = []
  if (positions.length) {
    const all = await deps.store.dealsForPositions(rec.accountId, positions)
    trades = await rebuildPositions(deps.store, rec.userId, rec.accountId, all)
  }

  const at = now.toISOString()
  await deps.store.updateAccount(rec.accountId, {
    ...snapshotPatch(body.account, at, body.ea_version),
    last_sync_at: at,
  })
  await deps.store.touchKey(rec.keyId, at)

  const stored = results.filter((r) => r.status === 'stored').length
  const duplicates = results.filter((r) => r.status === 'duplicate').length
  const invalid = results.filter((r) => r.status === 'invalid').length
  return json(req, deps.allowedOrigins, invalid && !deals.length ? 400 : 200, {
    ok: invalid === 0,
    account_id: rec.accountId,
    received: body.deals.length,
    stored,
    duplicates,
    invalid,
    trades_upserted: trades.length,
    closed_trades: trades.filter((t) => t.status === 'closed').length,
    results,
  })
}

/** POST /api/mt5/heartbeat */
export const handleHeartbeat: Handler = async (req, deps) => {
  const now = deps.now?.() ?? new Date()
  const rec = await authenticateKey(req, deps, deps.limits?.heartbeat ?? defaultLimits.heartbeat)
  const parsed = HeartbeatSchema.safeParse(await readJson(req))
  if (!parsed.success)
    throw new HttpError(400, 'Invalid body', { issues: parsed.error.issues.slice(0, 20) })
  assertSameAccount(rec, parsed.data.account)
  const at = now.toISOString()
  await deps.store.updateAccount(rec.accountId, {
    ...snapshotPatch(parsed.data.account, at, parsed.data.ea_version),
    ...(rec.resyncRequested ? { resync_requested_at: null } : {}),
  })
  await deps.store.touchKey(rec.keyId, at)
  return json(req, deps.allowedOrigins, 200, {
    ok: true,
    account_id: rec.accountId,
    server_time: at,
    resync: rec.resyncRequested,
  })
}

export async function signedInUser(req: Request, deps: Deps): Promise<string> {
  const userId = await deps.store.userFromToken(bearer(req))
  if (!userId) throw new HttpError(401, 'Session expired. Sign in again.')
  const wait = (deps.limits?.user ?? defaultLimits.user).check(
    userId,
    (deps.now?.() ?? new Date()).getTime(),
  )
  if (wait) throw new HttpError(429, 'Too many requests', { retry_after: wait })
  return userId
}

export async function assertOwner(deps: Deps, accountId: string, userId: string) {
  const owner = await deps.store.accountOwner(accountId)
  // Same response for "missing" and "not yours" so ids cannot be probed.
  if (owner !== userId) throw new HttpError(404, 'Account not found')
}

/** POST /api/accounts/keys */
export const handleKeys: Handler = async (req, deps) => {
  const userId = await signedInUser(req, deps)
  const parsed = KeysBodySchema.safeParse(await readJson(req))
  if (!parsed.success)
    throw new HttpError(400, 'Invalid body', { issues: parsed.error.issues.slice(0, 20) })
  const body = parsed.data
  const at = (deps.now?.() ?? new Date()).toISOString()
  if (body.action === 'create') {
    await assertOwner(deps, body.account_id, userId)
    if (body.revoke_others) await deps.store.revokeKeysForAccount(body.account_id, at)
    const key = generateSyncKey()
    const created = await deps.store.createKey(
      body.account_id,
      hashSyncKey(key, deps.pepper),
      keyDisplayPrefix(key),
      body.label ?? null,
    )
    return json(req, deps.allowedOrigins, 201, {
      ok: true,
      id: created.id,
      key,
      key_prefix: created.key_prefix,
      api_url: deps.apiUrl,
      note: 'This key is shown once. Store it in the EA inputs now.',
    })
  }
  const accountId = await deps.store.keyAccount(body.key_id)
  if (!accountId) throw new HttpError(404, 'Key not found')
  await assertOwner(deps, accountId, userId)
  await deps.store.revokeKey(body.key_id, at)
  return json(req, deps.allowedOrigins, 200, { ok: true, revoked: body.key_id })
}

/** POST /api/accounts/recalculate: rebuild every MT5 trade of an account from its raw deals. */
export const handleRecalculate: Handler = async (req, deps) => {
  const userId = await signedInUser(req, deps)
  const parsed = RecalculateSchema.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, 'Invalid body')
  const accountId = parsed.data.account_id
  await assertOwner(deps, accountId, userId)
  const deals = await deps.store.allDeals(accountId)
  const rows = await rebuildPositions(deps.store, userId, accountId, deals)
  const removed = await deps.store.pruneTrades(
    accountId,
    rows.map((r) => ({ position_id: r.position_id, leg: r.leg })),
  )
  return json(req, deps.allowedOrigins, 200, {
    ok: true,
    deals: deals.length,
    trades: rows.length,
    removed,
  })
}
