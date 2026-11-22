import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/components/ui/toastStore'
import { conversionPairLabel } from '@/lib/finance/conversion'
import { pipValuePerLot, valuePerPointPerLot } from '@/lib/finance/position'
import { formatCurrency } from '@/lib/format'
import type { SymbolSpec } from '@/lib/types'
import { useSettings } from '@/store/settings'

const COLS: { key: keyof SymbolSpec; label: string; width: string }[] = [
  { key: 'contractSize', label: 'Contract size', width: 'w-28' },
  { key: 'tickSize', label: 'Tick size', width: 'w-24' },
  { key: 'tickValue', label: 'Tick value', width: 'w-24' },
  { key: 'pipSize', label: 'Pip / point', width: 'w-24' },
  { key: 'conversionRate', label: 'Conv. rate', width: 'w-24' },
]

export function SpecsTable() {
  const specs = useSettings((s) => s.symbolSpecs)
  const update = useSettings((s) => s.updateSpec)
  const reset = useSettings((s) => s.resetSpecs)
  return (
    <Card
      padded={false}
      label={
        <div className="px-5 pt-5">
          <h2 className="label">Symbol specs</h2>
          <p className="mt-1 text-sm text-muted">
            Brokers differ. Match these to your broker’s contract specification; every calculator
            and the journal’s auto P&L use them.
          </p>
        </div>
      }
      action={
        <div className="px-5 pt-5">
          <Button
            size="sm"
            variant="quiet"
            icon={<RotateCcw />}
            onClick={() => {
              reset()
              toast('Specs reset to defaults')
            }}
          >
            Reset
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-y hairline text-left">
              <th scope="col" className="label px-5 py-2.5">
                Symbol
              </th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className="label px-2 py-2.5">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="label px-2 py-2.5">
                Quote
              </th>
              <th scope="col" className="label px-5 py-2.5 text-right">
                $ per 1.0 lot
              </th>
            </tr>
          </thead>
          <tbody className="divide-hairline">
            {specs.map((s) => {
              const pair = conversionPairLabel(s.quoteCurrency)
              return (
                <tr key={s.symbol}>
                  <td className="px-5 py-2">
                    <p className="font-medium">{s.symbol}</p>
                    <p className="text-xs text-muted">{s.name}</p>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-2 py-2">
                      <input
                        type="number"
                        step="any"
                        className={`field tabular h-8 ${c.width} text-xs`}
                        aria-label={`${s.symbol} ${c.label}`}
                        key={String(s[c.key])}
                        defaultValue={String(s[c.key])}
                        disabled={c.key === 'conversionRate' && !pair}
                        title={
                          c.key === 'conversionRate'
                            ? pair
                              ? `${pair} rate`
                              : 'Quoted in USD — no conversion'
                            : undefined
                        }
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (Number.isFinite(v) && v > 0) update(s.symbol, { [c.key]: v })
                          else e.target.value = String(s[c.key])
                        }}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-xs text-muted">
                    {s.quoteCurrency}
                    {pair && <span className="block">{pair}</span>}
                  </td>
                  <td className="tabular px-5 py-2 text-right text-xs">
                    <p>{formatCurrency(valuePerPointPerLot(s))} / 1.0 move</p>
                    <p className="text-muted">{formatCurrency(pipValuePerLot(s))} / pip</p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
