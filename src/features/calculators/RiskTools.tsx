import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { plannedRR } from '@/lib/finance/position'
import {
  breakEvenWinRate,
  compoundProjection,
  drawdownRecoveryTable,
  expectancyR,
  lossesToDrawdown,
  riskOfRuin,
} from '@/lib/finance/tools'
import { formatCurrency, formatNumber, formatPercent, parseNum } from '@/lib/format'
import { useThemeColors } from '@/features/theme/useThemeColors'
import { NumField, Output } from './shared'

export function RRCalc() {
  const [entry, setEntry] = useState('2650')
  const [stop, setStop] = useState('2645')
  const [tp, setTp] = useState('2665')
  const [wr, setWr] = useState('45')
  const rr = plannedRR(parseNum(entry) ?? 0, parseNum(stop) ?? 0, parseNum(tp) ?? 0)
  const p = (parseNum(wr) ?? 0) / 100
  const be = rr ? breakEvenWinRate(rr) : undefined
  const exp = rr ? expectancyR(p, rr) : undefined
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card label="Reward : risk">
        <div className="grid grid-cols-3 gap-3">
          <NumField label="Entry" value={entry} onChange={setEntry} />
          <NumField label="Stop" value={stop} onChange={setStop} />
          <NumField label="Target" value={tp} onChange={setTp} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Output big label="RR" value={rr ? `1 : ${formatNumber(rr, 2)}` : '—'} />
          <Output
            label="Break-even win rate"
            value={be ? formatPercent(be) : '—'}
            sub="1 ÷ (1 + RR), before costs"
          />
        </div>
        <div className="mt-4">
          <NumField label="Your win rate" value={wr} onChange={setWr} suffix="%" />
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Output
              label="Expectancy"
              value={
                exp !== undefined
                  ? `${exp >= 0 ? '+' : '−'}${formatNumber(Math.abs(exp), 2)}R`
                  : '—'
              }
              sub="per trade = p·RR − (1−p)"
              tone={exp !== undefined ? (exp >= 0 ? 'pos' : 'neg') : undefined}
            />
            <Output
              label="Edge vs break-even"
              value={
                be
                  ? `${p - be >= 0 ? '+' : '−'}${formatNumber(Math.abs(p - be) * 100, 1)} pts`
                  : '—'
              }
            />
          </div>
        </div>
      </Card>
      <Card label="Break-even table" padded={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b hairline text-left">
              <th scope="col" className="label px-5 py-2.5">
                RR
              </th>
              <th scope="col" className="label px-5 py-2.5 text-right">
                Break-even
              </th>
              <th scope="col" className="label px-5 py-2.5 text-right">
                At {formatNumber(p * 100, 0)}% win
              </th>
            </tr>
          </thead>
          <tbody className="divide-hairline">
            {[0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((x) => {
              const e = expectancyR(p, x)
              return (
                <tr key={x} className={rr && Math.abs(rr - x) < 0.25 ? 'bg-accent/8' : ''}>
                  <td className="tabular px-5 py-2">1 : {x}</td>
                  <td className="tabular px-5 py-2 text-right text-muted">
                    {formatPercent(breakEvenWinRate(x))}
                  </td>
                  <td
                    className={`tabular px-5 py-2 text-right ${e >= 0 ? 'text-pos' : 'text-neg'}`}
                  >
                    {e >= 0 ? '+' : '−'}
                    {Math.abs(e).toFixed(2)}R
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export function RuinCalc() {
  const [wr, setWr] = useState('50')
  const [rr, setRr] = useState('1.5')
  const [risk, setRisk] = useState('1')
  const [dd, setDd] = useState('50')
  const p = (parseNum(wr) ?? 0) / 100
  const R = parseNum(rr) ?? 0
  const r = (parseNum(risk) ?? 0) / 100
  const D = (parseNum(dd) ?? 0) / 100
  const units = lossesToDrawdown(r, D)
  const ruin = Number.isFinite(units) ? riskOfRuin(p, R, units) : NaN
  const exp = expectancyR(p, R)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card label="Risk of ruin">
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Win rate" value={wr} onChange={setWr} suffix="%" />
          <NumField label="Avg RR" value={rr} onChange={setRr} />
          <NumField label="Risk per trade" value={risk} onChange={setRisk} suffix="%" />
          <NumField label="Ruin at drawdown" value={dd} onChange={setDd} suffix="%" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Output
            big
            label="Probability of ruin"
            value={
              Number.isFinite(ruin) ? (ruin < 0.0001 ? '< 0.01%' : formatPercent(ruin, 2)) : '—'
            }
            tone={
              Number.isFinite(ruin)
                ? ruin < 0.01
                  ? 'pos'
                  : ruin > 0.1
                    ? 'neg'
                    : undefined
                : undefined
            }
          />
          <Output
            label="Losses in a row to get there"
            value={Number.isFinite(units) ? formatNumber(Math.ceil(units), 0) : '—'}
            sub={`Expectancy ${exp >= 0 ? '+' : '−'}${Math.abs(exp).toFixed(2)}R per trade`}
          />
        </div>
        <p className="mt-4 text-xs text-muted">
          Model: each trade wins +RR or loses 1 unit. Ruin probability = θ<sup>N</sup>, where θ
          solves p·θ<sup>RR+1</sup> − θ + (1−p) = 0 and N = ln(1−D) / ln(1−r). Exact for 1:1, a
          standard estimate otherwise. With no edge, ruin is certain.
        </p>
      </Card>
      <Card label="Drawdown recovery" padded={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b hairline text-left">
              <th scope="col" className="label px-5 py-2.5">
                Drawdown
              </th>
              <th scope="col" className="label px-5 py-2.5 text-right">
                Gain to recover
              </th>
              <th scope="col" className="label px-5 py-2.5 text-right">
                Losses at {formatNumber(r * 100, 1)}%
              </th>
            </tr>
          </thead>
          <tbody className="divide-hairline">
            {drawdownRecoveryTable().map((row) => (
              <tr key={row.drawdown}>
                <td className="tabular px-5 py-2 text-neg">−{formatPercent(row.drawdown, 0)}</td>
                <td className="px-5 py-2 text-right">
                  <span className="flex items-center justify-end gap-3">
                    <span
                      className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-line/8 sm:block"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, (row.recovery / 9) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular">+{formatPercent(row.recovery, 1)}</span>
                  </span>
                </td>
                <td className="tabular px-5 py-2 text-right text-muted">
                  {r > 0 ? Math.ceil(lossesToDrawdown(r, row.drawdown)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export function CompoundCalc() {
  const c = useThemeColors()
  const [start, setStart] = useState('10000')
  const [rate, setRate] = useState('3')
  const [periods, setPeriods] = useState('24')
  const [contrib, setContrib] = useState('0')
  const [unit, setUnit] = useState<'month' | 'week' | 'day'>('month')
  const data = compoundProjection(
    parseNum(start) ?? 0,
    parseNum(rate) ?? 0,
    parseNum(periods) ?? 0,
    parseNum(contrib) ?? 0,
  )
  const last = data[data.length - 1]
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <Card label="Projection">
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Starting balance" value={start} onChange={setStart} suffix="USD" />
          <NumField label={`Return per ${unit}`} value={rate} onChange={setRate} suffix="%" />
          <NumField label={`Number of ${unit}s`} value={periods} onChange={setPeriods} step="1" />
          <NumField label={`Add each ${unit}`} value={contrib} onChange={setContrib} suffix="USD" />
          <div className="col-span-2 flex flex-col gap-1.5">
            <span className="label">Period</span>
            <Segmented
              label="Period"
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Output
            big
            label="Final balance"
            value={formatCurrency(last.balance, { compact: last.balance >= 1e6 })}
          />
          <Output
            label="Growth"
            value={formatCurrency(last.gain, { signed: true, compact: Math.abs(last.gain) >= 1e6 })}
            sub={`Contributed ${formatCurrency(last.contributed, { compact: last.contributed >= 1e6 })}`}
            tone="pos"
          />
        </div>
        <p className="mt-4 text-xs text-muted">
          Balance(n) = Balance(n−1) × (1 + r) + contribution. Real returns are never this smooth.
        </p>
      </Card>
      <Card label="Balance over time">
        <div
          className="h-72"
          role="img"
          aria-label={`Compounding projection reaching ${formatCurrency(last.balance)}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.accent} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c.line} vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fill: c.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: c.muted, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={60}
                tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
              />
              <Tooltip
                cursor={{ stroke: c.lineStrong }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="glass glass-strong rounded-xl px-3 py-2 text-xs">
                      <p className="text-muted">
                        {unit[0].toUpperCase() + unit.slice(1)} {String(payload[0].payload.period)}
                      </p>
                      <p className="tabular text-sm font-semibold">
                        {formatCurrency(Number(payload[0].payload.balance))}
                      </p>
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke={c.accent}
                strokeWidth={2}
                fill="url(#cp)"
                activeDot={{ r: 4, stroke: c.text, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}
