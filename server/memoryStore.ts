import { randomUUID } from 'node:crypto'
import type { SymbolOverrides } from '../src/lib/mt5/symbols.js'
import type { Mt5Deal } from '../src/lib/mt5/types.js'
import type {
  AccountPatch,
  CreatedKey,
  KeyRecord,
  PullAccount,
  SyncStore,
  TradeRow,
} from './store.js'

interface Account {
  id: string
  user_id: string
  login: number | null
  server: string | null
  resync_requested_at: string | null
  balance?: number
  equity?: number
  last_sync_at?: string
  last_heartbeat_at?: string
  [k: string]: unknown
}

/** In-memory SyncStore with the same semantics as the Supabase one. Used by tests and scripts. */
export class MemoryStore implements SyncStore {
  accounts = new Map<string, Account>()
  keys = new Map<
    string,
    {
      id: string
      account_id: string
      key_hash: string
      key_prefix: string
      revoked_at: string | null
      last_used_at: string | null
    }
  >()
  deals = new Map<string, Mt5Deal>() // `${account}:${ticket}`
  trades = new Map<string, TradeRow & { notes?: string }>() // `${account}:${position}:${leg}`
  tokens = new Map<string, string>()
  overrides = new Map<string, SymbolOverrides>()

  addAccount(userId: string, extra: Partial<Account> = {}): string {
    const id = randomUUID()
    this.accounts.set(id, {
      id,
      user_id: userId,
      login: null,
      server: null,
      resync_requested_at: null,
      connection_type: 'ea',
      metaapi_account_id: null,
      metaapi_region: null,
      connection_state: null,
      last_pull_at: null,
      last_deal_time: null,
      created_at: new Date().toISOString(),
      ...extra,
    })
    return id
  }

  private asPull(a: Account): PullAccount {
    return {
      id: a.id,
      user_id: a.user_id,
      connection_type: a.connection_type === 'metaapi' ? 'metaapi' : 'ea',
      metaapi_account_id: (a.metaapi_account_id as string | null) ?? null,
      metaapi_region: (a.metaapi_region as string | null) ?? null,
      connection_state: (a.connection_state as string | null) ?? null,
      last_pull_at: (a.last_pull_at as string | null) ?? null,
      last_deal_time: (a.last_deal_time as string | null) ?? null,
      created_at: (a.created_at as string | undefined) ?? new Date(0).toISOString(),
    }
  }
  async pullAccount(accountId: string) {
    const a = this.accounts.get(accountId)
    return a ? this.asPull(a) : null
  }
  async listPasswordAccounts() {
    return [...this.accounts.values()]
      .filter((a) => a.connection_type === 'metaapi' && a.metaapi_account_id)
      .map((a) => this.asPull(a))
  }
  async deleteAccount(accountId: string) {
    this.accounts.delete(accountId)
    for (const k of [...this.deals.keys()]) if (k.startsWith(`${accountId}:`)) this.deals.delete(k)
    for (const k of [...this.trades.keys()])
      if (k.startsWith(`${accountId}:`)) this.trades.delete(k)
    for (const [id, key] of this.keys) if (key.account_id === accountId) this.keys.delete(id)
  }

  async findKeyByHash(hash: string): Promise<KeyRecord | null> {
    const k = [...this.keys.values()].find((x) => x.key_hash === hash)
    if (!k) return null
    const a = this.accounts.get(k.account_id)
    if (!a) return null
    return {
      keyId: k.id,
      accountId: a.id,
      userId: a.user_id,
      revoked: k.revoked_at !== null,
      accountLogin: a.login,
      accountServer: a.server,
      resyncRequested: a.resync_requested_at !== null,
    }
  }
  async touchKey(keyId: string, at: string) {
    const k = this.keys.get(keyId)
    if (k) k.last_used_at = at
  }
  async existingTickets(accountId: string, tickets: number[]) {
    return new Set(tickets.filter((t) => this.deals.has(`${accountId}:${t}`)))
  }
  async upsertDeals(accountId: string, deals: Mt5Deal[]) {
    for (const d of deals) this.deals.set(`${accountId}:${d.ticket}`, d)
  }
  async dealsForPositions(accountId: string, positionIds: number[]) {
    const set = new Set(positionIds)
    return [...this.deals.entries()]
      .filter(([k, d]) => k.startsWith(`${accountId}:`) && set.has(d.position_id))
      .map(([, d]) => d)
  }
  async allDeals(accountId: string) {
    return [...this.deals.entries()]
      .filter(([k]) => k.startsWith(`${accountId}:`))
      .map(([, d]) => d)
  }
  async upsertTrades(rows: TradeRow[]) {
    for (const r of rows) {
      const key = `${r.account_id}:${r.position_id}:${r.leg}`
      const prev = this.trades.get(key)
      this.trades.set(key, { ...r, notes: prev?.notes })
    }
  }
  async pruneTrades(accountId: string, keep: { position_id: number; leg: number }[]) {
    const keepSet = new Set(keep.map((k) => `${accountId}:${k.position_id}:${k.leg}`))
    let n = 0
    for (const k of [...this.trades.keys()])
      if (k.startsWith(`${accountId}:`) && !keepSet.has(k)) {
        this.trades.delete(k)
        n++
      }
    return n
  }
  async updateAccount(accountId: string, patch: AccountPatch) {
    const a = this.accounts.get(accountId)
    if (a) Object.assign(a, patch)
  }
  async symbolOverrides(userId: string) {
    return this.overrides.get(userId) ?? {}
  }
  async userFromToken(token: string) {
    return this.tokens.get(token) ?? null
  }
  async accountOwner(accountId: string) {
    return this.accounts.get(accountId)?.user_id ?? null
  }
  async keyAccount(keyId: string) {
    return this.keys.get(keyId)?.account_id ?? null
  }
  async createKey(accountId: string, hash: string, prefix: string): Promise<CreatedKey> {
    const id = randomUUID()
    this.keys.set(id, {
      id,
      account_id: accountId,
      key_hash: hash,
      key_prefix: prefix,
      revoked_at: null,
      last_used_at: null,
    })
    return { id, key_prefix: prefix }
  }
  async revokeKey(keyId: string, at: string) {
    const k = this.keys.get(keyId)
    if (k && !k.revoked_at) k.revoked_at = at
  }
  async revokeKeysForAccount(accountId: string, at: string) {
    for (const k of this.keys.values())
      if (k.account_id === accountId && !k.revoked_at) k.revoked_at = at
  }
}
