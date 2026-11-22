import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/controls'
import { dateKey } from '@/lib/format'
import { convertTime, formatMinutes, minutesInZone, sessionWindows, ZONES } from '@/lib/sessions'

const COLORS: Record<string, string> = {
  asia: 'rgb(var(--accent-rgb) / 0.55)',
  london: 'rgb(var(--pos-rgb) / 0.55)',
  newyork: 'rgb(var(--neg-rgb) / 0.5)',
}

function useNow(ms = 15000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

export function SessionsTool() {
  const now = useNow()
  const [viewer, setViewer] = useState('Asia/Tashkent')
  const [day, setDay] = useState(() => dateKey(new Date()))
  const [time, setTime] = useState('16:30')
  const [from, setFrom] = useState('Asia/Tashkent')
  const windows = sessionWindows(day, viewer, now)
  const nowMin = minutesInZone(now, viewer)
  const isToday = day === dateKey(now)
  const [hh, mm] = time.split(':').map(Number)
  const minutes = (hh || 0) * 60 + (mm || 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ZONES.map((z) => (
          <Card key={z.id} padded="sm" lift>
            <p className="label">{z.label}</p>
            <p className="tabular serif mt-1 text-3xl">{formatMinutes(minutesInZone(now, z.tz))}</p>
            <p className="text-xs text-muted">
              {new Intl.DateTimeFormat('en-GB', {
                timeZone: z.tz,
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                timeZoneName: 'shortOffset',
              }).format(now)}
            </p>
          </Card>
        ))}
      </div>

      <Card
        label="Market sessions"
        action={
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="Date"
              className="field h-8 w-auto text-xs"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
            <select
              aria-label="Show times in"
              className="field h-8 w-auto text-xs"
              value={viewer}
              onChange={(e) => setViewer(e.target.value)}
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.tz}>
                  {z.label} time
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="relative mt-2">
          <div className="flex justify-between text-[0.65rem] text-muted tabular" aria-hidden>
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
              <span key={h} className="w-0 text-center">
                <span className="-ml-2 inline-block w-4">{String(h).padStart(2, '0')}</span>
              </span>
            ))}
          </div>
          <div className="relative mt-2 flex flex-col gap-2">
            {windows.map((w) => {
              const segs: [number, number][] =
                w.close > w.open
                  ? [[w.open, w.close]]
                  : [
                      [w.open, 1440],
                      [0, w.close],
                    ]
              return (
                <div
                  key={w.session.id}
                  className="relative h-10 rounded-[var(--radius-sm)] bg-line/5"
                >
                  {segs.map(([a, b], i) => (
                    <div
                      key={i}
                      className="absolute inset-y-1 flex items-center overflow-hidden rounded-[calc(var(--radius-sm)-4px)] px-2"
                      style={{
                        left: `${(a / 1440) * 100}%`,
                        width: `${((b - a) / 1440) * 100}%`,
                        background: COLORS[w.session.id],
                      }}
                    >
                      {i === 0 && (
                        <span className="truncate text-xs font-medium text-fg">
                          {w.session.label} · {formatMinutes(w.open)}–{formatMinutes(w.close)}
                        </span>
                      )}
                    </div>
                  ))}
                  {w.isOpen && isToday && (
                    <span className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-pos/20 px-2 py-0.5 text-[0.6rem] font-semibold text-pos uppercase">
                      open
                    </span>
                  )}
                </div>
              )
            })}
            {isToday && (
              <div
                className="pointer-events-none absolute inset-y-[-6px] w-px bg-accent"
                style={{ left: `${(nowMin / 1440) * 100}%` }}
                aria-label={`Now ${formatMinutes(nowMin)}`}
              >
                <span className="absolute -top-1 -left-1 size-2 rounded-full bg-accent" />
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">
          Session hours: Tokyo 09:00–18:00, London 08:00–17:00, New York 08:00–17:00 local time.
          Daylight saving is applied automatically. The London–New York overlap is usually the most
          liquid window.
        </p>
      </Card>

      <Card label="Time converter">
        <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
          <Field label="Time">
            {(id) => (
              <input
                id={id}
                type="time"
                className="field w-32"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
          </Field>
          <Field label="In">
            {(id) => (
              <select
                id={id}
                className="field w-40"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                {ZONES.map((z) => (
                  <option key={z.id} value={z.tz}>
                    {z.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:self-end">
            {ZONES.filter((z) => z.tz !== from).map((z) => (
              <div
                key={z.id}
                className="rounded-[var(--radius-sm)] border border-line/8 bg-line/4 px-3 py-2"
              >
                <p className="label">{z.label}</p>
                <p className="tabular text-lg font-semibold">
                  {formatMinutes(convertTime(day, minutes, from, z.tz))}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
