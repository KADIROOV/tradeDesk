import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  Copy,
  Download,
  KeyRound,
  MonitorCog,
  MousePointerClick,
  PlugZap,
  Power,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { toast } from '@/components/ui/toastStore'
import { spring } from '@/components/motion'
import { apiBase } from '@/cloud/client'
import { connectionStatus } from '@/cloud/status'
import { createAccount, createKey, useCloud, type CreatedKey } from '@/cloud/store'
import { formatCurrency, parseNum } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { StatusChip } from './StatusChip'

export function CopyField({
  label,
  value,
  mono = true,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.target.select()}
          className={`field ${mono ? 'font-mono text-xs' : ''}`}
        />
        <Button
          icon={copied ? <Check /> : <Copy />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            } catch {
              toast('Select the text and copy it manually', 'info')
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

function StepCard({
  n,
  icon,
  title,
  children,
}: {
  n: number
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-3 rounded-[var(--radius-sm)] border border-line/10 bg-line/4 p-3.5">
      <div className="flex flex-col items-center gap-1">
        <span className="grid size-8 place-items-center rounded-xl bg-accent/15 text-accent [&_svg]:size-4">
          {icon}
        </span>
        <span className="tabular text-[0.65rem] text-muted">{n}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{title}</p>
        <div className="mt-1 text-muted">{children}</div>
      </div>
    </div>
  )
}

/** A small mock of an MT5 dialog row, so the instructions read like screenshots. */
function Mock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border border-line/12 bg-canvas/60 px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-fg">
      {children}
    </div>
  )
}

const STEPS = ['Account', 'Sync key', 'Install', 'Connect'] as const

/** Create account → issue key (shown once) → XM install steps → live wait for the first heartbeat. */
export function ConnectWizard({
  accountId: existing,
  onDone,
}: {
  accountId?: string
  onDone: () => void
}) {
  const [step, setStep] = useState(existing ? 1 : 0)
  const [accountId, setAccountId] = useState<string | undefined>(existing)
  const [name, setName] = useState('XM main')
  const [broker, setBroker] = useState('XM')
  const [start, setStart] = useState('')
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<CreatedKey | null>(null)
  const account = useCloud((s) => s.accounts.find((a) => a.id === accountId))
  const now = useNow(5000)
  const host = apiBase
  const status = account ? connectionStatus(account, now) : 'waiting'

  const create = async () => {
    setBusy(true)
    try {
      const a = await createAccount({
        name: name.trim() || 'MT5 account',
        broker: broker.trim() || 'XM',
        starting_balance: parseNum(start) ?? null,
      })
      setAccountId(a.id)
      setStep(1)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the account', 'info')
    } finally {
      setBusy(false)
    }
  }
  const issue = async () => {
    if (!accountId) return
    setBusy(true)
    try {
      setKey(await createKey(accountId, 'MT5 EA', true))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create a key', 'info')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors ${i < step ? 'bg-accent text-accent-fg' : i === step ? 'border border-accent text-accent' : 'border border-line/20 text-muted'}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={`hidden text-xs sm:inline ${i === step ? 'text-fg' : 'text-muted'}`}>
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line/12" />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={spring}
          className="flex flex-col gap-4"
        >
          {step === 0 && (
            <>
              <p className="text-sm text-muted">
                One TradeDesk account per MT5 login. Your MT5 password is never needed.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name">
                  {(id) => (
                    <input
                      id={id}
                      data-autofocus
                      className="field"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                    />
                  )}
                </Field>
                <Field label="Broker">
                  {(id) => (
                    <input
                      id={id}
                      className="field"
                      value={broker}
                      onChange={(e) => setBroker(e.target.value)}
                      maxLength={60}
                    />
                  )}
                </Field>
                <Field label="Starting balance" hint="Optional. Used for return %">
                  {(id) => (
                    <input
                      id={id}
                      className="field tabular"
                      inputMode="decimal"
                      placeholder="e.g. 10000"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => void create()} disabled={busy}>
                  {busy ? 'Creating…' : 'Create account'}
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {!key ? (
                <>
                  <p className="text-sm text-muted">
                    The sync key lets the EA write to{' '}
                    <span className="text-fg">this account only</span>. It is shown once and stored
                    only as a hash. Creating a new key revokes the old one.
                  </p>
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      icon={<KeyRound />}
                      onClick={() => void issue()}
                      disabled={busy}
                    >
                      {busy ? 'Generating…' : 'Generate sync key'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <CopyField label="Sync key (shown once)" value={key.key} />
                  <CopyField label="API URL (paste into the EA's ApiUrl input)" value={host} />
                  <p className="rounded-[var(--radius-sm)] bg-accent/10 px-3 py-2 text-xs">
                    Copy the key now. If you lose it, create a new one here; the old one stops
                    working.
                  </p>
                  <div className="flex justify-end">
                    <Button variant="primary" onClick={() => setStep(2)}>
                      I copied it
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-2.5">
                <StepCard n={1} icon={<Download />} title="Install the EA">
                  Download{' '}
                  <a className="text-accent underline" href="/downloads/TradeDeskSync.ex5" download>
                    TradeDeskSync.ex5
                  </a>{' '}
                  (or the{' '}
                  <a className="text-accent underline" href="/downloads/TradeDeskSync.mq5" download>
                    source
                  </a>
                  ). In MT5: <b className="text-fg">File → Open Data Folder → MQL5 → Experts</b>,
                  paste it there, then right-click{' '}
                  <b className="text-fg">Expert Advisors → Refresh</b> in the Navigator.
                </StepCard>
                <StepCard n={2} icon={<MonitorCog />} title="Allow the web address">
                  <b className="text-fg">Tools → Options → Expert Advisors</b>
                  <Mock>
                    [x] Allow algorithmic trading
                    <br />
                    [x] Allow WebRequest for listed URL:
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;{host}
                  </Mock>
                </StepCard>
                <StepCard
                  n={3}
                  icon={<MousePointerClick />}
                  title="Attach to one chart and paste the key"
                >
                  Drag <b className="text-fg">TradeDeskSync</b> onto any single chart →{' '}
                  <b className="text-fg">Inputs</b>:
                  <Mock>
                    ApiUrl = {host}
                    <br />
                    SyncKey = {key ? `${key.key.slice(0, 12)}…` : 'tdk_…'}
                    <br />
                    HistoryDaysOnStart = 90
                  </Mock>
                </StepCard>
                <StepCard n={4} icon={<Power />} title="Turn on Algo Trading">
                  The <b className="text-fg">Algo Trading</b> toolbar button must be green. The EA
                  never trades; MT5 just needs this to run any EA. The chart corner shows
                  “TradeDesk: connected”.
                </StepCard>
              </div>
              <div className="flex justify-between">
                <Button variant="quiet" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button variant="primary" onClick={() => setStep(3)}>
                  I attached it
                </Button>
              </div>
            </>
          )}

          {step === 3 && account && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <motion.span
                className={`grid size-16 place-items-center rounded-full ${status === 'connected' ? 'bg-pos/15 text-pos' : 'bg-accent/12 text-accent'}`}
                animate={
                  status === 'connected' ? { scale: [1, 1.12, 1] } : { opacity: [0.6, 1, 0.6] }
                }
                transition={
                  status === 'connected' ? { duration: 0.5 } : { duration: 1.8, repeat: Infinity }
                }
              >
                {status === 'connected' ? (
                  <Check className="size-7" />
                ) : (
                  <PlugZap className="size-7" />
                )}
              </motion.span>
              <StatusChip account={account} />
              {status === 'connected' ? (
                <p className="text-sm">
                  Connected to <b>{account.login}</b> on {account.server}. Balance{' '}
                  <b className="tabular">{formatCurrency(Number(account.balance ?? 0))}</b>. History
                  is syncing now; trades appear in the Journal within seconds.
                </p>
              ) : (
                <p className="max-w-sm text-sm text-muted">
                  Waiting for the first heartbeat from MT5. This page updates by itself. If nothing
                  happens within a minute, check the <b className="text-fg">Experts</b> tab in MT5.
                  Most often the URL is missing from the WebRequest list.
                </p>
              )}
              <Button variant={status === 'connected' ? 'primary' : 'ghost'} onClick={onDone}>
                {status === 'connected' ? 'Done' : 'Close and keep waiting'}
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
