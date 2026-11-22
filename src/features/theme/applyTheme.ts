import { CARD_NOISE } from './backgrounds'
import { resolveTheme, type ResolvedTheme } from './engine'
import type { ThemeSettings } from './types'

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Write the resolved CSS variables and data-attributes onto <html>. */
export function applyThemeToDocument(theme: ThemeSettings): ResolvedTheme {
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  for (const [k, v] of Object.entries(resolved.vars)) root.style.setProperty(k, v)
  root.style.setProperty('--noise-img', CARD_NOISE)
  root.style.colorScheme = resolved.mode
  root.dataset.mode = resolved.mode
  root.dataset.btnStyle = theme.buttonStyle
  root.dataset.btnSize = theme.buttonSize
  root.dataset.cursor = theme.cursor
  root.dataset.motion = theme.animations ? 'on' : 'off'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved.vars['--base'])
  return resolved
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => unknown }

/** Apply with a 300ms cross-fade where the View Transitions API exists. */
export function applyThemeWithTransition(theme: ThemeSettings): void {
  const doc = document as ViewTransitionDoc
  if (!theme.animations || prefersReducedMotion() || !doc.startViewTransition) {
    applyThemeToDocument(theme)
    return
  }
  doc.startViewTransition(() => applyThemeToDocument(theme))
}
