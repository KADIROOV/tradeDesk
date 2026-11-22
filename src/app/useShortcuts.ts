import { useEffect } from 'react'
import { useSettings } from '@/store/settings'
import { useUi, type Route } from '@/store/ui'

const GO: Record<string, Route> = {
  d: 'dashboard',
  j: 'journal',
  c: 'calendar',
  k: 'calculators',
  s: 'study',
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export function useGlobalShortcuts() {
  useEffect(() => {
    let pendingG = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const ui = useUi.getState()
      if (ui.settingsOpen || ui.shortcutsOpen || ui.tradeDrawer.open) return
      if (document.querySelector('[role="dialog"]')) return
      const k = e.key.toLowerCase()
      if (pendingG && Date.now() - pendingG < 1200 && GO[k]) {
        e.preventDefault()
        pendingG = 0
        ui.navigate(GO[k])
        return
      }
      pendingG = 0
      if (k === 'g') pendingG = Date.now()
      else if (k === 'n') {
        e.preventDefault()
        ui.openTrade()
      } else if (k === 'q') {
        e.preventDefault()
        ui.openTrade({ quick: true })
      } else if (e.key === '/') {
        e.preventDefault()
        if (ui.route !== 'journal' && ui.route !== 'study') ui.navigate('journal')
        window.setTimeout(() => useUi.getState().focusSearch(), 60)
      } else if (k === 't') {
        e.preventDefault()
        ui.openSettings('themes')
      } else if (k === 'h') useSettings.getState().toggleHideBalances()
      else if (e.key === '?') ui.setShortcutsOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
