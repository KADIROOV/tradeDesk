import type { BuiltTrade } from '../src/lib/mt5/buildTrades.js'
import type { SymbolOverrides, InstrumentGroup } from '../src/lib/mt5/symbols.js'
import type { Mt5Deal } from '../src/lib/mt5/types.js'

export interface KeyRecord {
  keyId: string
  accountId: string
  userId: string
  revoked: boolean
  accountLogin: number | null
  accountServer: string | null
  resyncRequested: boolean
}

export interface AccountPatch {
  login?: number
  server?: string
  currency?: string
  leverage?: number | null
  balance?: number
  equity?: number
  last_sync_at?: string
  last_heartbeat_at?: string
  ea_version?: string | null
  resync_requested_at?: null
}

export interface TradeRow extends BuiltTrade {
  user_id: string
  account_id: string
  symbol_raw: string
  instrument_group: InstrumentGroup
  source: 'mt5'
}

export interface CreatedKey {
  id: string
  key_prefix: string
}

/** Everything the API needs from the database. Production: Supabase. Tests: in memory. */
export interface SyncStore {
  findKeyByHash(hash: string): Promise<KeyRecord | null>
  touchKey(keyId: string, at: string): Promise<void>
  existingTickets(accountId: string, tickets: number[]): Promise<Set<number>>
  upsertDeals(accountId: string, deals: Mt5Deal[]): Promise<void>
  dealsForPositions(accountId: string, positionIds: number[]): Promise<Mt5Deal[]>
  allDeals(accountId: string): Promise<Mt5Deal[]>
  upsertTrades(rows: TradeRow[]): Promise<void>
  /** Delete MT5 trades of an account whose (position_id, leg) is not in `keep`. Returns count removed. */
  pruneTrades(accountId: string, keep: { position_id: number; leg: number }[]): Promise<number>
  updateAccount(accountId: string, patch: AccountPatch): Promise<void>
  symbolOverrides(userId: string): Promise<SymbolOverrides>
  userFromToken(token: string): Promise<string | null>
  accountOwner(accountId: string): Promise<string | null>
  keyAccount(keyId: string): Promise<string | null>
  createKey(
    accountId: string,
    hash: string,
    prefix: string,
    label: string | null,
  ): Promise<CreatedKey>
  revokeKey(keyId: string, at: string): Promise<void>
  revokeKeysForAccount(accountId: string, at: string): Promise<void>
}
