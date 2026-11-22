import { endOfWeek, format, startOfWeek } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download,
  FileUp,
  LayoutGrid,
  List,
  Merge,
  NotebookPen,
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
import { computeStats, tradeR } from '@/lib/finance/metrics'
import { dateKey, formatCurrency, formatPercent, formatR } from '@/lib/format'
import type { Session, Trade } from '@/lib/types'
import { useJournal } from '@/store/journal'
import { useSettings } from '@/store/settings'
import { useTrades } from '@/store/trades'
import { useUi } from '@/store/ui'
import { SESSION_LABEL } from './constants'

type Tab = 'trades' | 'daily' | 'weekly'
type Outcome = 'all' | 'win' | 'loss'

export default function JournalPage() {
  const trades = useTrades((s) => s.trades)
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
                label="Journal view"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'trades', label: 'Trades' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
              />
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  ref={searchRef}
                  type="search"
                  className="field pl-9"
                  placeholder="Search symbol, setup, notes…  ( / )"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search trades"
                />
              </div>
              {tab === 'trades' && (
                <Segmented
                  label="Layout"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'list', label: <span className="sr-only">List</span>, icon: <List /> },
                    {
                      value: 'grid',
                      label: <span className="sr-only">Grid</span>,
                      icon: <LayoutGrid />,
                    },
                  ]}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Symbol"
                value={symbol}
                onChange={setSymbol}
                options={[
                  ['all', 'All symbols'],
                  ...symbols.map((s) => [s, s] as [string, string]),
                ]}
              />
              <FilterSelect
                label="Outcome"
                value={outcome}
                onChange={(v) => setOutcome(v as Outcome)}
                options={[
                  ['all', 'Wins & losses'],
                  ['win', 'Wins'],
                  ['loss', 'Losses'],
                ]}
              />
              <FilterSelect
                label="Session"
                value={session}
                onChange={(v) => setSession(v as Session | 'all')}
                options={[
                  ['all', 'All sessions'],
                  ...(Object.keys(SESSION_LABEL) as Session[]).map(
                    (s) => [s, SESSION_LABEL[s]] as [string, string],
                  ),
                ]}
              />
              <FilterSelect
                label="Setup"
                value={setup}
                onChange={setSetup}
                options={[['all', 'All setups'], ...setups.map((s) => [s, s] as [string, string])]}
              />
              <FilterSelect
                label="Rules"
                value={rulesOnly}
                onChange={(v) => setRulesOnly(v as 'all' | 'kept' | 'broken')}
                options={[
                  ['all', 'Any rules'],
                  ['kept', 'Rules kept'],
                  ['broken', 'Rules broken'],
                ]}
              />
              {activeFilters > 0 && (
                <Button size="sm" variant="quiet" onClick={clearFilters}>
                  Clear {activeFilters}
                </Button>
              )}
            </div>
            <FilteredSummary trades={filtered} total={trades.length} />
          </Card>
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search />}
                title="No trades match"
                body="Try a different search or clear the filters."
                action={<Button onClick={clearFilters}>Clear filters</Button>}
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
      {trades.length === total ? `${total} trades` : `${trades.length} of ${total} trades`} · Win
      rate {formatPercent(s.winRate, 0)} · Net{' '}
      <span className={s.totalPnl >= 0 ? 'text-pos' : 'text-neg'}>
        {formatCurrency(s.totalPnl, { hidden, signed: true })}
      </span>
    </p>
  )
}

function PageHeader({ count }: { count: number }) {
  const openTrade = useUi((s) => s.openTrade)
  const { importTrades, mergeDuplicates, trades, clearAll } = useTrades()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const dupes = useMemo(() => countDuplicates(trades), [trades])

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
    importTrades(r.trades)
    toast(
      `Imported ${r.trades.length} trades${r.skipped ? ` · skipped ${r.skipped}` : ''}`,
      r.trades.length ? 'ok' : 'info',
    )
  }

  return (
    <motion.div variants={stagger} className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="label">Journal</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Every trade, <span className="serif text-accent">honestly</span>
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {count > 0 && (
          <>
            <Button size="sm" icon={<FileUp />} onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <Button size="sm" icon={<Download />} onClick={exportCsv}>
              Export
            </Button>
            {dupes > 0 && (
              <Button
                size="sm"
                icon={<Merge />}
                onClick={() =>
                  toast(`Merged ${mergeDuplicates()} duplicate${dupes > 1 ? 's' : ''}`)
                }
              >
                Merge {dupes} duplicate{dupes > 1 ? 's' : ''}
              </Button>
            )}
            <Button
              size="sm"
              variant="quiet"
              icon={<Trash2 />}
              onClick={() => setConfirmClear(true)}
            >
              Clear
            </Button>
          </>
        )}
        <Button size="sm" icon={<Zap />} onClick={() => openTrade({ quick: true })} kbd="Q">
          Quick log
        </Button>
        <Button size="sm" variant="primary" icon={<Plus />} onClick={() => openTrade()} kbd="N">
          Log trade
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
        title="Clear all trades?"
        description="This removes every trade from this browser. Export a CSV first if you want a backup."
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setConfirmClear(false)}>
            Keep them
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearAll()
              setConfirmClear(false)
              toast('All trades cleared', 'info')
            }}
          >
            Clear all
          </Button>
        </div>
      </Modal>
    </motion.div>
  )
}

export function JournalEmpty() {
  const openTrade = useUi((s) => s.openTrade)
  const loadDemo = useTrades((s) => s.loadDemo)
  return (
    <EmptyState
      icon={<NotebookPen />}
      title="Your journal is empty"
      body="Log your first trade, or load 60 realistic demo trades to explore every chart and the calendar."
      action={
        <>
          <Button variant="primary" icon={<Plus />} onClick={() => openTrade()}>
            Log first trade
          </Button>
          <Button
            icon={<Sparkles />}
            onClick={() => {
              loadDemo()
              toast('Loaded 60 demo trades')
            }}
          >
            Load demo data
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

function TradeList({ trades }: { trades: Trade[] }) {
  const openTrade = useUi((s) => s.openTrade)
  const [limit, setLimit] = useState(PAGE)
  return (
    <Card padded={false} className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="hidden text-left sm:table-header-group">
          <tr className="border-b hairline">
            {['Date', 'Symbol', 'Setup', 'Session', 'R', 'P&L'].map((h, i) => (
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
              <motion.tr
                key={t.id}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => openTrade({ editId: t.id })}
                onKeyDown={(e) => e.key === 'Enter' && openTrade({ editId: t.id })}
                tabIndex={0}
                className="cursor-pointer transition-colors hover:bg-line/5 focus-visible:bg-line/5"
              >
                <td className="py-3 pr-2 pl-4 text-xs text-muted sm:px-4 sm:text-sm">
                  <span className="tabular whitespace-nowrap">
                    {format(new Date(t.openedAt), 'MMM d, HH:mm')}
                  </span>
                </td>
                <td className="px-2 py-3 sm:px-4">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{t.symbol}</span>
                    <SideBadge t={t} />
                    {!t.rulesFollowed && (
                      <span
                        className="size-1.5 rounded-full bg-neg"
                        title="Rules broken"
                        aria-label="Rules broken"
                      />
                    )}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">{t.setup ?? '—'}</td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">
                  {t.session ? SESSION_LABEL[t.session] : '—'}
                </td>
                <td className="tabular hidden px-4 py-3 text-right text-muted sm:table-cell">
                  {formatR(tradeR(t))}
                </td>
                <td className="py-3 pr-4 pl-2 text-right whitespace-nowrap sm:px-4">
                  <Pnl value={t.pnl} />
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
      {trades.length > limit && (
        <div className="border-t hairline p-3 text-center">
          <Button size="sm" variant="quiet" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, trades.length - limit)} more
          </Button>
        </div>
      )}
    </Card>
  )
}

function TradeGrid({ trades }: { trades: Trade[] }) {
  const openTrade = useUi((s) => s.openTrade)
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
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {format(new Date(t.openedAt), 'EEE d MMM, HH:mm')}
                </p>
              </div>
              <Pnl value={t.pnl} className="text-base" />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {t.setup && (
                <span className="rounded-full bg-line/8 px-2 py-0.5 text-muted">{t.setup}</span>
              )}
              {t.emotion && (
                <span className="rounded-full bg-line/8 px-2 py-0.5 text-muted">{t.emotion}</span>
              )}
              <span className="rounded-full bg-line/8 px-2 py-0.5 text-muted">
                {formatR(tradeR(t))}
              </span>
              {!t.rulesFollowed && (
                <span className="rounded-full bg-neg/12 px-2 py-0.5 text-neg">Rules broken</span>
              )}
            </div>
            {t.notes && <p className="mt-3 line-clamp-2 text-sm text-muted">{t.notes}</p>}
          </Card>
        ))}
      </motion.div>
      {trades.length > limit && (
        <div className="text-center">
          <Button size="sm" variant="quiet" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </Button>
        </div>
      )}
    </>
  )
}

function PeriodList({ trades, period }: { trades: Trade[]; period: 'day' | 'week' }) {
  const days = useJournal((s) => s.days)
  const openDay = useUi((s) => s.openCalendarDay)
  const groups = useMemo(() => {
    const map = new Map<string, Trade[]>()
    for (const t of trades) {
      const d = new Date(t.openedAt)
      const k = period === 'day' ? dateKey(d) : dateKey(startOfWeek(d, { weekStartsOn: 1 }))
      map.set(k, [...(map.get(k) ?? []), t])
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [trades, period])

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
                    ? format(start, 'EEEE, d MMMM')
                    : `${format(start, 'd MMM')} – ${format(endOfWeek(start, { weekStartsOn: 1 }), 'd MMM yyyy')}`}
                </p>
                <p className="text-xs text-muted">
                  {s.count} trade{s.count === 1 ? '' : 's'} · {s.wins}W {s.losses}L · win rate{' '}
                  {formatPercent(s.winRate, 0)}
                  {period === 'week' &&
                    ` · PF ${Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Pnl value={s.totalPnl} className="text-lg" />
                {period === 'day' && (
                  <Button size="sm" variant="quiet" onClick={() => openDay(k)}>
                    Open day
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
