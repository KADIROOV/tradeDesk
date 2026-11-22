import type { AccountRow } from './rows'

export type ConnectionStatus = 'connected' | 'waiting' | 'offline'

/** Connected if the EA sent a heartbeat recently; Waiting if it never has; Offline otherwise. */
export function connectionStatus(
  a: Pick<AccountRow, 'last_heartbeat_at'>,
  now = Date.now(),
  graceMs = 90_000,
): ConnectionStatus {
  if (!a.last_heartbeat_at) return 'waiting'
  return now - Date.parse(a.last_heartbeat_at) <= graceMs ? 'connected' : 'offline'
}
