import { tr } from '@/i18n'
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
              toast(tr('wiz.copyManual'), 'info')
            }
          }}
        >
          {copied ? tr('common.copied') : tr('common.copy')}
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

const STEPS = ['wiz.account', 'wiz.key', 'wiz.install', 'wiz.connect'] as const

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
      toast(e instanceof Error ? e.message : tr('wiz.createFailed'), 'info')
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
      toast(e instanceof Error ? e.message : tr('wiz.keyFailed'), 'info')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex items-center gap-2" aria-label={tr('wiz.progress')}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors ${i < step ? 'bg-accent text-accent-fg' : i === step ? 'border border-accent text-accent' : 'border border-line/20 text-muted'}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={`hidden text-xs sm:inline ${i === step ? 'text-fg' : 'text-muted'}`}>
              {tr(s)}
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
              <p className="text-sm text-muted">{tr('wiz.intro')}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={tr('wiz.name')}>
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
                <Field label={tr('wiz.broker')}>
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
                <Field label={tr('dash.startingBalance')} hint={tr('wiz.startHint')}>
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
                  {busy ? tr('wiz.creating') : tr('wiz.createAccount')}
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              {!key ? (
                <>
                  <p className="text-sm text-muted">{tr('wiz.keyIntro')}</p>
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      icon={<KeyRound />}
                      onClick={() => void issue()}
                      disabled={busy}
                    >
                      {busy ? tr('wiz.generating') : tr('wiz.generate')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <CopyField label={tr('wiz.keyLabel')} value={key.key} />
                  <CopyField label={tr('wiz.urlLabel')} value={host} />
                  <p className="rounded-[var(--radius-sm)] bg-accent/10 px-3 py-2 text-xs">
                    {tr('wiz.copyNow')}
                  </p>
                  <div className="flex justify-end">
                    <Button variant="primary" onClick={() => setStep(2)}>
                      {tr('wiz.copiedIt')}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-2.5">
                <StepCard n={1} icon={<Download />} title={tr('wiz.step1')}>
                  {tr('wiz.step1Body')}
                  <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    <a
                      className="text-accent underline"
                      href="/downloads/TradeDeskSync.ex5"
                      download
                    >
                      {tr('wiz.downloadEx5')}
                    </a>
                    <a
                      className="text-accent underline"
                      href="/downloads/TradeDeskSync.mq5"
                      download
                    >
                      {tr('wiz.downloadSrc')}
                    </a>
                  </span>
                </StepCard>
                <StepCard n={2} icon={<MonitorCog />} title={tr('wiz.step2')}>
                  <b className="text-fg">Tools → Options → Expert Advisors</b>
                  <Mock>
                    [x] Allow algorithmic trading
                    <br />
                    [x] Allow WebRequest for listed URL:
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;{host}
                  </Mock>
                </StepCard>
                <StepCard n={3} icon={<MousePointerClick />} title={tr('wiz.step3')}>
                  {tr('wiz.step3Body')}
                  <Mock>
                    ApiUrl = {host}
                    <br />
                    SyncKey = {key ? `${key.key.slice(0, 12)}…` : 'tdk_…'}
                    <br />
                    HistoryDaysOnStart = 90
                  </Mock>
                </StepCard>
                <StepCard n={4} icon={<Power />} title={tr('wiz.step4')}>
                  {tr('wiz.step4Body')}
                </StepCard>
              </div>
              <div className="flex justify-between">
                <Button variant="quiet" onClick={() => setStep(1)}>
                  {tr('common.back')}
                </Button>
                <Button variant="primary" onClick={() => setStep(3)}>
                  {tr('wiz.attached')}
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
                  {tr('wiz.connectedTo', {
                    login: String(account.login ?? ''),
                    server: account.server ?? '',
                    balance: formatCurrency(Number(account.balance ?? 0)),
                  })}
                </p>
              ) : (
                <p className="max-w-sm text-sm text-muted">{tr('wiz.waitingBody')}</p>
              )}
              <Button variant={status === 'connected' ? 'primary' : 'ghost'} onClick={onDone}>
                {status === 'connected' ? tr('common.done') : tr('wiz.keepWaiting')}
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
