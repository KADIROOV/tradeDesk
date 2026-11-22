import { tr } from '@/i18n'
import { Calculator } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toastStore'
import { recalculate, saveProfile, useCloud } from '@/cloud/store'
import {
  autoMapSymbol,
  INSTRUMENT_GROUPS,
  type InstrumentGroup,
  type SymbolOverrides,
} from '@/lib/mt5/symbols'
import { CloudRequired } from './AccountsTab'

const isOverrides = (v: unknown): v is SymbolOverrides =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function SymbolsTab() {
  const status = useCloud((s) => s.status)
  const trades = useCloud((s) => s.trades)
  const accounts = useCloud((s) => s.accounts)
  const saved = useCloud((s) => s.profile?.settings.symbolMap)
  const overrides: SymbolOverrides = useMemo(() => (isOverrides(saved) ? saved : {}), [saved])
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)

  const raws = useMemo(() => {
    const set = new Set<string>(Object.keys(overrides))
    for (const t of trades) if (t.symbolRaw) set.add(t.symbolRaw.toUpperCase())
    for (const s of ['GOLD', 'US100Cash', 'US30Cash', 'GER40Cash', 'EURUSD', 'BTCUSD'])
      set.add(s.toUpperCase())
    return [...set].sort()
  }, [trades, overrides])

  if (status !== 'signed-in') return <CloudRequired />

  const write = (raw: string, patch: { canonical?: string; group?: InstrumentGroup } | null) => {
    const next: SymbolOverrides =
      patch === null
        ? Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== raw))
        : { ...overrides, [raw]: { ...overrides[raw], ...patch } }
    void saveProfile({ settings: { symbolMap: next } }).catch((e: unknown) =>
      toast(e instanceof Error ? e.message : tr('common.saveFailed'), 'info'),
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{tr('sym.title')}</h3>
          <p className="max-w-xl text-sm text-muted">{tr('sym.body')}</p>
        </div>
        <Button
          icon={<Calculator />}
          disabled={busy || accounts.length === 0}
          onClick={async () => {
            setBusy(true)
            try {
              for (const a of accounts) await recalculate(a.id)
              toast(tr('sym.applied'))
            } catch (e) {
              toast(e instanceof Error ? e.message : tr('acc.recalcFailed'), 'info')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? tr('sym.applying') : tr('sym.apply')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-line/10">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b hairline text-left">
              <th scope="col" className="label px-4 py-2.5">
                {tr('sym.broker')}
              </th>
              <th scope="col" className="label px-2 py-2.5">
                {tr('sym.standard')}
              </th>
              <th scope="col" className="label px-2 py-2.5">
                {tr('sym.group')}
              </th>
              <th scope="col" className="label px-4 py-2.5 text-right">
                {tr('sym.source')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-hairline">
            {raws.map((raw) => {
              const auto = autoMapSymbol(raw)
              const o = overrides[raw]
              return (
                <tr key={raw}>
                  <td className="px-4 py-2 font-mono text-xs">{raw}</td>
                  <td className="px-2 py-2">
                    <input
                      className="field h-8 w-32 text-xs uppercase"
                      aria-label={`${raw} standard name`}
                      defaultValue={o?.canonical ?? auto.canonical}
                      key={`${raw}-${o?.canonical ?? auto.canonical}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toUpperCase()
                        if (v && v !== (o?.canonical ?? auto.canonical))
                          write(raw, { canonical: v })
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="field h-8 w-32 text-xs"
                      aria-label={`${raw} group`}
                      value={o?.group ?? auto.group}
                      onChange={(e) => write(raw, { group: e.target.value as InstrumentGroup })}
                    >
                      {INSTRUMENT_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    {o ? (
                      <button
                        type="button"
                        className="text-accent underline-offset-2 hover:underline"
                        onClick={() => write(raw, null)}
                      >
                        {tr('sym.custom')}
                      </button>
                    ) : (
                      <span className="text-muted">{tr('sym.auto')}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const raw = extra.trim().toUpperCase()
          if (raw) write(raw, autoMapSymbol(raw))
          setExtra('')
        }}
      >
        <input
          className="field h-9 max-w-56 text-sm uppercase"
          placeholder={tr('sym.addPlaceholder')}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          aria-label={tr('sym.addPlaceholder')}
        />
        <Button type="submit" size="sm">
          {tr('common.add')}
        </Button>
      </form>
    </section>
  )
}
