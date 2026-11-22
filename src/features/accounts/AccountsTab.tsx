import { dateLocale, tr } from '@/i18n'
import { formatDistanceToNowStrict } from 'date-fns'
import { Calculator, Cpu, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/controls'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toastStore'
import { cloudEnabled } from '@/cloud/client'
import type { AccountRow } from '@/cloud/rows'
import {
  pullNow,
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
import { PasswordConnect } from './PasswordConnect'
import { StatusChip } from './StatusChip'

export function CloudRequired() {
  const signedOut = useCloud((s) => s.status === 'signed-out')
  return (
    <EmptyState
      icon={<KeyRound />}
      title={cloudEnabled ? tr('acc.signInTitle') : tr('acc.notSetUpTitle')}
      body={cloudEnabled ? tr('acc.signInBody') : tr('acc.notSetUpBody')}
      action={
        cloudEnabled && signedOut ? (
          <Button variant="primary" onClick={() => chooseOffline(false)}>
            {tr('acc.signInBtn')}
          </Button>
        ) : undefined
      }
    />
  )
}

function ago(iso: string | null) {
  return iso
    ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: dateLocale() })
    : tr('common.never')
}

function AccountCard({ a, onNewKey }: { a: AccountRow; onNewKey: () => void }) {
  const allKeys = useCloud((s) => s.keys)
  const keys = useMemo(() => allKeys.filter((k) => k.account_id === a.id), [allKeys, a.id])
  const trades = useCloud((s) => s.trades.filter((t) => t.accountId === a.id).length)
  const [name, setName] = useState(a.name)
  const [start, setStart] = useState(a.starting_balance === null ? '' : String(a.starting_balance))
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pw = a.connection_type === 'metaapi'

  const run = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(what)
    try {
      await fn()
      toast(done)
    } catch (e) {
      toast(e instanceof Error ? e.message : tr('common.somethingWrong'), 'info')
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
            aria-label={tr('acc.name')}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() &&
              name !== a.name &&
              void run('name', () => updateAccount(a.id, { name: name.trim() }), tr('acc.renamed'))
            }
          />
          <p className="text-xs text-muted">
            {a.broker}
            {a.login ? ` · ${a.login} · ${a.server}` : ` · ${tr('acct.notConnected')}`}
            {' · '}
            {pw
              ? tr('acc.viaPassword')
              : `${tr('acc.viaEa')}${a.ea_version ? ` ${a.ea_version}` : ''}`}
          </p>
        </div>
        <StatusChip account={a} />
      </div>
      {pw && a.connection_state === 'error' && a.connection_error && (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-sm)] bg-neg/10 px-3 py-2 text-xs text-neg"
        >
          {a.connection_error}
        </p>
      )}
      {pw && a.investor_mode === false && (
        <p className="mt-3 rounded-[var(--radius-sm)] bg-accent/10 px-3 py-2 text-xs">
          {tr('acc.masterWarning')}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="label">{tr('dash.balance')}</dt>
          <dd className="tabular font-semibold">
            {a.balance === null ? '—' : formatCurrency(Number(a.balance))}
          </dd>
        </div>
        <div>
          <dt className="label">{tr('dash.equity')}</dt>
          <dd className="tabular font-semibold">
            {a.equity === null ? '—' : formatCurrency(Number(a.equity))}
          </dd>
        </div>
        <div>
          <dt className="label">{tr('acc.lastSync')}</dt>
          <dd>{ago(a.last_sync_at)}</dd>
        </div>
        <div>
          <dt className="label">{tr('acc.trades')}</dt>
          <dd className="tabular">{trades}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label">{tr('dash.startingBalance')}</span>
          <input
            className="field h-9 w-36 tabular"
            inputMode="decimal"
            placeholder={tr('acc.auto')}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={() => {
              const v = parseNum(start) ?? null
              if (v !== (a.starting_balance === null ? null : Number(a.starting_balance)))
                void run(
                  'start',
                  () => updateAccount(a.id, { starting_balance: v }),
                  tr('acc.startSaved'),
                )
            }}
          />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          {pw ? (
            <Button
              size="sm"
              icon={<RefreshCw />}
              disabled={busy !== null}
              onClick={() =>
                void run(
                  'pull',
                  () =>
                    pullNow(a.id).then(
                      (r) =>
                        r.state === 'connected' &&
                        toast(tr('acc.syncDone', { n: r.newDeals ?? 0 })),
                    ),
                  tr('acc.syncNow'),
                )
              }
            >
              {tr('acc.syncNow')}
            </Button>
          ) : (
            <Button
              size="sm"
              icon={<RefreshCw />}
              disabled={busy !== null}
              onClick={() => void run('resync', () => requestResync(a.id), tr('acc.resyncDone'))}
            >
              {tr('acc.resync')}
            </Button>
          )}
          <Button
            size="sm"
            icon={<Calculator />}
            disabled={busy !== null}
            onClick={() =>
              void run(
                'recalc',
                () =>
                  recalculate(a.id).then((r) =>
                    toast(tr('acc.recalcDone', { trades: r.trades, deals: r.deals })),
                  ),
                tr('acc.recalculated'),
              )
            }
          >
            {busy === 'recalc' ? tr('acc.recalculating') : tr('acc.recalc')}
          </Button>
          {!pw && (
            <Button size="sm" icon={<KeyRound />} onClick={onNewKey}>
              {tr('acc.newKeyBtn')}
            </Button>
          )}
          <Button
            size="sm"
            variant="quiet"
            icon={<Trash2 />}
            onClick={() => setConfirmDelete(true)}
          >
            {tr('common.delete')}
          </Button>
        </div>
      </div>

      {!pw && keys.length > 0 && (
        <ul className="mt-4 divide-hairline border-t hairline text-xs">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2">
              <code className="font-mono">{k.key_prefix}…</code>
              <span className="text-muted">
                {tr('acc.created', { t: ago(k.created_at), u: ago(k.last_used_at) })}
              </span>
              {k.revoked_at ? (
                <span className="ml-auto text-neg">{tr('acc.revoked')}</span>
              ) : (
                <button
                  type="button"
                  className="ml-auto text-muted underline-offset-2 hover:text-neg hover:underline"
                  onClick={() => void run('revoke', () => revokeKey(k.id), tr('acc.keyRevoked'))}
                >
                  {tr('acc.revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={tr('acc.deleteTitle', { name: a.name })}
        description={tr('acc.deleteBody')}
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
            {tr('acc.keepIt')}
          </Button>
          <Button
            variant="danger"
            onClick={() => void run('delete', () => deleteAccount(a.id), tr('acc.deleted'))}
          >
            {tr('acc.deleteBtn')}
          </Button>
        </div>
      </Modal>
    </article>
  )
}

export function AccountsTab() {
  const status = useCloud((s) => s.status)
  const accounts = useCloud((s) => s.accounts)
  const [wizard, setWizard] = useState<{ accountId?: string; method?: 'password' | 'ea' } | null>(
    null,
  )
  if (status !== 'signed-in') return <CloudRequired />
  if (wizard && !wizard.accountId && !wizard.method)
    return (
      <section>
        <h3 className="mb-4 text-base font-semibold tracking-tight">{tr('wiz.methodTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setWizard({ method: 'password' })}
            className="lift relative flex flex-col gap-2 rounded-[var(--radius-sm)] border border-accent/50 bg-accent/5 p-4 text-left"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
                <KeyRound className="size-4" />
              </span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] font-semibold text-accent">
                {tr('wiz.recommended')}
              </span>
            </span>
            <span className="font-semibold">{tr('wiz.methodPassword')}</span>
            <span className="text-sm text-muted">{tr('wiz.methodPasswordBody')}</span>
          </button>
          <button
            type="button"
            onClick={() => setWizard({ method: 'ea' })}
            className="lift relative flex flex-col gap-2 rounded-[var(--radius-sm)] border border-line/10 p-4 text-left hover:border-line/25"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-line/8 text-muted">
              <Cpu className="size-4" />
            </span>
            <span className="font-semibold">{tr('wiz.methodEa')}</span>
            <span className="text-sm text-muted">{tr('wiz.methodEaBody')}</span>
          </button>
        </div>
        <div className="mt-4 flex justify-start">
          <Button variant="quiet" onClick={() => setWizard(null)}>
            {tr('common.back')}
          </Button>
        </div>
      </section>
    )
  if (wizard)
    return (
      <section>
        <h3 className="mb-4 text-base font-semibold tracking-tight">
          {wizard.accountId
            ? tr('acc.newKey')
            : wizard.method === 'password'
              ? tr('wiz.methodPassword')
              : tr('wiz.methodEa')}
        </h3>
        {wizard.method === 'password' ? (
          <PasswordConnect onDone={() => setWizard(null)} />
        ) : (
          <ConnectWizard accountId={wizard.accountId} onDone={() => setWizard(null)} />
        )}
      </section>
    )
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{tr('acc.title')}</h3>
          <p className="text-sm text-muted">{tr('acc.subtitle')}</p>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setWizard({})}>
          {tr('acc.connect')}
        </Button>
      </div>
      {accounts.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title={tr('acc.noneTitle')}
          body={tr('acc.noneBody')}
          action={
            <Button variant="primary" onClick={() => setWizard({})}>
              {tr('acc.connect')}
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
