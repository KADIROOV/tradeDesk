import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SymbolOverrides } from '../src/lib/mt5/symbols.js'
import type { Mt5Deal } from '../src/lib/mt5/types.js'
import type { AccountPatch, CreatedKey, KeyRecord, SyncStore, TradeRow } from './store.js'

const PAGE = 1000

function check<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Server-only store using the service role key (bypasses RLS; every query is scoped explicitly). */
export class SupabaseStore implements SyncStore {
  private db: SupabaseClient
  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async findKeyByHash(hash: string): Promise<KeyRecord | null> {
    const r = await this.db
      .from('sync_keys')
      .select(
        'id, account_id, revoked_at, accounts!inner(user_id, login, server, resync_requested_at)',
      )
      .eq('key_hash', hash)
      .maybeSingle()
    const row = check(r, 'findKey')
    if (!row) return null
    const acc = (Array.isArray(row.accounts) ? row.accounts[0] : row.accounts) as {
      user_id: string
      login: number | null
      server: string | null
      resync_requested_at: string | null
    }
    return {
      keyId: row.id as string,
      accountId: row.account_id as string,
      userId: acc.user_id,
      revoked: row.revoked_at !== null,
      accountLogin: acc.login === null ? null : Number(acc.login),
      accountServer: acc.server,
      resyncRequested: acc.resync_requested_at !== null,
    }
  }

  async touchKey(keyId: string, at: string) {
    check(await this.db.from('sync_keys').update({ last_used_at: at }).eq('id', keyId), 'touchKey')
  }

  async existingTickets(accountId: string, tickets: number[]) {
    const found = new Set<number>()
    for (const part of chunks(tickets, 200)) {
      const r = await this.db
        .from('deals_raw')
        .select('deal_ticket')
        .eq('account_id', accountId)
        .in('deal_ticket', part)
      for (const row of check(r, 'existingTickets') ?? []) found.add(Number(row.deal_ticket))
    }
    return found
  }

  async upsertDeals(accountId: string, deals: Mt5Deal[]) {
    const rows = deals.map((d) => ({
      account_id: accountId,
      deal_ticket: d.ticket,
      position_id: d.position_id,
      deal_time: new Date(d.time_msc ?? d.time * 1000).toISOString(),
      deal_type: d.type,
      entry: d.entry,
      profit: d.profit,
      commission: d.commission,
      swap: d.swap,
      fee: d.fee,
      payload: d,
    }))
    for (const part of chunks(rows, 250))
      check(
        await this.db.from('deals_raw').upsert(part, { onConflict: 'account_id,deal_ticket' }),
        'upsertDeals',
      )
  }

  private async pagedDeals(
    build: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: { payload: Mt5Deal }[] | null; error: { message: string } | null }>,
  ) {
    const out: Mt5Deal[] = []
    for (let from = 0; ; from += PAGE) {
      const rows = check(await build(from, from + PAGE - 1), 'deals') ?? []
      out.push(...rows.map((r) => r.payload))
      if (rows.length < PAGE) break
    }
    return out
  }

  async dealsForPositions(accountId: string, positionIds: number[]) {
    const out: Mt5Deal[] = []
    for (const part of chunks(positionIds, 200)) {
      out.push(
        ...(await this.pagedDeals((from, to) =>
          this.db
            .from('deals_raw')
            .select('payload')
            .eq('account_id', accountId)
            .in('position_id', part)
            .order('deal_ticket')
            .range(from, to),
        )),
      )
    }
    return out
  }

  allDeals(accountId: string) {
    return this.pagedDeals((from, to) =>
      this.db
        .from('deals_raw')
        .select('payload')
        .eq('account_id', accountId)
        .order('deal_ticket')
        .range(from, to),
    )
  }

  async upsertTrades(rows: TradeRow[]) {
    // Only broker-owned columns are sent, so journal fields (notes, tags, â€¦) survive re-syncs.
    const payload = rows.map((t) => ({
      user_id: t.user_id,
      account_id: t.account_id,
      position_id: t.position_id,
      leg: t.leg,
      ticket_in: t.ticket_in,
      ticket_out: t.ticket_out,
      symbol: t.symbol,
      symbol_raw: t.symbol_raw,
      instrument_group: t.instrument_group,
      direction: t.direction,
      status: t.status,
      volume: t.volume,
      closed_volume: t.closed_volume,
      open_time: t.open_time,
      close_time: t.close_time,
      open_price: t.open_price,
      close_price: t.close_price,
      sl: t.initial_sl,
      tp: t.tp,
      commission: t.commission,
      swap: t.swap,
      fee: t.fee,
      gross_profit: t.gross_profit,
      net_profit: t.net_profit,
      r_multiple: t.r_multiple,
      magic: t.magic,
      comment: t.comment.slice(0, 255),
      history_complete: t.history_complete,
      source: 'mt5',
    }))
    for (const part of chunks(payload, 250))
      check(
        await this.db.from('trades').upsert(part, { onConflict: 'account_id,position_id,leg' }),
        'upsertTrades',
      )
  }

  async pruneTrades(accountId: string, keep: { position_id: number; leg: number }[]) {
    const keepSet = new Set(keep.map((k) => `${k.position_id}:${k.leg}`))
    const rows =
      check(
        await this.db
          .from('trades')
          .select('id, position_id, leg')
          .eq('account_id', accountId)
          .eq('source', 'mt5'),
        'pruneTrades',
      ) ?? []
    const stale = rows
      .filter((r) => !keepSet.has(`${Number(r.position_id)}:${Number(r.leg)}`))
      .map((r) => r.id as string)
    for (const part of chunks(stale, 200))
      check(await this.db.from('trades').delete().in('id', part), 'pruneTrades')
    return stale.length
  }

  async updateAccount(accountId: string, patch: AccountPatch) {
    check(await this.db.from('accounts').update(patch).eq('id', accountId), 'updateAccount')
  }

  async symbolOverrides(userId: string): Promise<SymbolOverrides> {
    const row = check(
      await this.db.from('profiles').select('settings').eq('user_id', userId).maybeSingle(),
      'profile',
    )
    const map = (row?.settings as { symbolMap?: unknown } | null)?.symbolMap
    return map && typeof map === 'object' && !Array.isArray(map) ? (map as SymbolOverrides) : {}
  }

  async userFromToken(token: string) {
    const r = await this.db.auth.getUser(token)
    return r.error || !r.data.user ? null : r.data.user.id
  }

  async accountOwner(accountId: string) {
    const row = check(
      await this.db.from('accounts').select('user_id').eq('id', accountId).maybeSingle(),
      'accountOwner',
    )
    return (row?.user_id as string | undefined) ?? null
  }

  async keyAccount(keyId: string) {
    const row = check(
      await this.db.from('sync_keys').select('account_id').eq('id', keyId).maybeSingle(),
      'keyAccount',
    )
    return (row?.account_id as string | undefined) ?? null
  }

  async createKey(
    accountId: string,
    hash: string,
    prefix: string,
    label: string | null,
  ): Promise<CreatedKey> {
    const row = check(
      await this.db
        .from('sync_keys')
        .insert({ account_id: accountId, key_hash: hash, key_prefix: prefix, label })
        .select('id, key_prefix')
        .single(),
      'createKey',
    )
    if (!row) throw new Error('createKey: no row returned')
    return { id: row.id as string, key_prefix: row.key_prefix as string }
  }

  async revokeKey(keyId: string, at: string) {
    check(
      await this.db
        .from('sync_keys')
        .update({ revoked_at: at })
        .eq('id', keyId)
        .is('revoked_at', null),
      'revokeKey',
    )
  }

  async revokeKeysForAccount(accountId: string, at: string) {
    check(
      await this.db
        .from('sync_keys')
        .update({ revoked_at: at })
        .eq('account_id', accountId)
        .is('revoked_at', null),
      'revokeKeys',
    )
  }
}
