import { fmtDate, tn, tr } from '@/i18n'
import { endOfWeek, startOfWeek } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download,
  FileUp,
  LayoutGrid,
  List,
  Merge,
  NotebookPen,
  PlugZap,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, Segmented } from '@/components/ui/controls'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toastStore'
import { stagger } from '@/components/motion'
import { csvToTrades, tradesToCsv } from '@/lib/csv'
import { countDuplicates } from '@/lib/dedupe'
import { computeStats, tradeDay, tradeR, tradeTime } from '@/lib/finance/metrics'
import { dateKey, formatCurrency, formatInZone, formatPercent, formatR } from '@/lib/format'
import type { Session, Trade } from '@/lib/types'
import { useJournal } from '@/store/journal'
import { useSettings } from '@/store/settings'
import { useTrades } from '@/store/trades'
import { useUi } from '@/store/ui'
import { useCloud } from '@/cloud/store'
import { useCloudActive, useTimezone, useTradeActions, useTradeList } from '@/data/useTradeData'
import { emotionLabel, SESSION_LABEL, sessionLabel } from './constants'

type Tab = 'trades' | 'daily' | 'weekly'
type Outcome = 'all' | 'win' | 'loss'

export default function JournalPage() {
  const trades = useTradeList()
  const [tab, setTab] = useState<Tab>('trades')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [q, setQ] = useState('')
  const [symbol, setSymbol] = useState('all')
  const [outcome, setOutcome] = useState<Outcome>('all')
  const [session, setSession] = useState<Session | 'all'>('all')
  const [setup, setSetup] = useState('all')
  const [rulesOnly, setRulesOnly] = useState<'all' | 'kept' | 'broken'>('all')
  const searchRef = useRef<HTMLInputElement>(null)
  const tick = useUi((s) => s.searchFocusTick)
  useEffect(() => {
    if (tick) searchRef.current?.focus()
  }, [tick])

  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))].sort(), [trades])
  const setups = useMemo(
    () => [...new Set(trades.map((t) => t.setup).filter((x): x is string => !!x))].sort(),
    [trades],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...trades]
      .filter((t) => symbol === 'all' || t.symbol === symbol)
      .filter((t) => outcome === 'all' || (outcome === 'win' ? t.pnl > 0 : t.pnl < 0))
      .filter((t) => session === 'all' || t.session === session)
      .filter((t) => setup === 'all' || t.setup === setup)
      .filter(
        (t) => rulesOnly === 'all' || (rulesOnly === 'kept' ? t.rulesFollowed : !t.rulesFollowed),
      )
      .filter(
        (t) =>
          !needle ||
          [t.symbol, t.setup, t.emotion, t.notes, t.direction].some((v) =>
            v?.toLowerCase().includes(needle),
          ),
      )
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
  }, [trades, q, symbol, outcome, session, setup, rulesOnly])

  const activeFilters = [
    symbol !== 'all',
    outcome !== 'all',
    session !== 'all',
    setup !== 'all',
    rulesOnly !== 'all',
    q !== '',
  ].filter(Boolean).length
  const clearFilters = () => {
    setQ('')
    setSymbol('all')
    setOutcome('all')
    setSession('all')
    setSetup('all')
    setRulesOnly('all')
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
      <PageHeader count={trades.length} />
      {trades.length === 0 ? (
        <Card>
          <JournalEmpty />
        </Card>
      ) : (
        <>
          <Card padded="sm" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label={tr('journal.view')}
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'trades', label: tr('journal.tabTrades') },
                  { value: 'daily', label: tr('journal.tabDaily') },
                  { value: 'weekly', label: tr('journal.tabWeekly') },
                ]}
              />
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  ref={searchRef}
                  type="search"
                  className="field pl-9"
                  placeholder={tr('journal.search')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label={tr('journal.searchAria')}
                />
              </div>
              {tab === 'trades' && (
                <Segmented
                  label={tr('journal.layout')}
                  value={view}
                  onChange={setView}
                  options={[
                    {
                      value: 'list',
                      label: <span className="sr-only">{tr('journal.list')}</span>,
                      icon: <List />,
                    },
                    {
                      value: 'grid',
                      label: <span className="sr-only">{tr('journal.grid')}</span>,
                      icon: <LayoutGrid />,
                    },
                  ]}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label={tr('journal.symbol')}
                value={symbol}
                onChange={setSymbol}
                options={[
                  ['all', tr('journal.allSymbols')],
                  ...symbols.map((s) => [s, s] as [string, string]),
                ]}
              />
              <FilterSelect
                label={tr('journal.outcome')}
                value={outcome}
                onChange={(v) => setOutcome(v as Outcome)}
                options={[
                  ['all', tr('journal.winsLosses')],
                  ['win', tr('journal.wins')],
                  ['loss', tr('journal.losses')],
                ]}
              />
              <FilterSelect
                label={tr('journal.session')}
                value={session}
                onChange={(v) => setSession(v as Session | 'all')}
                options={[
                  ['all', tr('journal.allSessions')],
                  ...(Object.keys(SESSION_LABEL) as Session[]).map(
                    (s) => [s, sessionLabel(s)] as [string, string],
                  ),
                ]}
              />
              <FilterSelect
                label={tr('journal.setup')}
                value={setup}
                onChange={setSetup}
                options={[
                  ['all', tr('journal.allSetups')],
                  ...setups.map((s) => [s, s] as [string, string]),
                ]}
              />
              <FilterSelect
                label={tr('journal.rules')}
                value={rulesOnly}
                onChange={(v) => setRulesOnly(v as 'all' | 'kept' | 'broken')}
                options={[
                  ['all', tr('journal.anyRules')],
                  ['kept', tr('journal.rulesKept')],
                  ['broken', tr('journal.rulesBroken')],
                ]}
              />
              {activeFilters > 0 && (
                <Button size="sm" variant="quiet" onClick={clearFilters}>
                  {tr('journal.clearN', { n: activeFilters })}
                </Button>
              )}
            </div>
            <FilteredSummary trades={filtered} total={trades.length} />
          </Card>
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search />}
                title={tr('journal.noMatchTitle')}
                body={tr('journal.noMatchBody')}
                action={<Button onClick={clearFilters}>{tr('journal.clearFilters')}</Button>}
              />
            </Card>
          ) : tab === 'trades' ? (
            view === 'list' ? (
              <TradeList trades={filtered} />
            ) : (
              <TradeGrid trades={filtered} />
            )
          ) : (
            <PeriodList trades={filtered} period={tab === 'daily' ? 'day' : 'week'} />
          )}
        </>
      )}
    </motion.div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <select
      aria-label={label}
      className={`field h-8 w-auto py-0 text-xs ${value !== 'all' ? 'border-accent/50' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

function FilteredSummary({ trades, total }: { trades: Trade[]; total: number }) {
  const hidden = useSettings((s) => s.hideBalances)
  const s = computeStats(trades)
  return (
    <p className="text-xs text-muted">
      {tr('journal.summary', {
        count:
          trades.length === total
            ? tn('n.trades', total)
            : tr('journal.ofTotal', { n: trades.length, total }),
        wr: formatPercent(s.winRate, 0),
      })}{' '}
      <span className={s.totalPnl >= 0 ? 'text-pos' : 'text-neg'}>
        {formatCurrency(s.totalPnl, { hidden, signed: true })}
      </span>
    </p>
  )
}

function PageHeader({ count }: { count: number }) {
  const openTrade = useUi((s) => s.openTrade)
  const { mergeDuplicates, clearAll } = useTrades()
  const trades = useTradeList()
  const actions = useTradeActions()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const dupes = useMemo(
    () => (actions.cloud ? 0 : countDuplicates(trades)),
    [trades, actions.cloud],
  )

  const exportCsv = () => {
    const blob = new Blob([tradesToCsv(trades)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trades-${dateKey(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importCsv = async (file?: File) => {
    if (!file) return
    const r = csvToTrades(await file.text())
    try {
      await actions.importMany(r.trades)
    } catch (e) {
      toast(e instanceof Error ? e.message : tr('common.importFailed'), 'info')
      return
    }
    toast(
      `${tr('journal.imported', { n: r.trades.length })}${r.skipped ? ` · ${tr('journal.skipped', { n: r.skipped })}` : ''}`,
      r.trades.length ? 'ok' : 'info',
    )
  }

  return (
    <motion.div variants={stagger} className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="label">{tr('journal.label')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Every trade, <span className="display text-accent">{tr('journal.titleAccent')}</span>
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {count > 0 && (
          <>
            <Button size="sm" icon={<FileUp />} onClick={() => fileRef.current?.click()}>
              {tr('common.import')}
            </Button>
            <Button size="sm" icon={<Download />} onClick={exportCsv}>
              {tr('common.export')}
            </Button>
            {dupes > 0 && (
              <Button
                size="sm"
                icon={<Merge />}
                onClick={() => toast(tr('journal.merged', { n: mergeDuplicates() }))}
              >
                {tn('n.duplicates', dupes)}
              </Button>
            )}
            {!actions.cloud && (
              <Button
                size="sm"
                variant="quiet"
                icon={<Trash2 />}
                onClick={() => setConfirmClear(true)}
              >
                {tr('journal.clear')}
              </Button>
            )}
          </>
        )}
        <Button size="sm" icon={<Zap />} onClick={() => openTrade({ quick: true })} kbd="Q">
          {tr('journal.quickLog')}
        </Button>
        <Button size="sm" variant="primary" icon={<Plus />} onClick={() => openTrade()} kbd="N">
          {tr('nav.logTrade')}
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => void importCsv(e.target.files?.[0])}
      />
      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={tr('journal.clearTitle')}
        description={tr('journal.clearBody')}
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setConfirmClear(false)}>
            {tr('journal.keep')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearAll()
              setConfirmClear(false)
              toast(tr('journal.cleared'), 'info')
            }}
          >
            {tr('journal.clearAll')}
          </Button>
        </div>
      </Modal>
    </motion.div>
  )
}

export function JournalEmpty() {
  const openTrade = useUi((s) => s.openTrade)
  const loadDemo = useTrades((s) => s.loadDemo)
  const openSettings = useUi((s) => s.openSettings)
  const cloud = useCloudActive()
  if (cloud)
    // Signed in: trades come from MT5 (demo data would only live on this device).
    return (
      <EmptyState
        icon={<PlugZap />}
        title={tr('dash.emptyCloudTitle')}
        body={tr('dash.emptyCloudBody')}
        action={
          <>
            <Button variant="primary" icon={<PlugZap />} onClick={() => openSettings('accounts')}>
              {tr('dash.connectMt5')}
            </Button>
            <Button icon={<Plus />} onClick={() => openTrade()}>
              {tr('dash.logManual')}
            </Button>
          </>
        }
      />
    )
  return (
    <EmptyState
      icon={<NotebookPen />}
      title={tr('journal.emptyTitle')}
      body={tr('journal.emptyBody')}
      action={
        <>
          <Button variant="primary" icon={<Plus />} onClick={() => openTrade()}>
            {tr('dash.logFirst')}
          </Button>
          <Button
            icon={<Sparkles />}
            onClick={() => {
              loadDemo()
              toast(tr('dash.demoLoaded'))
            }}
          >
            {tr('dash.loadDemo')}
          </Button>
        </>
      }
    />
  )
}

function Pnl({ value, className = '' }: { value: number; className?: string }) {
  const hidden = useSettings((s) => s.hideBalances)
  return (
    <span
      className={`tabular font-medium ${value > 0 ? 'text-pos' : value < 0 ? 'text-neg' : 'text-muted'} ${className}`}
    >
      {formatCurrency(value, { hidden, signed: true })}
    </span>
  )
}

export function SourceBadges({ t }: { t: Trade }) {
  return (
    <>
      {t.source === 'mt5' && (
        <span
          className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-accent"
          title={tr('journal.synced')}
        >
          MT5
        </span>
      )}
      {t.status === 'open' && (
        <span className="rounded-md border border-line/20 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-muted uppercase">
          {tr('common.open')}
        </span>
      )}
    </>
  )
}

/** Soft accent wash on trades that just arrived from MT5. */
function useFresh(id: string) {
  const at = useCloud((s) => s.fresh[id])
  return at !== undefined && Date.now() - at < 8000
}

function SideBadge({ t }: { t: Trade }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase ${t.direction === 'long' ? 'bg-pos/12 text-pos' : 'bg-neg/12 text-neg'}`}
    >
      {t.direction}
    </span>
  )
}

const PAGE = 40

function TradeRow({ t, onOpen }: { t: Trade; onOpen: () => void }) {
  const tz = useTimezone()
  const fresh = useFresh(t.id)
  return (
    <motion.tr
      layout="position"
      initial={fresh ? { opacity: 0, y: -10 } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      tabIndex={0}
      className={`cursor-pointer transition-colors duration-[1500ms] hover:bg-line/5 focus-visible:bg-line/5 ${fresh ? 'bg-accent/10' : ''}`}
    >
      <td className="py-3 pr-2 pl-4 text-xs text-muted sm:px-4 sm:text-sm">
        <span className="tabular whitespace-nowrap">{formatInZone(tradeTime(t), tz)}</span>
      </td>
      <td className="px-2 py-3 sm:px-4">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{t.symbol}</span>
          <SideBadge t={t} />
          <SourceBadges t={t} />
          {!t.rulesFollowed && (
            <span
              className="size-1.5 rounded-full bg-neg"
              title={tr('journal.rulesBroken')}
              aria-label={tr('journal.rulesBroken')}
            />
          )}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-muted md:table-cell">{t.setup ?? '—'}</td>
      <td className="hidden px-4 py-3 text-muted md:table-cell">
        {t.session ? sessionLabel(t.session) : '—'}
      </td>
      <td className="tabular hidden px-4 py-3 text-right text-muted sm:table-cell">
        {t.source === 'mt5' && t.rMultiple === null ? (
          <span title={tr('journal.rUnknown')}>R ?</span>
        ) : (
          formatR(tradeR(t))
        )}
      </td>
      <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap sm:px-4">
        {t.status === 'open' ? (
          <span className="text-xs text-muted">{tr('journal.openLower')}</span>
        ) : (
          <Pnl value={t.pnl} />
        )}
      </td>
    </motion.tr>
  )
}

function TradeList({ trades }: { trades: Trade[] }) {
  const openTrade = useUi((s) => s.openTrade)
  const [limit, setLimit] = useState(PAGE)
  return (
    <Card padded={false} className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="hidden text-left sm:table-header-group">
          <tr className="border-b hairline">
            {[
              tr('journal.colDate'),
              tr('journal.symbol'),
              tr('journal.setup'),
              tr('journal.session'),
              'R',
              tr('journal.colPnl'),
            ].map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`label px-4 py-3 font-medium ${i >= 4 ? 'text-right' : ''} ${i === 4 ? 'hidden sm:table-cell' : ''} ${i === 3 ? 'hidden md:table-cell' : ''} ${i === 2 ? 'hidden md:table-cell' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-hairline">
          <AnimatePresence initial={false}>
            {trades.slice(0, limit).map((t) => (
              <TradeRow key={t.id} t={t} onOpen={() => openTrade({ editId: t.id })} />
            ))}
          </AnimatePresence>
        </tbody>
      </table>
      {trades.length > limit && (
        <div className="border-t hairline p-3 text-center">
          <Button size="sm" variant="quiet" onClick={() => setLimit((l) => l + PAGE)}>
            {tr('journal.showMoreN', { n: Math.min(PAGE, trades.length - limit) })}
          </Button>
        </div>
      )}
    </Card>
  )
}

function TradeGrid({ trades }: { trades: Trade[] }) {
  const openTrade = useUi((s) => s.openTrade)
  const tz = useTimezone()
  const [limit, setLimit] = useState(PAGE)
  return (
    <>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {trades.slice(0, limit).map((t) => (
          <Card
            key={t.id}
            lift
            padded="sm"
            className="cursor-pointer"
            onClick={() => openTrade({ editId: t.id })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && openTrade({ editId: t.id })}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t.symbol}</span>
                  <SideBadge t={t} />
                  <SourceBadges t={t} />
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatInZone(tradeTime(t), tz, 'weekday-date')}
                </p>
              </div>
              <Pnl value={t.pnl} className="text-base" />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {t.setup && (
                <span className="rounded-full bg-line/8 px-2 py-0.5 text-muted">{t.setup}</span>
              )}
              {t.emotion && (
                <span className="rounded-full bg-line/8 px-2 py-0.5 text-muted">
                  {emotionLabel(t.emotion)}
                </span>
              )}
              <span className="rounded-full bg-line/8 px-2 py-0.5 text-muted">
                {formatR(tradeR(t))}
              </span>
              {!t.rulesFollowed && (
                <span className="rounded-full bg-neg/12 px-2 py-0.5 text-neg">
                  {tr('journal.rulesBroken')}
                </span>
              )}
            </div>
            {t.notes && <p className="mt-3 line-clamp-2 text-sm text-muted">{t.notes}</p>}
          </Card>
        ))}
      </motion.div>
      {trades.length > limit && (
        <div className="text-center">
          <Button size="sm" variant="quiet" onClick={() => setLimit((l) => l + PAGE)}>
            {tr('journal.showMore')}
          </Button>
        </div>
      )}
    </>
  )
}

function PeriodList({ trades, period }: { trades: Trade[]; period: 'day' | 'week' }) {
  const days = useJournal((s) => s.days)
  const openDay = useUi((s) => s.openCalendarDay)
  const tz = useTimezone()
  const groups = useMemo(() => {
    const map = new Map<string, Trade[]>()
    for (const t of trades) {
      if (t.status === 'open') continue
      const day = tradeDay(t, tz)
      const k =
        period === 'day'
          ? day
          : dateKey(startOfWeek(new Date(`${day}T00:00:00`), { weekStartsOn: 1 }))
      map.set(k, [...(map.get(k) ?? []), t])
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [trades, period, tz])

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3">
      {groups.map(([k, ts]) => {
        const s = computeStats(ts)
        const start = new Date(`${k}T00:00:00`)
        const note = period === 'day' ? days[k]?.note : undefined
        return (
          <Card key={k} padded="sm" lift>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {period === 'day'
                    ? fmtDate(start, 'EEEE, d MMMM')
                    : `${fmtDate(start, 'd MMM')} – ${fmtDate(endOfWeek(start, { weekStartsOn: 1 }), 'd MMM yyyy')}`}
                </p>
                <p className="text-xs text-muted">
                  {tn('n.trades', s.count)} ·{' '}
                  {tr('journal.periodStats', {
                    w: s.wins,
                    l: s.losses,
                    wr: formatPercent(s.winRate, 0),
                  })}
                  {period === 'week' &&
                    ` · PF ${Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Pnl value={s.totalPnl} className="text-lg" />
                {period === 'day' && (
                  <Button size="sm" variant="quiet" onClick={() => openDay(k)}>
                    {tr('journal.openDay')}
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ts.map((t) => (
                <span
                  key={t.id}
                  className={`rounded-full px-2 py-0.5 text-xs ${t.pnl >= 0 ? 'bg-pos/12 text-pos' : 'bg-neg/12 text-neg'}`}
                >
                  {t.symbol} {formatR(tradeR(t))}
                </span>
              ))}
            </div>
            {note && <p className="mt-3 line-clamp-2 text-sm text-muted">{note}</p>}
          </Card>
        )
      })}
    </motion.div>
  )
}
