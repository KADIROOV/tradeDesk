import { format } from 'date-fns'
import { ImagePlus, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox, Field, Segmented } from '@/components/ui/controls'
import { Drawer } from '@/components/ui/Drawer'
import { toast } from '@/components/ui/toastStore'
import { plannedRR, rMultiple, tradePnl } from '@/lib/finance/position'
import { formatCurrency, formatNumber, formatR, parseNum, uid } from '@/lib/format'
import { deleteBlob, loadBlob, saveBlob } from '@/lib/idb'
import { sessionForInstant } from '@/lib/sessions'
import type { Direction, Session, Trade } from '@/lib/types'
import { useSettings } from '@/store/settings'
import { useTrades } from '@/store/trades'
import { EMOTIONS, SESSION_LABEL } from './constants'
import { useUi } from '@/store/ui'

const DEFAULT_SETUPS = [
  'Breakout retest',
  'Liquidity sweep',
  'Trend pullback',
  'Range fade',
  'Opening drive',
  'FVG fill',
]

interface FormState {
  symbol: string
  direction: Direction
  openedAt: string
  entry: string
  stop: string
  takeProfit: string
  exit: string
  lots: string
  fees: string
  pnl: string
  pnlManual: boolean
  session: Session | ''
  setup: string
  emotion: string
  notes: string
  rulesFollowed: boolean
  screenshotId?: string
}

const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")
const str = (n: number | undefined) => (n === undefined ? '' : String(n))

function fromTrade(t: Trade | undefined): FormState {
  if (!t)
    return {
      symbol: 'XAUUSD',
      direction: 'long',
      openedAt: toLocalInput(new Date()),
      entry: '',
      stop: '',
      takeProfit: '',
      exit: '',
      lots: '',
      fees: '',
      pnl: '',
      pnlManual: false,
      session: '',
      setup: '',
      emotion: '',
      notes: '',
      rulesFollowed: true,
    }
  return {
    symbol: t.symbol,
    direction: t.direction,
    openedAt: toLocalInput(new Date(t.openedAt)),
    entry: str(t.entry),
    stop: str(t.stop),
    takeProfit: str(t.takeProfit),
    exit: str(t.exit),
    lots: str(t.lots),
    fees: t.fees ? String(t.fees) : '',
    pnl: String(t.pnl),
    pnlManual: t.pnlManual,
    session: t.session ?? '',
    setup: t.setup ?? '',
    emotion: t.emotion ?? '',
    notes: t.notes ?? '',
    rulesFollowed: t.rulesFollowed,
    screenshotId: t.screenshotId,
  }
}

export function TradeDrawer() {
  const drawer = useUi((s) => s.tradeDrawer)
  const close = useUi((s) => s.closeTrade)
  const setQuick = useUi((s) => s.setQuick)
  const trades = useTrades((s) => s.trades)
  const editing = drawer.editId ? trades.find((t) => t.id === drawer.editId) : undefined
  return (
    <Drawer
      open={drawer.open}
      onClose={close}
      title={editing ? `Edit ${editing.symbol} trade` : drawer.quick ? 'Quick log' : 'Log trade'}
      subtitle={
        editing
          ? format(new Date(editing.openedAt), 'EEE d MMM yyyy, HH:mm')
          : drawer.quick
            ? 'Four fields. Add detail later.'
            : 'P&L, R and RR are calculated as you type.'
      }
      headerExtra={
        !editing && (
          <Button
            size="sm"
            variant={drawer.quick ? 'primary' : 'ghost'}
            icon={<Zap />}
            onClick={() => setQuick(!drawer.quick)}
            aria-pressed={drawer.quick}
          >
            Quick
          </Button>
        )
      }
    >
      {drawer.open && (
        <TradeForm
          key={`${drawer.editId ?? 'new'}-${drawer.quick}`}
          editing={editing}
          quick={drawer.quick && !editing}
          onDone={close}
        />
      )}
    </Drawer>
  )
}

function TradeForm({
  editing,
  quick,
  onDone,
}: {
  editing?: Trade
  quick: boolean
  onDone: () => void
}) {
  const [f, setF] = useState<FormState>(() => fromTrade(editing))
  const [submitted, setSubmitted] = useState(false)
  const specs = useSettings((s) => s.symbolSpecs)
  const hidden = useSettings((s) => s.hideBalances)
  const { addTrade, updateTrade, deleteTrade, trades } = useTrades()
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))
  const spec = specs.find((s) => s.symbol === f.symbol.toUpperCase())
  const setups = useMemo(
    () => [
      ...new Set([
        ...DEFAULT_SETUPS,
        ...trades.map((t) => t.setup).filter((x): x is string => !!x),
      ]),
    ],
    [trades],
  )

  const entry = parseNum(f.entry)
  const stop = parseNum(f.stop)
  const tp = parseNum(f.takeProfit)
  const exit = parseNum(f.exit)
  const lots = parseNum(f.lots)
  const fees = parseNum(f.fees) ?? 0
  const calc =
    spec && entry !== undefined && exit !== undefined && lots !== undefined
      ? tradePnl({ spec, direction: f.direction, entry, exit, lots, fees })
      : undefined
  const r =
    entry !== undefined && stop !== undefined && exit !== undefined
      ? rMultiple(f.direction, entry, stop, exit)
      : undefined
  const rr =
    entry !== undefined && stop !== undefined && tp !== undefined
      ? plannedRR(entry, stop, tp)
      : undefined
  const manual = quick || f.pnlManual || !spec
  const pnl = manual ? parseNum(f.pnl) : calc?.net
  const openedDate = new Date(f.openedAt)
  const autoSession = Number.isNaN(openedDate.getTime()) ? undefined : sessionForInstant(openedDate)

  const errors = {
    symbol: !f.symbol.trim(),
    openedAt: Number.isNaN(openedDate.getTime()),
    pnl: pnl === undefined,
  }
  const invalid = errors.symbol || errors.openedAt || errors.pnl

  const save = () => {
    setSubmitted(true)
    if (invalid || pnl === undefined) return
    const t: Trade = {
      id: editing?.id ?? uid(),
      symbol: f.symbol.trim().toUpperCase(),
      direction: f.direction,
      openedAt: openedDate.toISOString(),
      entry: quick ? undefined : entry,
      stop: quick ? undefined : stop,
      takeProfit: quick ? undefined : tp,
      exit: quick ? undefined : exit,
      lots: quick ? undefined : lots,
      fees: quick ? 0 : fees,
      pnl: Number(pnl.toFixed(2)),
      pnlManual: manual,
      session: f.session || autoSession,
      setup: f.setup.trim() || undefined,
      emotion: f.emotion || undefined,
      notes: f.notes.trim() || undefined,
      rulesFollowed: f.rulesFollowed,
      screenshotId: f.screenshotId,
    }
    if (editing) updateTrade(editing.id, t)
    else addTrade(t)
    toast(
      editing
        ? 'Trade updated'
        : `${t.symbol} ${formatCurrency(t.pnl, { signed: true, hidden })} logged`,
    )
    onDone()
  }

  const num = (k: keyof FormState, label: string, placeholder = '0.00') => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          className="field tabular"
          inputMode="decimal"
          placeholder={placeholder}
          value={f[k] as string}
          onChange={(e) => set(k, e.target.value as never)}
        />
      )}
    </Field>
  )

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbol">
          {(id) => (
            <>
              <input
                id={id}
                data-autofocus
                list="symbols"
                className="field uppercase"
                value={f.symbol}
                aria-invalid={submitted && errors.symbol}
                onChange={(e) => set('symbol', e.target.value.toUpperCase())}
              />
              <datalist id="symbols">
                {specs.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.name}
                  </option>
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="label">Direction</span>
          <Segmented
            label="Direction"
            value={f.direction}
            onChange={(v) => set('direction', v)}
            className="h-10 items-stretch [&>button]:h-auto"
            options={[
              { value: 'long', label: 'Long' },
              { value: 'short', label: 'Short' },
            ]}
          />
        </div>
      </div>

      {quick ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Net P&L ($)">
            {(id) => (
              <input
                id={id}
                className="field tabular"
                inputMode="decimal"
                placeholder="e.g. 125 or -80"
                value={f.pnl}
                aria-invalid={submitted && errors.pnl}
                onChange={(e) => set('pnl', e.target.value)}
              />
            )}
          </Field>
          <Field label="Date & time">
            {(id) => (
              <input
                id={id}
                type="datetime-local"
                className="field"
                value={f.openedAt}
                onChange={(e) => set('openedAt', e.target.value)}
              />
            )}
          </Field>
        </div>
      ) : (
        <>
          <Field label="Opened">
            {(id) => (
              <input
                id={id}
                type="datetime-local"
                className="field"
                value={f.openedAt}
                aria-invalid={submitted && errors.openedAt}
                onChange={(e) => set('openedAt', e.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {num('entry', 'Entry')}
            {num('stop', 'Stop')}
            {num('takeProfit', 'Take profit')}
            {num('exit', 'Exit')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {num('lots', 'Lot size', '0.10')}
            {num('fees', 'Fees ($)', '0')}
          </div>

          <div
            className="glass grid grid-cols-3 gap-2 rounded-[var(--radius-sm)] p-3 text-center"
            aria-live="polite"
          >
            <div>
              <p className="label">Net P&L</p>
              {manual ? (
                <input
                  className="field mt-1 h-8 text-center tabular"
                  inputMode="decimal"
                  aria-label="Net P&L"
                  placeholder="0.00"
                  value={f.pnl}
                  aria-invalid={submitted && errors.pnl}
                  onChange={(e) => set('pnl', e.target.value)}
                />
              ) : (
                <p
                  className={`tabular mt-1 text-lg font-semibold ${calc ? (calc.net >= 0 ? 'text-pos' : 'text-neg') : 'text-muted'}`}
                >
                  {calc ? formatCurrency(calc.net, { signed: true, hidden }) : '—'}
                </p>
              )}
            </div>
            <div>
              <p className="label">R multiple</p>
              <p
                className={`tabular mt-1 text-lg font-semibold ${r === undefined ? 'text-muted' : r >= 0 ? 'text-pos' : 'text-neg'}`}
              >
                {formatR(r)}
              </p>
            </div>
            <div>
              <p className="label">Planned RR</p>
              <p className="tabular mt-1 text-lg font-semibold">
                {rr === undefined ? '—' : `1:${formatNumber(rr, 2)}`}
              </p>
            </div>
            <div className="col-span-3 flex items-center justify-between border-t hairline pt-2 text-xs text-muted">
              <span>
                {spec
                  ? calc
                    ? `${formatNumber(calc.pips, 1)} ${spec.category.startsWith('fx') || spec.symbol === 'XAUUSD' ? 'pips' : 'points'} · gross ${formatCurrency(calc.gross, { hidden })}`
                    : 'Enter entry, exit and size'
                  : 'Unknown symbol — enter P&L manually'}
              </span>
              {spec && (
                <button
                  type="button"
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={() => set('pnlManual', !f.pnlManual)}
                >
                  {f.pnlManual ? 'Auto-calculate' : 'Enter manually'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Session"
              hint={autoSession && !f.session ? `Auto: ${SESSION_LABEL[autoSession]}` : undefined}
            >
              {(id) => (
                <select
                  id={id}
                  className="field"
                  value={f.session}
                  onChange={(e) => set('session', e.target.value as Session | '')}
                >
                  <option value="">Auto-detect</option>
                  {(Object.keys(SESSION_LABEL) as Session[]).map((s) => (
                    <option key={s} value={s}>
                      {SESSION_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Setup tag">
              {(id) => (
                <>
                  <input
                    id={id}
                    list="setups"
                    className="field"
                    placeholder="e.g. Breakout retest"
                    value={f.setup}
                    onChange={(e) => set('setup', e.target.value)}
                  />
                  <datalist id="setups">
                    {setups.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="label">Emotion</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Emotion">
              {EMOTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={f.emotion === e}
                  onClick={() => set('emotion', f.emotion === e ? '' : e)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-[transform,opacity] active:scale-95 ${f.emotion === e ? 'border-accent/60 bg-accent/15 text-fg' : 'border-line/12 text-muted hover:text-fg'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <Screenshot id={f.screenshotId} onChange={(id) => set('screenshotId', id)} />

          <Field label="Notes">
            {(id) => (
              <textarea
                id={id}
                rows={4}
                className="field"
                placeholder="What did you see? What would you repeat or avoid?"
                value={f.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            )}
          </Field>
          <Checkbox
            checked={f.rulesFollowed}
            onChange={(v) => set('rulesFollowed', v)}
            label="I followed my rules on this trade"
          />
        </>
      )}

      {submitted && invalid && (
        <p className="text-sm text-neg">
          {errors.symbol
            ? 'Add a symbol.'
            : errors.openedAt
              ? 'Pick a valid date.'
              : 'Enter prices and size, or a P&L.'}
        </p>
      )}

      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 flex items-center gap-2 border-t hairline bg-[rgb(var(--surface-rgb)/0.9)] px-5 py-3 backdrop-blur">
        {editing && (
          <Button
            variant="danger"
            icon={<Trash2 />}
            onClick={() => {
              deleteTrade(editing.id)
              if (editing.screenshotId) void deleteBlob(editing.screenshotId)
              toast('Trade deleted', 'info')
              onDone()
            }}
          >
            Delete
          </Button>
        )}
        <Button variant="quiet" className="ml-auto" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {editing ? 'Save changes' : 'Save trade'}
        </Button>
      </div>
    </form>
  )
}

function Screenshot({ id, onChange }: { id?: string; onChange: (id: string | undefined) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!id) return
    let u: string | null = null
    let alive = true
    loadBlob(id).then((b) => {
      if (b && alive) {
        u = URL.createObjectURL(b)
        setUrl(u)
      }
    })
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
      setUrl(null)
    }
  }, [id])
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">Screenshot</span>
      {id && url ? (
        <div className="relative overflow-hidden rounded-[var(--radius-sm)] border border-line/10">
          <img src={url} alt="Trade screenshot" className="max-h-56 w-full object-cover" />
          <IconButton
            label="Remove screenshot"
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 !bg-black/50 !text-white"
            onClick={() => onChange(undefined)}
          >
            <X />
          </IconButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onPaste={async (e) => {
            const file = e.clipboardData.files[0]
            if (file?.type.startsWith('image/')) onChange(await saveBlob(file, 'shot'))
          }}
          className="flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-line/20 py-5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-fg"
        >
          <ImagePlus className="size-4" /> Upload chart screenshot
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) onChange(await saveBlob(file, 'shot'))
        }}
      />
    </div>
  )
}
