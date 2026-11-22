import { fmtDate, tn, tr } from '@/i18n'
import { addDays, isSameDay, startOfWeek } from 'date-fns'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Flame, PlugZap, Plus, Snowflake, Sparkles } from 'lucide-react'
import { useCallback, useMemo, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CountUp } from '@/components/ui/CountUp'
import { EmptyState } from '@/components/ui/controls'
import { toast } from '@/components/ui/toastStore'
import { stagger } from '@/components/motion'
import { computeStats, dailySummaries, equityCurve } from '@/lib/finance/metrics'
import { dateKey, formatCurrency, formatNumber, formatPercent } from '@/lib/format'
import { useThemeColors } from '@/features/theme/useThemeColors'
import { useSettings } from '@/store/settings'
import { useTrades } from '@/store/trades'
import { useUi } from '@/store/ui'
import { dayKeyInZone } from '@/lib/mt5/tz'
import type { Trade } from '@/lib/types'
import {
  useAccountSummary,
  useCloudActive,
  useSelectedAccounts,
  useTimezone,
  useTradeList,
} from '@/data/useTradeData'

export default function DashboardPage() {
  const trades = useTradeList()
  const summary = useAccountSummary(trades)
  const stats = useMemo(
    () => computeStats(trades, summary.startingBalance ?? 0),
    [trades, summary.startingBalance],
  )
  const open = trades.filter((t) => t.status === 'open').length

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
      <Hero total={stats.totalPnl} count={stats.count} open={open} trades={trades} />
      {trades.length === 0 ? (
        <Card>
          <DashboardEmpty />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <WinRateCard rate={stats.winRate} wins={stats.wins} losses={stats.losses} />
            <AvgRRCard r={stats.avgWinR} />
            <Metric
              label={tr('dash.profitFactor')}
              value={stats.profitFactor}
              format={(v) => (Number.isFinite(v) ? v.toFixed(2) : '∞')}
              sub={
                stats.profitFactor >= 1.5
                  ? tr('dash.healthyEdge')
                  : stats.profitFactor >= 1
                    ? tr('dash.marginalEdge')
                    : tr('dash.losingEdge')
              }
            />
            <StreakCard streak={stats.streak} />
            <AvgWinLossCard win={stats.avgWin} loss={stats.avgLoss} />
            <Metric
              label={tr('dash.expectancy')}
              money
              value={stats.expectancy}
              signed
              sub={tr('dash.avgNet')}
            />
            <Metric
              label={tr('dash.maxDrawdown')}
              money
              value={-stats.maxDrawdown}
              sub={tr('dash.fromPeak', { pct: formatPercent(stats.maxDrawdownPct) })}
            />
            <Metric
              label={tr('dash.trades')}
              value={stats.count}
              format={(v) => formatNumber(v, 0)}
              sub={`${tr('dash.winsLosses', { w: stats.wins, l: stats.losses })}${stats.breakeven ? ` · ${tr('dash.be', { n: stats.breakeven })}` : ''}`}
            />
          </div>
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <EquityCard trades={trades} />
            <WeekCard trades={trades} />
          </div>
        </>
      )}
    </motion.div>
  )
}

function Hero({
  total,
  count,
  open,
  trades,
}: {
  total: number
  count: number
  open: number
  trades: Trade[]
}) {
  const hidden = useSettings((s) => s.hideBalances)
  const toggle = useSettings((s) => s.toggleHideBalances)
  const setStart = useSettings((s) => s.setStartingBalance)
  const summary = useAccountSummary(trades)
  const accounts = useSelectedAccounts()
  const fmt = useCallback((v: number) => formatCurrency(v, { hidden, signed: true }), [hidden])
  const balanceFmt = useCallback((v: number) => formatCurrency(v, { hidden }), [hidden])
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? tr('dash.morning') : hour < 18 ? tr('dash.afternoon') : tr('dash.evening')
  const floating = summary.equity === null ? null : summary.equity - summary.balance
  return (
    <Card className="overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full opacity-40 blur-3xl"
        style={{
          background: `radial-gradient(circle, rgb(var(${total >= 0 ? '--pos-rgb' : '--neg-rgb'}) / 0.5), transparent 70%)`,
        }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-muted">
            {greeting}. <span className="serif text-fg">{tr('dash.tradePlan')}</span>
          </p>
          <div className="mt-4 flex items-center gap-2">
            <p className="label">{tr('dash.totalPnl')}</p>
            <IconButton
              size="sm"
              label={hidden ? tr('dash.showPnl') : tr('dash.hidePnl')}
              onClick={toggle}
            >
              {hidden ? <EyeOff /> : <Eye />}
            </IconButton>
          </div>
          <p
            className={`serif mt-1 text-5xl leading-none tracking-tight sm:text-6xl ${total > 0 ? 'text-pos' : total < 0 ? 'text-neg' : 'text-fg'}`}
          >
            <CountUp value={total} format={fmt} />
          </p>
          <p className="mt-3 text-sm text-muted">
            {tn('n.closedTrades', count)}
            {open > 0 && ` · ${tr('dash.openCount', { n: open })}`}
            {' · '}
            {summary.returnPct !== null && !hidden
              ? `${tr('dash.return', { pct: formatPercent(summary.returnPct, 2) })} ${summary.live ? tr('dash.depositsExcluded') : tr('dash.onStarting')}`
              : tr('dash.netOfFees')}
          </p>
        </div>
        {summary.live ? (
          <div className="flex flex-wrap items-end gap-6 sm:flex-col sm:items-end sm:gap-1">
            <div className="sm:text-right">
              <p className="label">{tr('dash.balance')}</p>
              <p className="tabular text-2xl font-semibold tracking-tight">
                <CountUp value={summary.balance} format={balanceFmt} />
              </p>
            </div>
            {summary.equity !== null && (
              <div className="sm:text-right">
                <p className="label">{tr('dash.equity')}</p>
                <p className="tabular text-lg font-medium tracking-tight">
                  <CountUp value={summary.equity} format={balanceFmt} />
                  {floating !== null && Math.abs(floating) >= 0.01 && (
                    <span className={`ml-2 text-xs ${floating > 0 ? 'text-pos' : 'text-neg'}`}>
                      {tr('dash.floating', {
                        v: formatCurrency(floating, { hidden, signed: true }),
                      })}
                    </span>
                  )}
                </p>
              </div>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="rounded bg-accent/15 px-1.5 py-px text-[0.6rem] font-semibold tracking-wide text-accent">
                MT5
              </span>
              {accounts.length === 1 ? accounts[0].name : tn('n.accounts', accounts.length)}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <p className="label">{tr('dash.accountBalance')}</p>
            <p className="tabular text-2xl font-semibold tracking-tight">
              <CountUp value={summary.balance} format={balanceFmt} />
            </p>
            <label className="flex items-center gap-2 text-xs text-muted">
              {tr('dash.starting')}
              <input
                type="number"
                min={0}
                className="field h-7 w-28 text-xs"
                value={hidden ? '' : (summary.startingBalance ?? 0)}
                placeholder={hidden ? '••••' : ''}
                disabled={hidden}
                onChange={(e) => setStart(Math.max(0, Number(e.target.value) || 0))}
                aria-label={tr('dash.startingBalance')}
              />
            </label>
          </div>
        )}
      </div>
    </Card>
  )
}

function DashboardEmpty() {
  const openTrade = useUi((s) => s.openTrade)
  const openSettings = useUi((s) => s.openSettings)
  const loadDemo = useTrades((s) => s.loadDemo)
  const cloud = useCloudActive()
  return (
    <EmptyState
      icon={cloud ? <PlugZap /> : <Sparkles />}
      title={cloud ? tr('dash.emptyCloudTitle') : tr('dash.emptyTitle')}
      body={
        cloud
          ? 'Attach the TradeDeskSync EA to your XM terminal. Every closed trade, your balance and daily P&L then appear here within seconds.'
          : 'Win rate, profit factor, expectancy, drawdown and your equity curve are calculated from your journal. Log a trade or explore with demo data.'
      }
      action={
        cloud ? (
          <>
            <Button variant="primary" icon={<PlugZap />} onClick={() => openSettings('accounts')}>
              {tr('dash.connectMt5')}
            </Button>
            <Button icon={<Plus />} onClick={() => openTrade()}>
              {tr('dash.logManual')}
            </Button>
          </>
        ) : (
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
        )
      }
    />
  )
}

function Metric({
  label,
  value,
  sub,
  money,
  signed,
  format: fmtProp,
}: {
  label: string
  value: number
  sub?: ReactNode
  money?: boolean
  signed?: boolean
  format?: (v: number) => string
}) {
  const hidden = useSettings((s) => s.hideBalances)
  const fmt = useCallback(
    (v: number) => (fmtProp ? fmtProp(v) : formatCurrency(v, { hidden, signed })),
    [fmtProp, hidden, signed],
  )
  const tone = money ? (value > 0 ? 'text-pos' : value < 0 ? 'text-neg' : '') : ''
  return (
    <Card lift padded className="flex flex-col">
      <p className="label">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem] ${tone}`}>
        <CountUp value={value} format={fmt} />
      </p>
      {sub && <p className="mt-auto pt-1 text-xs text-muted">{sub}</p>}
    </Card>
  )
}

function WinRateCard({ rate, wins, losses }: { rate: number; wins: number; losses: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const fmt = useCallback((v: number) => formatPercent(v, 0), [])
  return (
    <Card lift className="flex items-center justify-between gap-3">
      <div>
        <p className="label">{tr('dash.winRate')}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          <CountUp value={rate} format={fmt} />
        </p>
        <p className="pt-1 text-xs text-muted">{tr('dash.winsLosses', { w: wins, l: losses })}</p>
      </div>
      <svg
        viewBox="0 0 64 64"
        className="size-12 shrink-0 -rotate-90 sm:size-[4.5rem]"
        role="img"
        aria-label={`${tr('dash.winRate')} ${Math.round(rate * 100)}%`}
      >
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="rgb(var(--neg-rgb) / 0.35)"
          strokeWidth="6"
        />
        <motion.circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--pos)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - rate) }}
          transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.15 }}
        />
      </svg>
    </Card>
  )
}

function AvgRRCard({ r }: { r: number }) {
  const max = 4
  const pct = Math.min(1, Math.max(0, r / max))
  const fmt = useCallback((v: number) => `${v.toFixed(2)}R`, [])
  return (
    <Card lift className="flex flex-col">
      <p className="label">{tr('dash.avgWinRR')}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
        <CountUp value={r} format={fmt} />
      </p>
      <div className="mt-auto pt-3">
        <div
          className="relative h-1.5 rounded-full bg-line/10"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Number(r.toFixed(2))}
          aria-label={tr('dash.avgWinRAria')}
        >
          <motion.div
            className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
            style={{
              background: 'linear-gradient(90deg, rgb(var(--accent-rgb) / .5), var(--accent))',
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: pct }}
            transition={{ type: 'spring', stiffness: 70, damping: 18, delay: 0.1 }}
          />
          <motion.div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow"
            initial={{ left: '0%' }}
            animate={{ left: `${pct * 100}%` }}
            transition={{ type: 'spring', stiffness: 70, damping: 18, delay: 0.1 }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[0.65rem] text-muted">
          <span>0R</span>
          <span>2R</span>
          <span>4R+</span>
        </div>
      </div>
    </Card>
  )
}

function StreakCard({ streak }: { streak: { kind: 'win' | 'loss' | 'none'; count: number } }) {
  const fmt = useCallback((v: number) => formatNumber(Math.round(v), 0), [])
  return (
    <Card lift className="flex flex-col">
      <p className="label">{tr('dash.streak')}</p>
      <p className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
        <CountUp value={streak.count} format={fmt} />
        <span
          className={`text-base font-medium ${streak.kind === 'win' ? 'text-pos' : streak.kind === 'loss' ? 'text-neg' : 'text-muted'}`}
        >
          {streak.kind === 'none'
            ? ''
            : streak.kind === 'win'
              ? streak.count === 1
                ? tr('dash.win')
                : tr('dash.wins')
              : streak.count === 1
                ? tr('dash.loss')
                : tr('dash.losses')}
        </span>
        {streak.kind === 'win' ? (
          <Flame className="size-5 text-pos" aria-hidden />
        ) : streak.kind === 'loss' ? (
          <Snowflake className="size-5 text-neg" aria-hidden />
        ) : null}
      </p>
      <p className="mt-auto pt-1 text-xs text-muted">
        {streak.kind === 'loss' && streak.count >= 2 ? tr('dash.stepAway') : tr('dash.process')}
      </p>
    </Card>
  )
}

function AvgWinLossCard({ win, loss }: { win: number; loss: number }) {
  const hidden = useSettings((s) => s.hideBalances)
  const total = win + loss || 1
  return (
    <Card lift className="flex flex-col">
      <p className="label">{tr('dash.avgWinLoss')}</p>
      <p className="tabular mt-2 flex items-baseline gap-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
        <span className="text-pos">{formatCurrency(win, { hidden, compact: win >= 10000 })}</span>
        <span className="text-sm text-muted">/</span>
        <span className="text-neg">{formatCurrency(loss, { hidden, compact: loss >= 10000 })}</span>
      </p>
      <div className="mt-auto flex gap-0.5 pt-3" aria-hidden>
        <motion.div
          className="h-1.5 origin-left rounded-full bg-pos"
          style={{ width: `${(win / total) * 100}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <motion.div
          className="h-1.5 origin-right rounded-full bg-neg"
          style={{ width: `${(loss / total) * 100}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <p className="pt-1.5 text-xs text-muted">
        {tr('dash.payoff', { v: loss > 0 ? (win / loss).toFixed(2) : '—' })}
      </p>
    </Card>
  )
}

interface TipProps {
  active?: boolean
  payload?: { payload: { equity: number; date: string; pnl: number; index: number } }[]
}

function EquityTooltip({ active, payload }: TipProps) {
  const hidden = useSettings((s) => s.hideBalances)
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="glass glass-strong rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-muted">
        {tr('dash.tradeN', { n: p.index })} · {fmtDate(new Date(p.date), 'd MMM yyyy')}
      </p>
      <p className="tabular mt-0.5 text-sm font-semibold text-fg">
        {formatCurrency(p.equity, { hidden, signed: true })}
      </p>
      <p className="tabular text-muted">
        {tr('dash.thisTrade', { v: formatCurrency(p.pnl, { hidden, signed: true }) })}
      </p>
    </div>
  )
}

function EquityCard({ trades }: { trades: Trade[] }) {
  const hidden = useSettings((s) => s.hideBalances)
  const c = useThemeColors()
  const data = useMemo(
    () => [
      {
        index: 0,
        date: equityCurve(trades)[0]?.date ?? new Date().toISOString(),
        equity: 0,
        pnl: 0,
      },
      ...equityCurve(trades),
    ],
    [trades],
  )
  const last = data[data.length - 1]?.equity ?? 0
  const color = last >= 0 ? c.pos : c.neg
  return (
    <Card
      label={tr('dash.cumulative')}
      action={
        <span className="tabular text-sm text-muted">
          {formatCurrency(last, { hidden, signed: true })}
        </span>
      }
    >
      <div
        className="h-64 sm:h-72"
        role="img"
        aria-label={`Equity curve over ${trades.length} trades, ending at ${formatCurrency(last, { hidden, signed: true })}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={c.line} vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fill: c.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              tick={{ fill: c.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={hidden ? 30 : 56}
              tickFormatter={(v: number) => (hidden ? '•' : formatCurrency(v, { compact: true }))}
            />
            <ReferenceLine y={0} stroke={c.lineStrong} strokeDasharray="3 3" />
            <Tooltip
              content={<EquityTooltip />}
              cursor={{ stroke: c.lineStrong, strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={color}
              strokeWidth={2}
              fill="url(#eq)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: c.text, fill: color }}
              isAnimationActive
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function WeekCard({ trades }: { trades: Trade[] }) {
  const tz = useTimezone()
  const hidden = useSettings((s) => s.hideBalances)
  const summaries = useMemo(() => dailySummaries(trades, tz), [trades, tz])
  // 'Today' in the user's time zone, as a local Date for the week grid.
  const today = new Date(`${dayKeyInZone(new Date(), tz)}T00:00:00`)
  const start = startOfWeek(today, { weekStartsOn: 1 })
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = addDays(start, i)
    return { d, s: summaries.get(dateKey(d)) }
  })
  const total = days.reduce((a, x) => a + (x.s?.pnl ?? 0), 0)
  const count = days.reduce((a, x) => a + (x.s?.count ?? 0), 0)
  const wins = days.reduce((a, x) => a + (x.s?.wins ?? 0), 0)
  const max = Math.max(1, ...days.map((x) => Math.abs(x.s?.pnl ?? 0)))
  return (
    <Card
      label={tr('dash.thisWeek')}
      action={
        <span
          className={`tabular text-sm font-semibold ${total > 0 ? 'text-pos' : total < 0 ? 'text-neg' : 'text-muted'}`}
        >
          {formatCurrency(total, { hidden, signed: true })}
        </span>
      }
    >
      <div className="flex h-44 items-stretch gap-2">
        {days.map(({ d, s }) => {
          const h = s ? Math.abs(s.pnl) / max : 0
          const up = (s?.pnl ?? 0) >= 0
          return (
            <div
              key={d.toISOString()}
              className="group relative flex flex-1 flex-col items-center"
              title={
                s
                  ? `${fmtDate(d, 'EEE d MMM')}: ${formatCurrency(s.pnl, { hidden, signed: true })} · ${tn('n.trades', s.count)}`
                  : `${fmtDate(d, 'EEE d MMM')}: ${tr('dash.noTrades')}`
              }
            >
              <div className="relative w-full flex-1">
                <div className="absolute inset-x-0 top-1/2 h-px bg-line/15" />
                {s && (
                  <motion.div
                    className={`absolute inset-x-[26%] rounded-[4px] ${up ? 'bottom-1/2 origin-bottom bg-pos' : 'top-1/2 origin-top bg-neg'}`}
                    style={{ height: `${Math.max(4, h * 50)}%` }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                  />
                )}
              </div>
              <span
                className={`mt-1 text-xs ${isSameDay(d, today) ? 'font-semibold text-accent' : 'text-muted'}`}
              >
                {fmtDate(d, 'EEE')}
              </span>
              <span className="tabular text-[0.65rem] text-muted">
                {s
                  ? formatCurrency(s.pnl, {
                      hidden,
                      signed: true,
                      compact: Math.abs(s.pnl) >= 1000,
                    })
                  : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t hairline pt-3 text-center">
        <div>
          <p className="label">{tr('dash.trades')}</p>
          <p className="tabular font-semibold">{count}</p>
        </div>
        <div>
          <p className="label">{tr('dash.wins2')}</p>
          <p className="tabular font-semibold">{wins}</p>
        </div>
        <div>
          <p className="label">{tr('dash.winRate')}</p>
          <p className="tabular font-semibold">{count ? formatPercent(wins / count, 0) : '—'}</p>
        </div>
      </div>
    </Card>
  )
}
