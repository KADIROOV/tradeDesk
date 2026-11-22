import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { APP_CONFIG } from '@/config'
import { loadBlob } from '@/lib/idb'
import type { Trade } from '@/lib/types'
import { uid } from '@/lib/format'
import { apiBase, supabase } from './client'
import {
  ACCOUNT_COLUMNS,
  KEY_COLUMNS,
  journalPatch,
  manualRow,
  rowToTrade,
  type AccountRow,
  type CashDealRow,
  type ProfileRow,
  type SyncKeyRow,
  type TradeDbRow,
} from './rows'

const OFFLINE_KEY = `${APP_CONFIG.storagePrefix}:offline`
const PAGE = 1000

export type CloudStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in'

export interface CreatedKey {
  id: string
  key: string
  key_prefix: string
  api_url: string
}

interface CloudState {
  status: CloudStatus
  /** The visitor chose to keep using the app on this device only. */
  offline: boolean
  userId: string | null
  email: string | null
  profile: ProfileRow | null
  accounts: AccountRow[]
  keys: SyncKeyRow[]
  trades: Trade[]
  cash: CashDealRow[]
  loaded: boolean
  /** Trade id → arrival time, for the "just synced" animation. */
  fresh: Record<string, number>
  error: string | null
}

const readOffline = () => {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1'
  } catch {
    return false
  }
}

export const useCloud = create<CloudState>()(() => ({
  status: supabase ? 'loading' : 'disabled',
  offline: readOffline(),
  userId: null,
  email: null,
  profile: null,
  accounts: [],
  keys: [],
  trades: [],
  cash: [],
  loaded: false,
  fresh: {},
  error: null,
}))

const set = useCloud.setState
const get = useCloud.getState

function db() {
  if (!supabase) throw new Error('Cloud sync is not configured')
  return supabase
}

function fail(e: { message: string } | null, what: string) {
  if (e) throw new Error(`${what}: ${e.message}`)
}

// ---------------------------------------------------------------- auth

let channel: RealtimeChannel | null = null
let started = false

export function initCloud() {
  if (!supabase || started) return
  started = true
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null
    const prev = get().userId
    if (!user) {
      teardown()
      set({
        status: 'signed-out',
        userId: null,
        email: null,
        profile: null,
        accounts: [],
        keys: [],
        trades: [],
        cash: [],
        loaded: false,
      })
      return
    }
    set({ status: 'signed-in', userId: user.id, email: user.email ?? null })
    if (prev !== user.id) void loadAll()
  })
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password })
  fail(error, 'Sign in failed')
}

export async function signUp(
  email: string,
  password: string,
): Promise<'signed-in' | 'confirm-email'> {
  const { data, error } = await db().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  fail(error, 'Sign up failed')
  return data.session ? 'signed-in' : 'confirm-email'
}

export async function sendMagicLink(email: string) {
  const { error } = await db().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  fail(error, 'Could not send the link')
}

export async function signOut() {
  await db().auth.signOut()
}

export function chooseOffline(offline: boolean) {
  try {
    if (offline) localStorage.setItem(OFFLINE_KEY, '1')
    else localStorage.removeItem(OFFLINE_KEY)
  } catch {
    /* private mode: the choice lasts for this tab only */
  }
  set({ offline })
}

// ---------------------------------------------------------------- loading

async function paged<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    fail(error, 'Load failed')
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

export async function loadAll() {
  const sb = db()
  const userId = get().userId
  if (!userId) return
  try {
    const [profile, accounts, keys, trades] = await Promise.all([
      sb
        .from('profiles')
        .select('user_id, display_name, timezone, settings')
        .eq('user_id', userId)
        .maybeSingle(),
      sb.from('accounts').select(ACCOUNT_COLUMNS).order('created_at'),
      sb.from('sync_keys').select(KEY_COLUMNS).order('created_at', { ascending: false }),
      paged<TradeDbRow>((from, to) =>
        sb.from('trades').select('*').order('open_time', { ascending: false }).range(from, to),
      ),
    ])
    fail(profile.error, 'Profile')
    fail(accounts.error, 'Accounts')
    fail(keys.error, 'Keys')
    set({
      profile: (profile.data as ProfileRow | null) ?? {
        user_id: userId,
        display_name: null,
        timezone: 'Asia/Tashkent',
        settings: {},
      },
      accounts: (accounts.data as AccountRow[] | null) ?? [],
      keys: (keys.data as SyncKeyRow[] | null) ?? [],
      trades: trades.map(rowToTrade),
      loaded: true,
      error: null,
    })
    void loadCash()
    subscribe(userId)
  } catch (e) {
    set({ error: e instanceof Error ? e.message : 'Could not load your data', loaded: true })
  }
}

export async function loadCash() {
  const sb = db()
  const cash = await paged<CashDealRow>((from, to) =>
    sb
      .from('deals_raw')
      .select('account_id, deal_time, deal_type, profit, commission, swap, fee')
      .order('deal_time')
      .range(from, to),
  )
  set({
    cash: cash.map((c) => ({
      ...c,
      profit: Number(c.profit),
      commission: Number(c.commission),
      swap: Number(c.swap),
      fee: Number(c.fee),
    })),
  })
}

let cashTimer = 0
function refreshCashSoon() {
  window.clearTimeout(cashTimer)
  cashTimer = window.setTimeout(() => void loadCash(), 1200)
}

function subscribe(userId: string) {
  const sb = db()
  teardown()
  channel = sb
    .channel(`tradedesk:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          if (id) set((s) => ({ trades: s.trades.filter((t) => t.id !== id) }))
          return
        }
        const t = rowToTrade(payload.new as TradeDbRow)
        set((s) => {
          const exists = s.trades.some((x) => x.id === t.id)
          const isNewlyClosed =
            !exists ||
            (s.trades.find((x) => x.id === t.id)?.status === 'open' && t.status === 'closed')
          return {
            trades: exists ? s.trades.map((x) => (x.id === t.id ? t : x)) : [t, ...s.trades],
            fresh:
              isNewlyClosed && t.source === 'mt5' ? { ...s.fresh, [t.id]: Date.now() } : s.fresh,
          }
        })
        refreshCashSoon()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }))
          return
        }
        const a = payload.new as AccountRow
        set((s) => ({
          accounts: s.accounts.some((x) => x.id === a.id)
            ? s.accounts.map((x) => (x.id === a.id ? a : x))
            : [...s.accounts, a],
        }))
      },
    )
    .subscribe()
}

function teardown() {
  if (channel && supabase) void supabase.removeChannel(channel)
  channel = null
}

// ---------------------------------------------------------------- API (server functions)

async function api<T>(path: string, body: unknown): Promise<T> {
  const { data } = await db().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Please sign in again')
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}

async function reloadKeys() {
  const { data, error } = await db()
    .from('sync_keys')
    .select(KEY_COLUMNS)
    .order('created_at', { ascending: false })
  fail(error, 'Keys')
  set({ keys: (data as SyncKeyRow[] | null) ?? [] })
}

export async function createKey(
  accountId: string,
  label?: string,
  revokeOthers = true,
): Promise<CreatedKey> {
  const r = await api<CreatedKey>('/api/accounts/keys', {
    action: 'create',
    account_id: accountId,
    label,
    revoke_others: revokeOthers,
  })
  await reloadKeys()
  return r
}

export async function revokeKey(keyId: string) {
  await api('/api/accounts/keys', { action: 'revoke', key_id: keyId })
  await reloadKeys()
}

export async function recalculate(accountId: string) {
  return api<{ deals: number; trades: number; removed: number }>('/api/accounts/recalculate', {
    account_id: accountId,
  })
}

// ---------------------------------------------------------------- accounts

export async function createAccount(input: {
  name: string
  broker: string
  starting_balance?: number | null
}): Promise<AccountRow> {
  const userId = get().userId
  if (!userId) throw new Error('Not signed in')
  const { data, error } = await db()
    .from('accounts')
    .insert({
      user_id: userId,
      name: input.name,
      broker: input.broker,
      starting_balance: input.starting_balance ?? null,
    })
    .select(ACCOUNT_COLUMNS)
    .single()
  fail(error, 'Create account')
  const row = data as AccountRow
  set((s) => ({
    accounts: s.accounts.some((a) => a.id === row.id) ? s.accounts : [...s.accounts, row],
  }))
  return row
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<AccountRow, 'name' | 'broker' | 'starting_balance' | 'resync_requested_at'>>,
) {
  const { data, error } = await db()
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .select(ACCOUNT_COLUMNS)
    .single()
  fail(error, 'Update account')
  const row = data as AccountRow
  set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? row : a)) }))
}

export async function deleteAccount(id: string) {
  const { error } = await db().from('accounts').delete().eq('id', id)
  fail(error, 'Delete account')
  set((s) => ({
    accounts: s.accounts.filter((a) => a.id !== id),
    trades: s.trades.filter((t) => t.accountId !== id),
    keys: s.keys.filter((k) => k.account_id !== id),
    cash: s.cash.filter((c) => c.account_id !== id),
  }))
}

export const requestResync = (id: string) =>
  updateAccount(id, { resync_requested_at: new Date().toISOString() })

// ---------------------------------------------------------------- trades

async function upsertLocal(row: TradeDbRow) {
  const t = rowToTrade(row)
  set((s) => ({
    trades: s.trades.some((x) => x.id === t.id)
      ? s.trades.map((x) => (x.id === t.id ? t : x))
      : [t, ...s.trades],
  }))
}

/** MT5 trades: only journal fields are written (the database enforces this too). */
export async function saveJournal(t: Trade) {
  const { data, error } = await db()
    .from('trades')
    .update(journalPatch(t))
    .eq('id', t.id)
    .select('*')
    .single()
  fail(error, 'Save')
  await upsertLocal(data as TradeDbRow)
}

export async function saveManualTrade(t: Trade, isNew: boolean) {
  const userId = get().userId
  if (!userId) throw new Error('Not signed in')
  const row = manualRow(t, userId, t.source === 'csv' ? 'csv' : 'manual')
  const q = isNew ? db().from('trades').insert(row) : db().from('trades').update(row).eq('id', t.id)
  const { data, error } = await q.select('*').single()
  fail(error, 'Save')
  await upsertLocal(data as TradeDbRow)
}

export async function deleteManualTrade(id: string) {
  const { error } = await db().from('trades').delete().eq('id', id)
  fail(error, 'Delete')
  set((s) => ({ trades: s.trades.filter((t) => t.id !== id) }))
}

export async function insertManualTrades(trades: Trade[], source: 'manual' | 'csv') {
  const userId = get().userId
  if (!userId) throw new Error('Not signed in')
  for (let i = 0; i < trades.length; i += 200) {
    const rows = trades.slice(i, i + 200).map((t) => manualRow(t, userId, source))
    const { data, error } = await db().from('trades').insert(rows).select('*')
    fail(error, 'Import')
    const mapped = ((data as TradeDbRow[] | null) ?? []).map(rowToTrade)
    set((s) => ({ trades: [...mapped, ...s.trades] }))
  }
}

// ---------------------------------------------------------------- screenshots

export async function uploadScreenshot(blob: Blob): Promise<string> {
  const userId = get().userId
  if (!userId) throw new Error('Not signed in')
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${uid()}.${ext}`
  const { error } = await db()
    .storage.from('screenshots')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg' })
  fail(error, 'Upload')
  return `sb:${path}`
}

export async function screenshotUrl(ref: string): Promise<string | null> {
  if (!ref.startsWith('sb:')) return null
  const { data, error } = await db().storage.from('screenshots').createSignedUrl(ref.slice(3), 3600)
  return error ? null : data.signedUrl
}

export async function deleteScreenshot(ref: string) {
  if (ref.startsWith('sb:'))
    await db()
      .storage.from('screenshots')
      .remove([ref.slice(3)])
}

// ---------------------------------------------------------------- profile

export async function saveProfile(patch: {
  timezone?: string
  settings?: Record<string, unknown>
}) {
  const p = get().profile
  const userId = get().userId
  if (!p || !userId) return
  const next = {
    ...p,
    ...patch,
    settings: patch.settings ? { ...p.settings, ...patch.settings } : p.settings,
  }
  set({ profile: next })
  const { error } = await db()
    .from('profiles')
    .update({ timezone: next.timezone, settings: next.settings })
    .eq('user_id', userId)
  fail(error, 'Save settings')
}

/** Copy trades kept on this device (and their screenshots) into the signed-in account. */
export async function importLocalTrades(local: Trade[]): Promise<number> {
  const prepared: Trade[] = []
  for (const t of local) {
    const refs = [...(t.screenshots ?? []), ...(t.screenshotId ? [t.screenshotId] : [])]
    const uploaded: string[] = []
    for (const ref of refs) {
      const blob = await loadBlob(ref).catch(() => undefined)
      if (blob) uploaded.push(await uploadScreenshot(blob))
    }
    prepared.push({ ...t, accountId: null, screenshots: uploaded })
  }
  await insertManualTrades(prepared, 'manual')
  await saveProfile({ settings: { localImported: true } })
  return prepared.length
}
