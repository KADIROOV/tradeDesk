import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Angry,
  ChevronLeft,
  ChevronRight,
  Frown,
  Laugh,
  Meh,
  Smile,
  CalendarDays,
  Plus,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, Segmented } from '@/components/ui/controls'
import { Drawer } from '@/components/ui/Drawer'
import { stagger } from '@/components/motion'
import { computeStats, dailySummaries, tradeDay, tradeR, tradeTime } from '@/lib/finance/metrics'
import { dateKey, formatCurrency, formatInZone, formatPercent, formatR } from '@/lib/format'
import { getDay, useJournal, type Mood } from '@/store/journal'
import { useSettings } from '@/store/settings'
import { useCloud } from '@/cloud/store'
import { useSelectedAccounts, useTimezone, useTradeList } from '@/data/useTradeData'
import { dailyClosingBalances } from '@/lib/mt5/balance'
import { dayKeyInZone } from '@/lib/mt5/tz'
import { useUi } from '@/store/ui'
import { EditableChecklist } from '@/features/sidebar/Sidebar'
import { JournalEmpty } from '@/features/journal/JournalPage'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Tiny amounts for phone-sized cells: +196, −1.2k. */
function shortAmount(v: number): string {
  const a = Math.abs(v)
  const body = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : Math.round(a).toString()
  return `${v < 0 ? '−' : '+'}${body}`
}

export default function CalendarPage() {
  const trades = useTradeList()
  const tz = useTimezone()
  // Today's date in the user's zone, as a local Date for the month grid.
  const todayKey = dayKeyInZone(new Date(), tz)
  const hidden = useSettings((s) => s.hideBalances)
  const days = useJournal((s) => s.days)
  const focusDay = useUi((s) => s.calendarDay)
  const clearFocus = useUi((s) => s.openCalendarDay)
  const [month, setMonth] = useState(() =>
    startOfMonth(new Date(`${focusDay ?? dayKeyInZone(new Date(), tz)}T00:00:00`)),
  )
  const [dir, setDir] = useState(0)
  const [selected, setSelected] = useState<string | null>(focusDay)

  useEffect(() => {
    if (focusDay) clearFocus(null)
  }, [focusDay, clearFocus])

  const summaries = useMemo(() => dailySummaries(trades, tz), [trades, tz])
  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    const out: Date[][] = []
    for (let d = start; d <= end; d = addDays(d, 7))
      out.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
    return out
  }, [month])

  const monthDays = [...summaries.values()].filter((d) =>
    d.date.startsWith(format(month, 'yyyy-MM')),
  )
  const maxAbs = Math.max(1, ...[...summaries.values()].map((d) => Math.abs(d.pnl)))
  const monthTotal = monthDays.reduce((s, d) => s + d.pnl, 0)
  const greenDays = monthDays.filter((d) => d.pnl > 0).length
  const bestDay = monthDays.reduce<(typeof monthDays)[number] | null>(
    (b, d) => (d.pnl > (b?.pnl ?? 0) ? d : b),
    null,
  )
  const best = bestDay?.pnl ?? 0
  const monthTrades = monthDays.reduce((s, d) => s + d.count, 0)

  const go = (n: number) => {
    setDir(n)
    setMonth((m) => addMonths(m, n))
  }
  const years = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear(), month.getFullYear()])
    for (const t of trades) ys.add(new Date(t.openedAt).getFullYear())
    const min = Math.min(...ys)
    const max = Math.max(...ys)
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [trades, month])

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
      <motion.div variants={stagger} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Calendar</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {format(month, 'MMMM')}{' '}
            <span className="serif text-muted">{format(month, 'yyyy')}</span>
          </h1>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <IconButton label="Previous month" variant="ghost" onClick={() => go(-1)}>
            <ChevronLeft />
          </IconButton>
          <select
            aria-label="Month"
            className="field h-10 min-w-0 flex-1 sm:w-auto sm:flex-none"
            value={month.getMonth()}
            onChange={(e) => {
              const m = new Date(month.getFullYear(), Number(e.target.value), 1)
              setDir(m > month ? 1 : -1)
              setMonth(m)
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                {format(new Date(2000, i, 1), 'MMMM')}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            className="field h-10 w-24 min-w-0"
            value={month.getFullYear()}
            onChange={(e) => {
              const m = new Date(Number(e.target.value), month.getMonth(), 1)
              setDir(m > month ? 1 : -1)
              setMonth(m)
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <IconButton label="Next month" variant="ghost" onClick={() => go(1)}>
            <ChevronRight />
          </IconButton>
          <Button
            onClick={() => {
              const now = startOfMonth(new Date(`${todayKey}T00:00:00`))
              setDir(now > month ? 1 : -1)
              setMonth(now)
            }}
          >
            Today
          </Button>
        </div>
      </motion.div>

      {trades.length === 0 ? (
        <Card>
          <JournalEmpty />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Month P&L"
              value={
                <span className={monthTotal >= 0 ? 'text-pos' : 'text-neg'}>
                  {formatCurrency(monthTotal, { hidden, signed: true })}
                </span>
              }
            />
            <Stat label="Trading days" value={monthDays.length} />
            <Stat
              label="Green days"
              value={
                monthDays.length
                  ? `${greenDays} · ${formatPercent(greenDays / monthDays.length, 0)}`
                  : '—'
              }
            />
            <Stat
              label="Best day"
              value={
                <span className="text-pos">
                  {best > 0 ? formatCurrency(best, { hidden, signed: true }) : '—'}
                </span>
              }
              sub={
                bestDay
                  ? format(new Date(`${bestDay.date}T00:00:00`), 'EEEE d MMM')
                  : `${monthTrades} trades`
              }
            />
          </div>

          <Card padded="sm" className="overflow-hidden">
            <div className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.1fr)]">
              {WEEKDAYS.map((d) => (
                <div key={d} className="label px-1 pb-1 text-center">
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d[0]}</span>
                </div>
              ))}
              <div className="label hidden px-1 pb-1 text-center md:block">Week</div>
            </div>
            <div className="relative">
              <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                <motion.div
                  key={month.toISOString()}
                  custom={dir}
                  variants={{
                    enter: (d: number) => ({ opacity: 0, x: d * 40 }),
                    center: { opacity: 1, x: 0 },
                    exit: (d: number) => ({ opacity: 0, x: d * -40 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                  className="flex flex-col gap-1.5"
                >
                  {weeks.map((week) => {
                    const wk = week
                      .map((d) => summaries.get(dateKey(d)))
                      .filter((x) => !!x && isSameMonth(new Date(`${x.date}T00:00:00`), month))
                    const weekTotal = wk.reduce((s, d) => s + (d?.pnl ?? 0), 0)
                    const weekCount = wk.reduce((s, d) => s + (d?.count ?? 0), 0)
                    return (
                      <div
                        key={week[0].toISOString()}
                        className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.1fr)]"
                      >
                        {week.map((d) => {
                          const k = dateKey(d)
                          const s = summaries.get(k)
                          const inMonth = isSameMonth(d, month)
                          const hasNote = !!days[k]?.note || !!days[k]?.mood
                          const intensity = s ? 0.08 + 0.4 * Math.sqrt(Math.abs(s.pnl) / maxAbs) : 0
                          const rgb = s && s.pnl < 0 ? 'var(--neg-rgb)' : 'var(--pos-rgb)'
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setSelected(k)}
                              aria-label={`${format(d, 'EEEE d MMMM')}${s ? `, ${s.count} trades, ${formatCurrency(s.pnl, { hidden, signed: true })}` : ', no trades'}`}
                              className={`group relative flex aspect-square flex-col rounded-[calc(var(--radius-sm)-2px)] border p-1 text-left transition-transform active:scale-95 sm:aspect-[5/4] sm:p-2 ${
                                inMonth ? 'border-line/8' : 'border-transparent opacity-35'
                              } ${dateKey(d) === todayKey ? 'ring-1 ring-accent' : ''} hover:border-line/25`}
                              style={{
                                background:
                                  s && inMonth
                                    ? `rgb(${rgb} / ${intensity})`
                                    : 'rgb(var(--line-rgb) / 0.03)',
                              }}
                            >
                              <span
                                className={`tabular text-[0.7rem] font-medium sm:text-xs ${dateKey(d) === todayKey ? 'text-accent' : 'text-muted'}`}
                              >
                                {format(d, 'd')}
                              </span>
                              {hasNote && (
                                <span
                                  className="absolute top-1.5 right-1.5 size-1 rounded-full bg-accent sm:top-2 sm:right-2 sm:size-1.5"
                                  aria-hidden
                                />
                              )}
                              {s && inMonth && (
                                <span className="mt-auto flex flex-col">
                                  <span className="tabular hidden truncate text-sm font-semibold text-fg sm:block">
                                    {formatCurrency(s.pnl, {
                                      hidden,
                                      signed: true,
                                      compact: Math.abs(s.pnl) >= 1000,
                                    })}
                                  </span>
                                  <span className="tabular truncate text-[0.6rem] font-semibold text-fg sm:hidden">
                                    {hidden ? '•' : shortAmount(s.pnl)}
                                  </span>
                                  <span className="hidden text-[0.65rem] text-muted sm:block">
                                    {s.count} trade{s.count > 1 ? 's' : ''}
                                  </span>
                                </span>
                              )}
                            </button>
                          )
                        })}
                        <div className="col-span-7 flex items-center justify-between rounded-[calc(var(--radius-sm)-2px)] bg-line/5 px-3 py-1.5 md:col-span-1 md:flex-col md:items-start md:justify-center md:py-2">
                          <span className="label md:hidden">Week</span>
                          <span
                            className={`tabular text-sm font-semibold ${weekTotal > 0 ? 'text-pos' : weekTotal < 0 ? 'text-neg' : 'text-muted'}`}
                          >
                            {weekCount
                              ? formatCurrency(weekTotal, {
                                  hidden,
                                  signed: true,
                                  compact: Math.abs(weekTotal) >= 10000,
                                })
                              : '—'}
                          </span>
                          <span className="text-[0.65rem] text-muted">
                            {weekCount ? `${weekCount} trade${weekCount === 1 ? '' : 's'}` : ''}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 text-[0.65rem] text-muted">
              <span>Loss</span>
              {[0.55, 0.3, 0.1].map((a) => (
                <span
                  key={`n${a}`}
                  className="size-3 rounded"
                  style={{ background: `rgb(var(--neg-rgb) / ${a})` }}
                />
              ))}
              {[0.1, 0.3, 0.55].map((a) => (
                <span
                  key={`p${a}`}
                  className="size-3 rounded"
                  style={{ background: `rgb(var(--pos-rgb) / ${a})` }}
                />
              ))}
              <span>Profit</span>
            </div>
          </Card>
        </>
      )}
      <DayPanel day={selected} onClose={() => setSelected(null)} />
    </motion.div>
  )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card padded="sm">
      <p className="label">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </Card>
  )
}

const MOODS: { v: Mood; label: string; icon: ReactNode }[] = [
  { v: 1, label: 'Awful', icon: <Angry /> },
  { v: 2, label: 'Low', icon: <Frown /> },
  { v: 3, label: 'Okay', icon: <Meh /> },
  { v: 4, label: 'Good', icon: <Smile /> },
  { v: 5, label: 'Great', icon: <Laugh /> },
]

function DayPanel({ day, onClose }: { day: string | null; onClose: () => void }) {
  const [lastDay, setLastDay] = useState(day)
  if (day && day !== lastDay) setLastDay(day)
  const shown = day ?? lastDay
  return (
    <Drawer
      open={!!day}
      onClose={onClose}
      title={shown ? format(new Date(`${shown}T00:00:00`), 'EEEE, d MMMM') : ''}
      subtitle="Trades, notes and rules for the day"
    >
      {shown && <DayContent day={shown} />}
    </Drawer>
  )
}

function DayContent({ day }: { day: string }) {
  const trades = useTradeList()
  const tz = useTimezone()
  const accounts = useSelectedAccounts()
  const cash = useCloud((s) => s.cash)
  // Balance at the close of this day, for a single synced account.
  const closeBalance = useMemo(() => {
    if (accounts.length !== 1 || accounts[0].balance === null) return null
    const a = accounts[0]
    const deals = cash
      .filter((c) => c.account_id === a.id)
      .map((c) => ({
        time: Date.parse(c.deal_time) / 1000,
        type: c.deal_type,
        profit: c.profit,
        commission: c.commission,
        swap: c.swap,
        fee: c.fee,
      }))
    const map = dailyClosingBalances(deals, Number(a.balance), tz)
    const days = [...map.keys()].filter((k) => k <= day).sort()
    return days.length ? (map.get(days[days.length - 1]) ?? null) : null
  }, [accounts, cash, tz, day])
  const hidden = useSettings((s) => s.hideBalances)
  const openTrade = useUi((s) => s.openTrade)
  const { days, setDay, rules, toggleRule } = useJournal()
  const entry = getDay(days, day)
  const [mode, setMode] = useState<'write' | 'preview'>(entry.note ? 'preview' : 'write')
  const list = useMemo(
    () =>
      trades
        .filter((t) => t.status !== 'open' && tradeDay(t, tz) === day)
        .sort((a, b) => tradeTime(a).localeCompare(tradeTime(b))),
    [trades, day, tz],
  )
  const s = computeStats(list)
  const kept = rules.filter((r) => entry.rules[r.id]).length

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label">
            Trades
            {closeBalance !== null && (
              <span className="ml-2 font-normal tracking-normal normal-case">
                balance at close {formatCurrency(closeBalance, { hidden })}
              </span>
            )}
          </h3>
          {list.length > 0 && (
            <span
              className={`tabular text-sm font-semibold ${s.totalPnl >= 0 ? 'text-pos' : 'text-neg'}`}
            >
              {formatCurrency(s.totalPnl, { hidden, signed: true })}
            </span>
          )}
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title="No trades this day"
            body="Rest days count too. Add a note about what you observed."
          />
        ) : (
          <ul className="divide-hairline overflow-hidden rounded-[var(--radius-sm)] border border-line/10">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTrade({ editId: t.id })}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-line/5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">
                      {t.symbol}{' '}
                      <span
                        className={`text-xs uppercase ${t.direction === 'long' ? 'text-pos' : 'text-neg'}`}
                      >
                        {t.direction}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted">
                      {formatInZone(tradeTime(t), tz, 'time')} · {t.setup ?? 'No setup'} ·{' '}
                      {formatR(tradeR(t))}
                    </span>
                  </span>
                  <span className={`tabular font-medium ${t.pnl >= 0 ? 'text-pos' : 'text-neg'}`}>
                    {formatCurrency(t.pnl, { hidden, signed: true })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          variant="quiet"
          icon={<Plus />}
          className="mt-2"
          onClick={() => openTrade()}
        >
          Log a trade
        </Button>
      </section>

      <section>
        <h3 className="label mb-2">Mood</h3>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Mood">
          {MOODS.map((m) => (
            <button
              key={m.v}
              type="button"
              role="radio"
              aria-checked={entry.mood === m.v}
              aria-label={m.label}
              title={m.label}
              onClick={() => setDay(day, { mood: entry.mood === m.v ? undefined : m.v })}
              className={`grid size-10 place-items-center rounded-full border transition-transform active:scale-90 [&_svg]:size-5 ${entry.mood === m.v ? 'scale-110 border-accent/60 bg-accent/15 text-accent' : 'border-line/10 text-muted hover:text-fg'}`}
            >
              {m.icon}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label">Journal note</h3>
          <Segmented
            label="Note mode"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'write', label: 'Write' },
              { value: 'preview', label: 'Preview' },
            ]}
          />
        </div>
        {mode === 'write' ? (
          <textarea
            className="field min-h-40"
            placeholder={
              'Markdown supported.\n\n**What went well?**\n- \n\n**What to improve?**\n- '
            }
            value={entry.note}
            onChange={(e) => setDay(day, { note: e.target.value })}
            aria-label="Daily journal note"
          />
        ) : (
          <div
            className="prose-md min-h-20 rounded-[var(--radius-sm)] border border-line/10 p-3"
            onDoubleClick={() => setMode('write')}
          >
            {entry.note ? (
              <ReactMarkdown>{entry.note}</ReactMarkdown>
            ) : (
              <p className="text-muted">Nothing written yet.</p>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="label">Rules checklist</h3>
          <span className="tabular text-xs text-muted">
            {kept}/{rules.length} kept
          </span>
        </div>
        <EditableChecklist
          list="rules"
          items={rules}
          checked={entry.rules}
          onToggle={(id) => toggleRule(day, id)}
        />
      </section>
    </div>
  )
}
