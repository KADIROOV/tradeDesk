import { format } from 'date-fns'
import { ImagePlus, Lock, Star, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Checkbox, Field, Segmented } from '@/components/ui/controls'
import { Drawer } from '@/components/ui/Drawer'
import { toast } from '@/components/ui/toastStore'
import { plannedRR, rMultiple, tradePnl } from '@/lib/finance/position'
import { formatCurrency, formatInZone, formatNumber, formatR, parseNum, uid } from '@/lib/format'
import { deleteBlob, loadBlob } from '@/lib/idb'
import { tradeR, tradeTime } from '@/lib/finance/metrics'
import { deleteScreenshot, screenshotUrl } from '@/cloud/store'
import { useTimezone, useTradeActions, useTradeList } from '@/data/useTradeData'
import { sessionForInstant } from '@/lib/sessions'
import type { Direction, Session, Trade } from '@/lib/types'
import { useSettings } from '@/store/settings'
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
  screenshots: string[]
  rating: number
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
      screenshots: [],
      rating: 0,
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
    screenshots: t.screenshots ?? (t.screenshotId ? [t.screenshotId] : []),
    rating: t.rating ?? 0,
  }
}

export function TradeDrawer() {
  const drawer = useUi((s) => s.tradeDrawer)
  const close = useUi((s) => s.closeTrade)
  const setQuick = useUi((s) => s.setQuick)
  const trades = useTradeList()
  const tz = useTimezone()
  const editing = drawer.editId ? trades.find((t) => t.id === drawer.editId) : undefined
  return (
    <Drawer
      open={drawer.open}
      onClose={close}
      title={
        editing
          ? editing.source === 'mt5'
            ? `${editing.symbol} · synced from MT5`
            : `Edit ${editing.symbol} trade`
          : drawer.quick
            ? 'Quick log'
            : 'Log trade'
      }
      subtitle={
        editing
          ? `${formatInZone(tradeTime(editing), tz, 'weekday-date')} (${tz.replace(/_/g, ' ')})`
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
  const actions = useTradeActions()
  const trades = useTradeList()
  const tz = useTimezone()
  const [saving, setSaving] = useState(false)
  const mt5 = editing?.source === 'mt5'
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
  const invalid = !mt5 && (errors.symbol || errors.openedAt || errors.pnl)

  const journal = {
    session: f.session || undefined,
    setup: f.setup.trim() || undefined,
    emotion: f.emotion || undefined,
    notes: f.notes.trim() || undefined,
    rulesFollowed: f.rulesFollowed,
    rating: f.rating || undefined,
    screenshots: f.screenshots,
  }

  const persist = async (t: Trade, isNew: boolean, message: string) => {
    setSaving(true)
    try {
      await actions.save(t, isNew)
      toast(message)
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'info')
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    setSubmitted(true)
    if (mt5 && editing) {
      void persist({ ...editing, ...journal, screenshotId: undefined }, false, 'Journal saved')
      return
    }
    if (invalid || pnl === undefined) return
    const t: Trade = {
      ...(editing ?? {}),
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
      rating: f.rating || undefined,
      screenshots: f.screenshots,
      screenshotId: undefined,
      closedAt: undefined,
      source: editing?.source ?? 'manual',
    }
    void persist(
      t,
      !editing,
      editing
        ? 'Trade updated'
        : `${t.symbol} ${formatCurrency(t.pnl, { signed: true, hidden })} logged`,
    )
  }

  const journalFields = (
    <>
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

      <div className="flex flex-col gap-1.5">
        <span className="label">Rating</span>
        <Stars value={f.rating} onChange={(v) => set('rating', v)} />
      </div>

      <Screenshots
        refs={f.screenshots}
        onChange={(refs) => set('screenshots', refs)}
        store={actions.storeScreenshot}
      />

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
  )

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
      {mt5 && editing ? (
        <>
          <Mt5Summary t={editing} tz={tz} hidden={hidden} />
          {journalFields}
        </>
      ) : (
        <>
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

              {journalFields}
            </>
          )}
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
        {editing && !mt5 && (
          <Button
            variant="danger"
            icon={<Trash2 />}
            disabled={saving}
            onClick={async () => {
              try {
                await actions.remove(editing)
                for (const ref of [
                  ...(editing.screenshots ?? []),
                  ...(editing.screenshotId ? [editing.screenshotId] : []),
                ])
                  void (ref.startsWith('sb:') ? deleteScreenshot(ref) : deleteBlob(ref))
                toast('Trade deleted', 'info')
                onDone()
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not delete', 'info')
              }
            }}
          >
            Delete
          </Button>
        )}
        <Button variant="quiet" className="ml-auto" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : mt5 ? 'Save journal' : editing ? 'Save changes' : 'Save trade'}
        </Button>
      </div>
    </form>
  )
}

function useScreenshotUrl(ref: string) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let created: string | null = null
    if (ref.startsWith('sb:')) {
      void screenshotUrl(ref).then((u) => alive && setUrl(u))
    } else {
      void loadBlob(ref).then((b) => {
        if (b && alive) {
          created = URL.createObjectURL(b)
          setUrl(created)
        }
      })
    }
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [ref])
  return url
}

function Thumb({ refId, onRemove }: { refId: string; onRemove: () => void }) {
  const url = useScreenshotUrl(refId)
  return (
    <div className="relative aspect-video overflow-hidden rounded-[var(--radius-sm)] border border-line/10 bg-line/5">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={url} alt="Trade screenshot" className="h-full w-full object-cover" />
        </a>
      ) : (
        <div className="skeleton absolute inset-0 rounded-none" />
      )}
      <IconButton
        label="Remove screenshot"
        variant="ghost"
        size="sm"
        className="absolute top-1.5 right-1.5 !bg-black/55 !text-white"
        onClick={onRemove}
      >
        <X />
      </IconButton>
    </div>
  )
}

function Screenshots({
  refs,
  onChange,
  store,
}: {
  refs: string[]
  onChange: (refs: string[]) => void
  store: (blob: Blob) => Promise<string>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const add = async (files: FileList | File[]) => {
    const images = [...files].filter((f) => f.type.startsWith('image/')).slice(0, 6)
    if (!images.length) return
    setBusy(true)
    try {
      const added: string[] = []
      for (const file of images) {
        if (file.size > 8 * 1024 * 1024) {
          toast('Screenshots must be under 8 MB', 'info')
          continue
        }
        added.push(await store(file))
      }
      onChange([...refs, ...added])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'info')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">Screenshots</span>
      {refs.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {refs.map((r) => (
            <Thumb key={r} refId={r} onRemove={() => onChange(refs.filter((x) => x !== r))} />
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onPaste={(e) => void add(e.clipboardData.files)}
        className="flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-line/20 py-4 text-sm text-muted transition-colors hover:border-accent/50 hover:text-fg"
      >
        <ImagePlus className="size-4" />{' '}
        {busy ? 'Uploading…' : refs.length ? 'Add another' : 'Upload chart screenshot'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => e.target.files && void add(e.target.files)}
      />
    </div>
  )
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Trade rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(value === n ? 0 : n)}
          className={`grid size-8 place-items-center rounded-full transition-transform active:scale-90 ${n <= value ? 'text-accent' : 'text-muted hover:text-fg'}`}
        >
          <Star className={`size-4 ${n <= value ? 'fill-current' : ''}`} />
        </button>
      ))}
    </div>
  )
}

function Mt5Summary({ t, tz, hidden }: { t: Trade; tz: string; hidden: boolean }) {
  const r = tradeR(t)
  const cell = (label: string, value: string, tone = '') => (
    <div>
      <p className="label">{label}</p>
      <p className={`tabular mt-0.5 text-sm font-medium ${tone}`}>{value}</p>
    </div>
  )
  const price = (v: number | undefined) => (v === undefined ? '—' : formatNumber(v, 5))
  return (
    <section
      className="glass rounded-[var(--radius-sm)] p-4"
      aria-label="Broker numbers (read-only)"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase ${t.direction === 'long' ? 'bg-pos/12 text-pos' : 'bg-neg/12 text-neg'}`}
          >
            {t.direction}
          </span>
          <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent">
            MT5
          </span>
          {t.symbolRaw && t.symbolRaw !== t.symbol && (
            <span className="text-xs text-muted">{t.symbolRaw}</span>
          )}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <Lock className="size-3" /> Read-only
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {cell(
          'Net P&L',
          t.status === 'open' ? 'Open' : formatCurrency(t.pnl, { signed: true, hidden }),
          t.pnl >= 0 ? 'text-pos' : 'text-neg',
        )}
        {cell('R multiple', r === undefined ? 'R unknown' : formatR(r))}
        {cell('Volume', t.lots === undefined ? '—' : `${formatNumber(t.lots, 2)} lots`)}
        {cell('Open', price(t.entry))}
        {cell('Close', price(t.exit))}
        {cell('Initial SL', price(t.stop))}
        {cell('Opened', formatInZone(t.openedAt, tz))}
        {cell('Closed', t.closedAt ? formatInZone(t.closedAt, tz) : '—')}
        {cell(
          'Costs',
          formatCurrency((t.commission ?? 0) + (t.swap ?? 0), { hidden, signed: true }),
        )}
      </div>
      {t.historyComplete === false && (
        <p className="mt-3 text-xs text-muted">
          The opening deal is older than the synced history, so the entry price is unknown. Raise
          HistoryDaysOnStart in the EA and re-sync.
        </p>
      )}
    </section>
  )
}
