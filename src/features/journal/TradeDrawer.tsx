import { tr } from '@/i18n'
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
import { EMOTIONS, emotionLabel, SESSION_LABEL, sessionLabel } from './constants'
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
            ? tr('trade.synced', { symbol: editing.symbol })
            : tr('trade.edit', { symbol: editing.symbol })
          : drawer.quick
            ? tr('trade.quickLog')
            : tr('trade.logTrade')
      }
      subtitle={
        editing
          ? `${formatInZone(tradeTime(editing), tz, 'weekday-date')} (${tz.replace(/_/g, ' ')})`
          : drawer.quick
            ? tr('trade.quickHint')
            : tr('trade.calcHint')
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
            {tr('trade.quick')}
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
      toast(e instanceof Error ? e.message : tr('trade.couldNotSave'), 'info')
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    setSubmitted(true)
    if (mt5 && editing) {
      void persist(
        { ...editing, ...journal, screenshotId: undefined },
        false,
        tr('trade.journalSaved'),
      )
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
        ? tr('trade.updated')
        : tr('trade.logged', {
            symbol: t.symbol,
            pnl: formatCurrency(t.pnl, { signed: true, hidden }),
          }),
    )
  }

  const journalFields = (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={tr('trade.session')}
          hint={
            autoSession && !f.session
              ? tr('trade.autoSession', { s: sessionLabel(autoSession) })
              : undefined
          }
        >
          {(id) => (
            <select
              id={id}
              className="field"
              value={f.session}
              onChange={(e) => set('session', e.target.value as Session | '')}
            >
              <option value="">{tr('trade.autoDetect')}</option>
              {(Object.keys(SESSION_LABEL) as Session[]).map((s) => (
                <option key={s} value={s}>
                  {sessionLabel(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={tr('trade.setupTag')}>
          {(id) => (
            <>
              <input
                id={id}
                list="setups"
                className="field"
                placeholder={tr('trade.setupPlaceholder')}
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
        <span className="label">{tr('trade.emotion')}</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tr('trade.emotion')}>
          {EMOTIONS.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={f.emotion === e}
              onClick={() => set('emotion', f.emotion === e ? '' : e)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-[transform,opacity] active:scale-95 ${f.emotion === e ? 'border-accent/60 bg-accent/15 text-fg' : 'border-line/12 text-muted hover:text-fg'}`}
            >
              {emotionLabel(e)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="label">{tr('trade.rating')}</span>
        <Stars value={f.rating} onChange={(v) => set('rating', v)} />
      </div>

      <Screenshots
        refs={f.screenshots}
        onChange={(refs) => set('screenshots', refs)}
        store={actions.storeScreenshot}
      />

      <Field label={tr('trade.notes')}>
        {(id) => (
          <textarea
            id={id}
            rows={4}
            className="field"
            placeholder={tr('trade.notesPlaceholder')}
            value={f.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        )}
      </Field>
      <Checkbox
        checked={f.rulesFollowed}
        onChange={(v) => set('rulesFollowed', v)}
        label={tr('trade.rulesFollowed')}
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
            <Field label={tr('trade.symbol')}>
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
              <span className="label">{tr('trade.direction')}</span>
              <Segmented
                label={tr('trade.direction')}
                value={f.direction}
                onChange={(v) => set('direction', v)}
                className="h-10 items-stretch [&>button]:h-auto"
                options={[
                  { value: 'long', label: tr('common.long') },
                  { value: 'short', label: tr('common.short') },
                ]}
              />
            </div>
          </div>

          {quick ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={tr('trade.netPnlUsd')}>
                {(id) => (
                  <input
                    id={id}
                    className="field tabular"
                    inputMode="decimal"
                    placeholder={tr('trade.pnlPlaceholder')}
                    value={f.pnl}
                    aria-invalid={submitted && errors.pnl}
                    onChange={(e) => set('pnl', e.target.value)}
                  />
                )}
              </Field>
              <Field label={tr('trade.dateTime')}>
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
              <Field label={tr('trade.opened')}>
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
                {num('entry', tr('trade.entry'))}
                {num('stop', tr('trade.stop'))}
                {num('takeProfit', tr('trade.takeProfit'))}
                {num('exit', tr('trade.exit'))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {num('lots', tr('trade.lotSize'), '0.10')}
                {num('fees', tr('trade.fees'), '0')}
              </div>

              <div
                className="glass grid grid-cols-3 gap-2 rounded-[var(--radius-sm)] p-3 text-center"
                aria-live="polite"
              >
                <div>
                  <p className="label">{tr('trade.netPnl')}</p>
                  {manual ? (
                    <input
                      className="field mt-1 h-8 text-center tabular"
                      inputMode="decimal"
                      aria-label={tr('trade.netPnl')}
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
                  <p className="label">{tr('trade.rMultiple')}</p>
                  <p
                    className={`tabular mt-1 text-lg font-semibold ${r === undefined ? 'text-muted' : r >= 0 ? 'text-pos' : 'text-neg'}`}
                  >
                    {formatR(r)}
                  </p>
                </div>
                <div>
                  <p className="label">{tr('trade.plannedRR')}</p>
                  <p className="tabular mt-1 text-lg font-semibold">
                    {rr === undefined ? '—' : `1:${formatNumber(rr, 2)}`}
                  </p>
                </div>
                <div className="col-span-3 flex items-center justify-between border-t hairline pt-2 text-xs text-muted">
                  <span>
                    {spec
                      ? calc
                        ? `${formatNumber(calc.pips, 1)} ${spec.category.startsWith('fx') || spec.symbol === 'XAUUSD' ? tr('trade.pips') : tr('trade.points')} · ${tr('trade.gross', { v: formatCurrency(calc.gross, { hidden }) })}`
                        : tr('trade.enterPrices')
                      : tr('trade.unknownSymbol')}
                  </span>
                  {spec && (
                    <button
                      type="button"
                      className="text-accent underline-offset-2 hover:underline"
                      onClick={() => set('pnlManual', !f.pnlManual)}
                    >
                      {f.pnlManual ? tr('trade.autoCalc') : tr('trade.enterManually')}
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
            ? tr('trade.errSymbol')
            : errors.openedAt
              ? tr('trade.errDate')
              : tr('trade.errPnl')}
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
                toast(tr('trade.deleted'), 'info')
                onDone()
              } catch (e) {
                toast(e instanceof Error ? e.message : tr('trade.couldNotDelete'), 'info')
              }
            }}
          >
            {tr('common.delete')}
          </Button>
        )}
        <Button variant="quiet" className="ml-auto" onClick={onDone}>
          {tr('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving
            ? tr('trade.saving')
            : mt5
              ? tr('trade.saveJournal')
              : editing
                ? tr('trade.saveChanges')
                : tr('trade.saveTrade')}
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
        <a href={url} target="_blank" rel="noreferrer" title={tr('trade.openFull')}>
          <img src={url} alt="Trade screenshot" className="h-full w-full object-cover" />
        </a>
      ) : (
        <div className="skeleton absolute inset-0 rounded-none" />
      )}
      <IconButton
        label={tr('trade.removeShot')}
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
          toast(tr('trade.shotTooBig'), 'info')
          continue
        }
        added.push(await store(file))
      }
      onChange([...refs, ...added])
    } catch (e) {
      toast(e instanceof Error ? e.message : tr('trade.uploadFailed'), 'info')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{tr('trade.screenshots')}</span>
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
        {busy
          ? tr('trade.uploading')
          : refs.length
            ? tr('trade.addAnother')
            : tr('trade.uploadShot')}
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
    <div className="flex gap-1" role="radiogroup" aria-label={tr('trade.ratingAria')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={tr('trade.stars', { n })}
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
      aria-label={tr('trade.brokerNumbers')}
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
          tr('trade.netPnl'),
          t.status === 'open' ? tr('common.open') : formatCurrency(t.pnl, { signed: true, hidden }),
          t.pnl >= 0 ? 'text-pos' : 'text-neg',
        )}
        {cell(tr('trade.rMultiple'), r === undefined ? tr('trade.rUnknown') : formatR(r))}
        {cell(
          tr('trade.volume'),
          t.lots === undefined ? '—' : tr('trade.lots', { n: formatNumber(t.lots, 2) }),
        )}
        {cell(tr('common.open'), price(t.entry))}
        {cell(tr('trade.close'), price(t.exit))}
        {cell(tr('trade.initialSl'), price(t.stop))}
        {cell(tr('trade.opened'), formatInZone(t.openedAt, tz))}
        {cell(tr('trade.closed'), t.closedAt ? formatInZone(t.closedAt, tz) : '—')}
        {cell(
          tr('trade.costs'),
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
