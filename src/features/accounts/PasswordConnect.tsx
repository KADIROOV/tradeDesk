import { motion } from 'framer-motion'
import { Check, Eye, EyeOff, KeyRound, Loader2, PlugZap, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { spring } from '@/components/motion'
import {
  ApiError,
  connectWithPassword,
  createAccount,
  newTransactionId,
  pullNow,
  useCloud,
} from '@/cloud/store'
import { tr } from '@/i18n'
import { formatCurrency, parseNum } from '@/lib/format'

/** Common XM MT5 servers; any other name can be typed. */
const XM_SERVERS = [
  'XMGlobal-MT5',
  ...Array.from({ length: 14 }, (_, i) => `XMGlobal-MT5 ${i + 2}`),
  'XMGlobal-MT5 Demo',
]

type Phase = 'form' | 'detecting' | 'starting' | 'importing' | 'done'

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'auth') return tr('wiz.errAuth')
    if (e.code === 'server') return tr('wiz.errServer')
    if (e.status === 503) return tr('wiz.errNotConfigured')
    return e.message
  }
  return e instanceof Error ? e.message : tr('common.somethingWrong')
}

/**
 * Connect an MT5 account like other journals do: account number + investor
 * password + server. The password lives only in this component's memory while
 * connecting and is cleared as soon as the server confirms.
 */
export function PasswordConnect({ onDone }: { onDone: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [server, setServer] = useState('XMGlobal-MT5')
  const [start, setStart] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const accountId = useRef<string | null>(null)
  const txId = useRef(newTransactionId())
  const alive = useRef(true)
  const account = useCloud((s) => s.accounts.find((a) => a.id === accountId.current))
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const valid = /^\d{3,20}$/.test(login.trim()) && password.length > 0 && server.trim().length > 1

  const connect = async () => {
    setError(null)
    setSlow(false)
    try {
      if (!accountId.current) {
        const a = await createAccount({
          name: `XM ${login.trim()}`,
          broker: 'XM',
          starting_balance: parseNum(start) ?? null,
        })
        accountId.current = a.id
      }
      const id = accountId.current
      // 1. Create the read-only cloud connection (MetaApi may need time to detect the broker).
      setPhase('detecting')
      for (let attempt = 0; ; attempt++) {
        const r = await connectWithPassword(
          id,
          { login: login.trim(), password, server: server.trim() },
          txId.current,
        )
        if (r.status === 'created') break
        if (attempt >= 8) throw new Error(tr('wiz.slow'))
        await sleep(Math.min(60, r.retry_after) * 1000)
        if (!alive.current) return
      }
      setPassword('') // no longer needed anywhere
      // 2. Wait for the terminal to log in, then import history.
      setPhase('starting')
      const started = Date.now()
      for (;;) {
        if (!alive.current) return
        const r = await pullNow(id)
        if (r.state === 'connected') break
        if (r.state === 'error') throw new Error(r.error)
        if (Date.now() - started > 150_000) setSlow(true)
        await sleep(5000)
      }
      setPhase('importing')
      await sleep(800)
      setPhase('done')
    } catch (e) {
      if (!alive.current) return
      setError(errorText(e))
      setPhase('form')
      txId.current = newTransactionId()
    }
  }

  if (phase !== 'form') {
    const steps: { key: Phase; label: string }[] = [
      { key: 'detecting', label: tr('wiz.detecting') },
      { key: 'starting', label: tr('wiz.starting') },
      { key: 'importing', label: tr('wiz.importing') },
    ]
    const order: Phase[] = ['detecting', 'starting', 'importing', 'done']
    const at = order.indexOf(phase)
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <motion.span
          className={`grid size-16 place-items-center rounded-full ${phase === 'done' ? 'bg-pos/15 text-pos' : 'bg-accent/12 text-accent'}`}
          animate={phase === 'done' ? { scale: [1, 1.12, 1] } : { opacity: [0.6, 1, 0.6] }}
          transition={phase === 'done' ? { duration: 0.5 } : { duration: 1.8, repeat: Infinity }}
        >
          {phase === 'done' ? <Check className="size-7" /> : <PlugZap className="size-7" />}
        </motion.span>
        {phase === 'done' && account ? (
          <p className="max-w-md text-sm">
            {tr('wiz.connectedPw', {
              login: String(account.login ?? login),
              server: account.server ?? server,
              balance: formatCurrency(Number(account.balance ?? 0)),
            })}
          </p>
        ) : (
          <ol className="flex w-full max-w-sm flex-col gap-2 text-left text-sm">
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2.5">
                {i < at ? (
                  <Check className="size-4 text-pos" />
                ) : i === at ? (
                  <Loader2 className="size-4 animate-spin text-accent" />
                ) : (
                  <span className="size-4 rounded-full border border-line/20" />
                )}
                <span className={i <= at ? 'text-fg' : 'text-muted'}>{s.label}</span>
              </li>
            ))}
          </ol>
        )}
        {slow && <p className="max-w-sm text-xs text-muted">{tr('wiz.slow')}</p>}
        <Button variant={phase === 'done' ? 'primary' : 'ghost'} onClick={onDone}>
          {phase === 'done' ? tr('common.done') : tr('wiz.keepWaiting')}
        </Button>
      </div>
    )
  }

  return (
    <motion.form
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) void connect()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr('wiz.login')}>
          {(id) => (
            <input
              id={id}
              data-autofocus
              className="field tabular"
              inputMode="numeric"
              autoComplete="username"
              placeholder="51234567"
              value={login}
              onChange={(e) => setLogin(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
        <Field label={tr('wiz.server')} hint={tr('wiz.serverHint')}>
          {(id) => (
            <>
              <input
                id={id}
                list="mt5-servers"
                className="field"
                value={server}
                onChange={(e) => setServer(e.target.value)}
              />
              <datalist id="mt5-servers">
                {XM_SERVERS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={tr('wiz.investorPassword')} className="sm:col-span-2">
          {(id) => (
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                id={id}
                type={showPw ? 'text' : 'password'}
                className="field pr-10 pl-9"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-fg"
                aria-label={showPw ? tr('dash.hidePnl') : tr('dash.showPnl')}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        <Field label={tr('dash.startingBalance')} hint={tr('wiz.startHint')}>
          {(id) => (
            <input
              id={id}
              className="field tabular"
              inputMode="decimal"
              placeholder="10000"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          )}
        </Field>
      </div>
      <p className="text-xs text-muted">{tr('wiz.investorHint')}</p>
      <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-accent/10 px-3 py-2 text-xs">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
        {tr('wiz.passwordSafety')}
      </p>
      {error && (
        <p role="alert" className="text-sm text-neg">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!valid} icon={<PlugZap />}>
          {tr('wiz.connectBtn')}
        </Button>
      </div>
    </motion.form>
  )
}
