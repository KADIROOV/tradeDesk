import { formatDistanceToNowStrict } from 'date-fns'
import { useNow } from '@/lib/useNow'
import type { AccountRow } from '@/cloud/rows'
import { connectionStatus, type ConnectionStatus } from '@/cloud/status'

const LABEL: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  waiting: 'Waiting',
  offline: 'Offline',
}
const DOT: Record<ConnectionStatus, string> = {
  connected: 'bg-pos shadow-[0_0_8px_var(--pos)]',
  waiting: 'bg-accent',
  offline: 'bg-neg',
}

export function StatusDot({
  status,
  className = '',
}: {
  status: ConnectionStatus
  className?: string
}) {
  return (
    <span className={`relative inline-flex size-2 shrink-0 ${className}`} aria-hidden>
      {status === 'connected' && (
        <span className="absolute inset-0 animate-ping rounded-full bg-pos opacity-40" />
      )}
      <span className={`relative size-2 rounded-full ${DOT[status]}`} />
    </span>
  )
}

export function StatusChip({ account }: { account: AccountRow }) {
  const now = useNow()
  const status = connectionStatus(account, now)
  const seen = account.last_heartbeat_at
    ? formatDistanceToNowStrict(new Date(account.last_heartbeat_at), { addSuffix: true })
    : null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line/12 bg-line/5 px-2.5 py-1 text-xs font-medium"
      title={seen ? `Last heartbeat ${seen}` : 'No heartbeat from the EA yet'}
      role="status"
    >
      <StatusDot status={status} />
      {LABEL[status]}
      {seen && status !== 'waiting' && <span className="text-muted">· {seen}</span>}
    </span>
  )
}
