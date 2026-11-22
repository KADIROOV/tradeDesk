import type { ReactNode } from 'react'
import { Field } from '@/components/ui/controls'
import { conversionPairLabel } from '@/lib/finance/conversion'
import type { SymbolSpec } from '@/lib/types'
import { useSettings } from '@/store/settings'

export function NumField({
  label,
  value,
  onChange,
  hint,
  suffix,
  step = 'any',
  min,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  suffix?: string
  step?: string
  min?: number
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="relative">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            className={`field tabular ${suffix ? 'pr-10' : ''}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {suffix && (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  )
}

export function SymbolSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const specs = useSettings((s) => s.symbolSpecs)
  const groups: [string, SymbolSpec[]][] = [
    ['Metals', specs.filter((s) => s.category === 'metal')],
    ['Indices', specs.filter((s) => s.category === 'index')],
    ['Crypto', specs.filter((s) => s.category === 'crypto')],
    ['FX majors', specs.filter((s) => s.category === 'fx-major')],
    ['FX minors', specs.filter((s) => s.category === 'fx-minor')],
  ]
  return (
    <Field label="Instrument">
      {(id) => (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
          {groups.map(([g, list]) => (
            <optgroup key={g} label={g}>
              {list.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol} — {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </Field>
  )
}

export function ConversionField({
  spec,
  value,
  onChange,
}: {
  spec: SymbolSpec
  value: string
  onChange: (v: string) => void
}) {
  const pair = conversionPairLabel(spec.quoteCurrency)
  if (!pair) return null
  return (
    <NumField
      label={`${pair} rate`}
      value={value}
      onChange={onChange}
      hint={`${spec.symbol} is quoted in ${spec.quoteCurrency}. Enter the current ${pair} rate — live rates are not fetched.`}
    />
  )
}

export function Output({
  label,
  value,
  sub,
  big,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  big?: boolean
  tone?: 'pos' | 'neg'
}) {
  return (
    <div
      className={`rounded-[var(--radius-sm)] border border-line/8 bg-line/4 p-3 ${big ? 'col-span-2 sm:col-span-1' : ''}`}
    >
      <p className="label">{label}</p>
      <p
        className={`tabular mt-1 font-semibold tracking-tight ${big ? 'display text-4xl' : 'text-xl'} ${tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : ''}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  )
}
