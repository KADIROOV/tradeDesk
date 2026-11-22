import { formatDistanceToNowStrict } from 'date-fns'
import { Calculator, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/controls'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toastStore'
import { cloudEnabled } from '@/cloud/client'
import type { AccountRow } from '@/cloud/rows'
import {
  chooseOffline,
  deleteAccount,
  recalculate,
  requestResync,
  revokeKey,
  updateAccount,
  useCloud,
} from '@/cloud/store'
import { formatCurrency, parseNum } from '@/lib/format'
import { ConnectWizard } from './ConnectWizard'
import { StatusChip } from './StatusChip'

export function CloudRequired() {
  const signedOut = useCloud((s) => s.status === 'signed-out')
  return (
    <EmptyState
      icon={<KeyRound />}
      title={cloudEnabled ? 'Sign in to connect MT5' : 'Sync is not set up on this site'}
      body={
        cloudEnabled
          ? 'Accounts, automatic MT5 sync and cross-device settings need an account. Your on-device journal keeps working either way.'
          : 'The site owner has not configured Supabase yet. Everything else works on this device.'
      }
      action={
        cloudEnabled && signedOut ? (
          <Button variant="primary" onClick={() => chooseOffline(false)}>
            Sign in or create account
          </Button>
        ) : undefined
      }
    />
  )
}

function ago(iso: string | null) {
  return iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : 'never'
}

function AccountCard({ a, onNewKey }: { a: AccountRow; onNewKey: () => void }) {
  const allKeys = useCloud((s) => s.keys)
  const keys = useMemo(() => allKeys.filter((k) => k.account_id === a.id), [allKeys, a.id])
  const trades = useCloud((s) => s.trades.filter((t) => t.accountId === a.id).length)
  const [name, setName] = useState(a.name)
  const [start, setStart] = useState(a.starting_balance === null ? '' : String(a.starting_balance))
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const run = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(what)
    try {
      await fn()
      toast(done)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', 'info')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="rounded-[var(--radius-sm)] border border-line/10 bg-line/4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <input
            className="w-full rounded-md bg-transparent text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={name}
            aria-label="Account name"
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() &&
              name !== a.name &&
              void run('name', () => updateAccount(a.id, { name: name.trim() }), 'Renamed')
            }
          />
          <p className="text-xs text-muted">
            {a.broker}
            {a.login ? ` · ${a.login} · ${a.server}` : ' · not connected yet'}
            {a.ea_version ? ` · EA ${a.ea_version}` : ''}
          </p>
        </div>
        <StatusChip account={a} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="label">Balance</dt>
          <dd className="tabular font-semibold">
            {a.balance === null ? '—' : formatCurrency(Number(a.balance))}
          </dd>
        </div>
        <div>
          <dt className="label">Equity</dt>
          <dd className="tabular font-semibold">
            {a.equity === null ? '—' : formatCurrency(Number(a.equity))}
          </dd>
        </div>
        <div>
          <dt className="label">Last sync</dt>
          <dd>{ago(a.last_sync_at)}</dd>
        </div>
        <div>
          <dt className="label">Trades</dt>
          <dd className="tabular">{trades}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label">Starting balance</span>
          <input
            className="field h-9 w-36 tabular"
            inputMode="decimal"
            placeholder="Auto"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={() => {
              const v = parseNum(start) ?? null
              if (v !== (a.starting_balance === null ? null : Number(a.starting_balance)))
                void run(
                  'start',
                  () => updateAccount(a.id, { starting_balance: v }),
                  'Starting balance saved',
                )
            }}
          />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<RefreshCw />}
            disabled={busy !== null}
            onClick={() =>
              void run(
                'resync',
                () => requestResync(a.id),
                'Re-sync requested. The EA re-sends history on its next heartbeat.',
              )
            }
          >
            Re-sync from MT5
          </Button>
          <Button
            size="sm"
            icon={<Calculator />}
            disabled={busy !== null}
            onClick={() =>
              void run(
                'recalc',
                () =>
                  recalculate(a.id).then((r) =>
                    toast(`Rebuilt ${r.trades} trades from ${r.deals} deals`),
                  ),
                'Recalculated',
              )
            }
          >
            {busy === 'recalc' ? 'Recalculating…' : 'Recalculate'}
          </Button>
          <Button size="sm" icon={<KeyRound />} onClick={onNewKey}>
            New key
          </Button>
          <Button
            size="sm"
            variant="quiet"
            icon={<Trash2 />}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {keys.length > 0 && (
        <ul className="mt-4 divide-hairline border-t hairline text-xs">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2">
              <code className="font-mono">{k.key_prefix}…</code>
              <span className="text-muted">
                created {ago(k.created_at)} · used {ago(k.last_used_at)}
              </span>
              {k.revoked_at ? (
                <span className="ml-auto text-neg">revoked</span>
              ) : (
                <button
                  type="button"
                  className="ml-auto text-muted underline-offset-2 hover:text-neg hover:underline"
                  onClick={() => void run('revoke', () => revokeKey(k.id), 'Key revoked')}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${a.name}?`}
        description="Its synced trades, raw deals and keys are removed. Manual trades are kept. The EA stops working until you connect again."
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => void run('delete', () => deleteAccount(a.id), 'Account deleted')}
          >
            Delete account
          </Button>
        </div>
      </Modal>
    </article>
  )
}

export function AccountsTab() {
  const status = useCloud((s) => s.status)
  const accounts = useCloud((s) => s.accounts)
  const [wizard, setWizard] = useState<{ accountId?: string } | null>(null)
  if (status !== 'signed-in') return <CloudRequired />
  if (wizard)
    return (
      <section>
        <h3 className="mb-4 text-base font-semibold tracking-tight">
          {wizard.accountId ? 'New sync key' : 'Connect MT5'}
        </h3>
        <ConnectWizard accountId={wizard.accountId} onDone={() => setWizard(null)} />
      </section>
    )
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">MT5 accounts</h3>
          <p className="text-sm text-muted">
            Closed trades, balance and equity sync automatically from the TradeDeskSync EA.
          </p>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setWizard({})}>
          Connect MT5
        </Button>
      </div>
      {accounts.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title="No MT5 account yet"
          body="Connect your XM account in about two minutes. Trades then appear here on their own."
          action={
            <Button variant="primary" onClick={() => setWizard({})}>
              Connect MT5
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} a={a} onNewKey={() => setWizard({ accountId: a.id })} />
          ))}
        </div>
      )}
    </section>
  )
}
