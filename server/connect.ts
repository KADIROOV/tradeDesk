import { z } from 'zod'
import { assertOwner, signedInUser, type Handler } from './handlers.js'
import { HttpError, json, readJson } from './http.js'
import { isTransactionId } from './metaapi.js'
import { describeMetaApiError, pullPasswordAccount } from './pull.js'

const ConnectSchema = z.object({
  account_id: z.uuid(),
  login: z
    .string()
    .trim()
    .regex(/^\d{3,20}$/, 'Account number must be digits'),
  password: z.string().min(1).max(100),
  server: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(80).optional(),
  transaction_id: z.string().refine(isTransactionId, 'transaction_id must be 32 letters/digits'),
})
const AccountOnly = z.object({ account_id: z.uuid() })

/** Seconds between on-demand syncs of one account (the app polls while open). */
const PULL_THROTTLE_MS = 15_000

function requireMetaApi(deps: Parameters<Handler>[1]) {
  if (!deps.metaapi)
    throw new HttpError(503, 'Login & password connection is not configured on this deployment yet')
  return deps.metaapi
}

/**
 * POST /api/accounts/connect — attach an MT5 account by login + investor password + server.
 * The password is forwarded once to MetaApi and never stored by TradeDesk. MetaApi may
 * answer "pending" while it detects broker settings; the client retries with the same
 * transaction_id (and keeps the password only in memory for those retries).
 */
export const handleConnect: Handler = async (req, deps) => {
  const userId = await signedInUser(req, deps)
  const api = requireMetaApi(deps)
  const parsed = ConnectSchema.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const body = parsed.data
  await assertOwner(deps, body.account_id, userId)
  const acc = await deps.store.pullAccount(body.account_id)
  if (acc?.metaapi_account_id) throw new HttpError(409, 'This account is already connected')

  try {
    const r = await api.createAccount(
      {
        login: body.login,
        password: body.password,
        server: body.server,
        name: body.name ?? `TradeDesk ${body.login}`,
      },
      body.transaction_id,
    )
    if (r.kind === 'pending')
      return json(req, deps.allowedOrigins, 202, {
        ok: true,
        status: 'pending',
        retry_after: r.retryAfter,
      })
    await deps.store.updateAccount(body.account_id, {
      connection_type: 'metaapi',
      metaapi_account_id: r.id,
      connection_state: 'connecting',
      connection_error: null,
      login: Number(body.login),
      server: body.server,
    })
    return json(req, deps.allowedOrigins, 200, { ok: true, status: 'created' })
  } catch (e) {
    const d = describeMetaApiError(e)
    throw new HttpError(d.status, d.message, { error_code: d.code })
  }
}

/** POST /api/accounts/pull — sync one password-connected account now (the app calls this while open). */
export const handlePull: Handler = async (req, deps) => {
  const userId = await signedInUser(req, deps)
  const api = requireMetaApi(deps)
  const parsed = AccountOnly.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, 'Invalid body')
  await assertOwner(deps, parsed.data.account_id, userId)
  const acc = await deps.store.pullAccount(parsed.data.account_id)
  if (!acc || acc.connection_type !== 'metaapi' || !acc.metaapi_account_id)
    throw new HttpError(400, 'This account is not connected with a password')
  const now = deps.now?.() ?? new Date()
  if (
    acc.last_pull_at &&
    now.getTime() - Date.parse(acc.last_pull_at) < PULL_THROTTLE_MS &&
    acc.connection_state === 'connected'
  )
    return json(req, deps.allowedOrigins, 200, { ok: true, state: 'connected', throttled: true })
  try {
    const out = await pullPasswordAccount(deps.store, api, acc, now)
    return json(req, deps.allowedOrigins, 200, { ok: true, ...out })
  } catch (e) {
    const d = describeMetaApiError(e)
    await deps.store.updateAccount(acc.id, {
      connection_error: d.message,
      last_pull_at: now.toISOString(),
    })
    throw new HttpError(d.status, d.message, { error_code: d.code })
  }
}

/** POST /api/accounts/disconnect — stop the cloud terminal and delete the TradeDesk account. */
export const handleDisconnect: Handler = async (req, deps) => {
  const userId = await signedInUser(req, deps)
  const parsed = AccountOnly.safeParse(await readJson(req))
  if (!parsed.success) throw new HttpError(400, 'Invalid body')
  await assertOwner(deps, parsed.data.account_id, userId)
  const acc = await deps.store.pullAccount(parsed.data.account_id)
  if (acc?.metaapi_account_id) {
    const api = requireMetaApi(deps)
    try {
      await api.deleteAccount(acc.metaapi_account_id)
    } catch (e) {
      const d = describeMetaApiError(e)
      throw new HttpError(502, `Could not stop the cloud terminal: ${d.message}`)
    }
  }
  await deps.store.deleteAccount(parsed.data.account_id)
  return json(req, deps.allowedOrigins, 200, { ok: true })
}

/** GET /api/cron/pull — scheduled catch-up for every password-connected account. */
export const handleCronPull: Handler = async (req, deps) => {
  if (!deps.cronSecret || req.headers.get('authorization') !== `Bearer ${deps.cronSecret}`)
    throw new HttpError(401, 'Unauthorized')
  const api = requireMetaApi(deps)
  const accounts = await deps.store.listPasswordAccounts()
  const results: { id: string; state: string }[] = []
  const started = Date.now()
  for (const acc of accounts) {
    if (Date.now() - started > 24_000) break // stay inside the function time limit
    try {
      const out = await pullPasswordAccount(deps.store, api, acc, deps.now?.() ?? new Date())
      results.push({ id: acc.id, state: out.state })
    } catch {
      results.push({ id: acc.id, state: 'failed' })
    }
  }
  return json(req, deps.allowedOrigins, 200, { ok: true, accounts: accounts.length, results })
}
