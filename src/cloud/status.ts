import type { AccountRow } from './rows'

export type ConnectionStatus = 'connected' | 'waiting' | 'offline'

/** Connected if the EA sent a heartbeat recently; Waiting if it never has; Offline otherwise. */
export function connectionStatus(
  a: Pick<AccountRow, 'last_heartbeat_at'> &
    Partial<Pick<AccountRow, 'connection_type' | 'connection_state'>>,
  now = Date.now(),
  graceMs = 90_000,
): ConnectionStatus {
  if (a.connection_type === 'metaapi') {
    // Password connections report their state from the cloud terminal.
    if (a.connection_state === 'connected') return 'connected'
    if (a.connection_state === 'error' || a.connection_state === 'disconnected') return 'offline'
    return 'waiting'
  }
  if (!a.last_heartbeat_at) return 'waiting'
  return now - Date.parse(a.last_heartbeat_at) <= graceMs ? 'connected' : 'offline'
}
