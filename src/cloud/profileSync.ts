import { useEffect } from 'react'
import { sanitizeTheme } from '@/features/theme/engine'
import type { SymbolSpec } from '@/lib/types'
import { useJournal, type DayEntry, type ListItem } from '@/store/journal'
import { useSettings } from '@/store/settings'
import { saveProfile, useCloud } from './store'

interface JournalSnapshot {
  days: Record<string, DayEntry>
  plan: string
  checklist: ListItem[]
  rules: ListItem[]
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Pull theme, timezone, specs and journal notes from the profile, then keep pushing local changes. */
export function useProfileSync() {
  const userId = useCloud((s) => s.userId)
  const ready = useCloud((s) => s.loaded && s.profile !== null)

  useEffect(() => {
    if (!userId || !ready) return
    const profile = useCloud.getState().profile
    if (!profile) return
    const st = profile.settings

    // 1. Cloud → device (the account wins, except a background uploaded on this device).
    const settings = useSettings.getState()
    settings.setTimezone(profile.timezone)
    if (isObj(st.theme)) {
      const theme = sanitizeTheme(st.theme)
      const local = settings.theme.background
      useSettings.setState({
        theme: local.kind === 'upload' && local.uploadId ? { ...theme, background: local } : theme,
      })
    }
    if (Array.isArray(st.specs)) {
      const saved = st.specs as SymbolSpec[]
      useSettings.setState((s) => ({
        symbolSpecs: s.symbolSpecs.map((d) => ({
          ...d,
          ...saved.find((x) => x?.symbol === d.symbol),
        })),
      }))
    }
    if (isObj(st.journal)) {
      const j = st.journal as Partial<JournalSnapshot>
      useJournal.setState((s) => ({
        days: isObj(j.days) ? { ...s.days, ...(j.days as Record<string, DayEntry>) } : s.days,
        plan: typeof j.plan === 'string' ? j.plan : s.plan,
        checklist: Array.isArray(j.checklist) ? j.checklist : s.checklist,
        rules: Array.isArray(j.rules) ? j.rules : s.rules,
      }))
    }

    // 2. Device → cloud, debounced.
    let timer = 0
    const push = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const s = useSettings.getState()
        const j = useJournal.getState()
        void saveProfile({
          timezone: s.timezone,
          settings: {
            theme: s.theme,
            specs: s.symbolSpecs,
            journal: { days: j.days, plan: j.plan, checklist: j.checklist, rules: j.rules },
          },
        }).catch(() => undefined)
      }, 2500)
    }
    const unsubSettings = useSettings.subscribe((s, prev) => {
      if (
        s.theme !== prev.theme ||
        s.timezone !== prev.timezone ||
        s.symbolSpecs !== prev.symbolSpecs
      )
        push()
    })
    const unsubJournal = useJournal.subscribe((s, prev) => {
      if (
        s.days !== prev.days ||
        s.plan !== prev.plan ||
        s.checklist !== prev.checklist ||
        s.rules !== prev.rules
      )
        push()
    })
    return () => {
      window.clearTimeout(timer)
      unsubSettings()
      unsubJournal()
    }
  }, [userId, ready])
}
