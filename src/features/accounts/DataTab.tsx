import { tr } from '@/i18n'
import { CloudUpload, Download, FlaskConical, Globe2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { toast } from '@/components/ui/toastStore'
import { runSimulation } from '@/cloud/simulate'
import { importLocalTrades, saveProfile, useCloud } from '@/cloud/store'
import { useCloudActive, useTradeList } from '@/data/useTradeData'
import { tradesToCsv } from '@/lib/csv'
import { dateKey } from '@/lib/format'
import { dayKeyInZone, isValidTimeZone } from '@/lib/mt5/tz'
import { useSettings } from '@/store/settings'
import { useTrades } from '@/store/trades'

const COMMON_ZONES = [
  'Asia/Tashkent',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Australia/Sydney',
]

function allZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  const list = intl.supportedValuesOf?.('timeZone') ?? []
  return [...new Set([...COMMON_ZONES, ...list])]
}

function Block({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-line/10 bg-line/4 p-4 sm:flex-row sm:items-center">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">{body}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </section>
  )
}

export function DataTab() {
  const cloud = useCloudActive()
  const timezone = useSettings((s) => s.timezone)
  const setTimezone = useSettings((s) => s.setTimezone)
  const trades = useTradeList()
  const allCloud = useCloud((s) => s.trades)
  const local = useTrades((s) => s.trades)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const zones = useMemo(allZones, [])
  const now = new Date()

  const changeZone = (tz: string) => {
    if (!isValidTimeZone(tz)) return
    setTimezone(tz)
    if (cloud) void saveProfile({ timezone: tz }).catch(() => undefined)
    toast(tr('data.tzChanged', { tz }))
  }
  const exportCsv = () => {
    const rows = cloud ? allCloud : local
    const blob = new Blob([tradesToCsv(rows)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tradedesk-trades-${dateKey(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold tracking-tight">{tr('data.title')}</h3>
      <section className="rounded-[var(--radius-sm)] border border-line/10 bg-line/4 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
            <Globe2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <Field
              label={tr('data.tz')}
              hint={tr('data.tzHint', {
                now: `${dayKeyInZone(now, timezone)} ${now.toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}`,
              })}
            >
              {(id) => (
                <select
                  id={id}
                  className="field max-w-xs"
                  value={timezone}
                  onChange={(e) => changeZone(e.target.value)}
                >
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>
      </section>

      <Block
        icon={<Download />}
        title={tr('data.exportTitle')}
        body={tr('data.exportBody', { n: cloud ? allCloud.length : local.length })}
      >
        <Button size="sm" onClick={exportCsv}>
          {tr('data.exportBtn')}
        </Button>
      </Block>

      {cloud && (
        <Block
          icon={<CloudUpload />}
          title={tr('data.importTitle')}
          body={tr('data.importBody', { n: local.filter((t) => !t.id.startsWith('demo-')).length })}
        >
          <Button
            size="sm"
            disabled={busy !== null || local.length === 0}
            onClick={async () => {
              setBusy('import')
              try {
                const n = await importLocalTrades(local.filter((t) => !t.id.startsWith('demo-')))
                toast(`Imported ${n} trades`)
              } catch (e) {
                toast(e instanceof Error ? e.message : tr('common.importFailed'), 'info')
              } finally {
                setBusy(null)
              }
            }}
          >
            {busy === 'import' ? tr('common.importing') : tr('common.import')}
          </Button>
        </Block>
      )}

      {cloud && (
        <Block icon={<FlaskConical />} title={tr('data.simTitle')} body={tr('data.simBody')}>
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('sim')
              setProgress(0)
              try {
                const id = await runSimulation(6, setProgress)
                useSettings.getState().setSelectedAccount(id)
                toast(tr('data.simDone'))
              } catch (e) {
                toast(e instanceof Error ? e.message : tr('data.simFailed'), 'info')
              } finally {
                setBusy(null)
              }
            }}
          >
            {busy === 'sim' ? tr('data.simSending', { n: progress }) : tr('data.simBtn')}
          </Button>
        </Block>
      )}
      <p className="text-xs text-muted">{tr('data.showing', { n: trades.length })}</p>
    </div>
  )
}
