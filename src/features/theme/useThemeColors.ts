import { useMemo } from 'react'
import { useSettings } from '@/store/settings'
import { resolveTheme } from './engine'

/** Concrete hex colours for libraries (Recharts) that can't read CSS variables. */
export function useThemeColors() {
  const theme = useSettings((s) => s.theme)
  return useMemo(() => {
    const v = resolveTheme(theme).vars
    return {
      accent: v['--accent'],
      pos: v['--pos'],
      neg: v['--neg'],
      text: v['--text'],
      muted: v['--text-muted'],
      line: `rgb(${v['--line-rgb']} / 0.08)`,
      lineStrong: `rgb(${v['--line-rgb']} / 0.25)`,
    }
  }, [theme])
}
