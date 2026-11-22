import { tr } from '@/i18n'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { positionSize, tradePnl } from '@/lib/finance/position'
import { formatCurrency, formatFixed, formatNumber, parseNum } from '@/lib/format'
import type { Direction } from '@/lib/types'
import { useSettings } from '@/store/settings'
import { useAccountSummary, useTradeList } from '@/data/useTradeData'
import { ConversionField, NumField, Output, SymbolSelect } from './shared'
import { unitName } from './units'

const EXAMPLES: Record<string, { entry: string; stop: string; tp: string }> = {
  XAUUSD: { entry: '2650.00', stop: '2645.00', tp: '2665.00' },
  NAS100: { entry: '20800', stop: '20760', tp: '20900' },
  US30: { entry: '43800', stop: '43720', tp: '44000' },
  SPX500: { entry: '5950', stop: '5935', tp: '5990' },
  BTCUSD: { entry: '95000', stop: '94000', tp: '97500' },
  USDJPY: { entry: '153.40', stop: '153.20', tp: '153.90' },
  GBPJPY: { entry: '194.50', stop: '194.20', tp: '195.25' },
}
const fxExample = { entry: '1.08500', stop: '1.08300', tp: '1.09000' }

export function PositionSizeCalc() {
  const specs = useSettings((s) => s.symbolSpecs)
  const summary = useAccountSummary(useTradeList())
  const [symbol, setSymbol] = useState('XAUUSD')
  const spec = specs.find((s) => s.symbol === symbol) ?? specs[0]
  const [balance, setBalance] = useState(String(Math.round(summary.balance * 100) / 100))
  const [mode, setMode] = useState<'percent' | 'amount'>('percent')
  const [risk, setRisk] = useState('1')
  const ex = EXAMPLES[symbol] ?? fxExample
  const [entry, setEntry] = useState(ex.entry)
  const [stop, setStop] = useState(ex.stop)
  const [tp, setTp] = useState(ex.tp)
  const [leverage, setLeverage] = useState('100')
  const [rate, setRate] = useState(String(spec.conversionRate))

  const changeSymbol = (s: string) => {
    setSymbol(s)
    const e = EXAMPLES[s] ?? fxExample
    setEntry(e.entry)
    setStop(e.stop)
    setTp(e.tp)
    setRate(String(specs.find((x) => x.symbol === s)?.conversionRate ?? 1))
  }

  const r = positionSize({
    spec,
    balance: parseNum(balance) ?? 0,
    riskMode: mode,
    risk: parseNum(risk) ?? 0,
    entry: parseNum(entry) ?? 0,
    stop: parseNum(stop) ?? 0,
    takeProfit: parseNum(tp),
    leverage: parseNum(leverage),
    conversionRate: parseNum(rate),
  })
  const unit = unitName(spec)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card label={tr('calc.inputs')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <SymbolSelect value={symbol} onChange={changeSymbol} />
          </div>
          <NumField label={tr('calc.balance')} value={balance} onChange={setBalance} suffix="USD" />
          <div className="flex flex-col gap-1.5">
            <span className="label">{tr('calc.risk')}</span>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                className="field tabular"
                aria-label={mode === 'percent' ? tr('calc.riskPercent') : tr('calc.riskAmount')}
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
              />
              <Segmented
                label={tr('calc.riskMode')}
                size="sm"
                value={mode}
                onChange={setMode}
                className="shrink-0 items-center"
                options={[
                  { value: 'percent', label: '%' },
                  { value: 'amount', label: '$' },
                ]}
              />
            </div>
          </div>
          <NumField label={tr('calc.entry')} value={entry} onChange={setEntry} />
          <NumField label={tr('calc.stopLoss')} value={stop} onChange={setStop} />
          <NumField label={tr('calc.tpOptional')} value={tp} onChange={setTp} />
          <NumField
            label={tr('calc.leverage')}
            value={leverage}
            onChange={setLeverage}
            suffix=":1"
          />
          <div className="col-span-2">
            <ConversionField spec={spec} value={rate} onChange={setRate} />
          </div>
        </div>
      </Card>
      <Card
        label={tr('calc.position')}
        action={
          r && (
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${r.direction === 'long' ? 'bg-pos/12 text-pos' : 'bg-neg/12 text-neg'}`}
            >
              {r.direction}
            </span>
          )
        }
      >
        {r ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Output
              big
              label={tr('calc.lotSize')}
              value={formatFixed(r.lots, 2)}
              sub={
                r.lots === 0
                  ? tr('calc.tooSmall')
                  : `${formatNumber(r.lots * spec.contractSize, 2)} units · raw ${formatNumber(r.rawLots, 3)}`
              }
            />
            <Output
              label={tr('calc.risk')}
              value={formatCurrency(r.riskActual)}
              sub={`${formatNumber(r.riskPercentActual, 2)}% of balance · target ${formatCurrency(r.riskTarget)}`}
              tone="neg"
            />
            <Output
              label={tr('calc.stopDistance')}
              value={`${formatNumber(r.pips, 1)} ${unit}`}
              sub={`${formatNumber(r.distance, spec.digits)} in price`}
            />
            <Output
              label={`Value per ${unit === 'pips' ? 'pip' : 'point'}`}
              value={formatCurrency(r.pipValue)}
              sub={tr('calc.atLot')}
            />
            <Output
              label={tr('calc.rrToTarget')}
              value={r.rr !== null ? `1 : ${formatNumber(r.rr, 2)}` : '—'}
              sub={r.reward !== null ? `Reward ${formatCurrency(r.reward)}` : tr('calc.addTp')}
              tone={r.rr !== null && r.rr > 0 ? 'pos' : undefined}
            />
            <Output
              label={tr('calc.margin')}
              value={r.margin !== null ? formatCurrency(r.margin) : '—'}
              sub={`Notional ${formatCurrency(r.notional, { compact: r.notional > 1e6 })}`}
            />
          </div>
        ) : (
          <p className="text-sm text-muted">{tr('calc.enterAll')}</p>
        )}
        <p className="mt-4 text-xs text-muted">
          Uses {spec.symbol} spec: {formatNumber(spec.contractSize)} per lot, tick {spec.tickSize} ={' '}
          {spec.tickValue} {spec.quoteCurrency}. Lots round down to 0.01 so risk never exceeds your
          target. Edit specs in the Symbol specs tab.
        </p>
      </Card>
    </div>
  )
}

export function PnlCalc() {
  const specs = useSettings((s) => s.symbolSpecs)
  const [symbol, setSymbol] = useState('XAUUSD')
  const spec = specs.find((s) => s.symbol === symbol) ?? specs[0]
  const [direction, setDirection] = useState<Direction>('long')
  const [entry, setEntry] = useState('2650')
  const [exit, setExit] = useState('2662.5')
  const [lots, setLots] = useState('0.20')
  const [fees, setFees] = useState('1.40')
  const [rate, setRate] = useState(String(spec.conversionRate))
  const e = parseNum(entry)
  const x = parseNum(exit)
  const l = parseNum(lots)
  const r =
    e !== undefined && x !== undefined && l !== undefined
      ? tradePnl({
          spec,
          direction,
          entry: e,
          exit: x,
          lots: l,
          fees: parseNum(fees) ?? 0,
          conversionRate: parseNum(rate),
        })
      : null
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card label={tr('calc.inputs')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <SymbolSelect
              value={symbol}
              onChange={(s) => {
                setSymbol(s)
                setRate(String(specs.find((v) => v.symbol === s)?.conversionRate ?? 1))
              }}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <span className="label">{tr('trade.direction')}</span>
            <Segmented
              label={tr('trade.direction')}
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'long', label: tr('common.long') },
                { value: 'short', label: tr('common.short') },
              ]}
            />
          </div>
          <NumField label={tr('calc.entry')} value={entry} onChange={setEntry} />
          <NumField label={tr('calc.exit')} value={exit} onChange={setExit} />
          <NumField label={tr('calc.lots')} value={lots} onChange={setLots} />
          <NumField label={tr('calc.fees')} value={fees} onChange={setFees} suffix="USD" />
          <div className="col-span-2">
            <ConversionField spec={spec} value={rate} onChange={setRate} />
          </div>
        </div>
      </Card>
      <Card label={tr('calc.result')}>
        {r ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Output
              big
              label={tr('calc.netPnl')}
              value={formatCurrency(r.net, { signed: true })}
              tone={r.net >= 0 ? 'pos' : 'neg'}
            />
            <Output label={tr('calc.gross')} value={formatCurrency(r.gross, { signed: true })} />
            <Output
              label={`Move (${unitName(spec)})`}
              value={formatNumber(r.pips, 1)}
              sub={`${formatNumber(r.priceMove, spec.digits)} in price`}
            />
          </div>
        ) : (
          <p className="text-sm text-muted">{tr('calc.enterExit')}</p>
        )}
      </Card>
    </div>
  )
}
