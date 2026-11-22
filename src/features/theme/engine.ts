import { clamp } from '@/lib/format'
import {
  hexToRgb,
  isHex,
  minOverlayForContrast,
  mix,
  readableOn,
  rgbToHex,
  rgbTriplet,
} from '@/lib/color'
import { getBuiltinBackground } from './backgrounds'
import { getPreset, THEME_PRESETS } from './presets'
import type { BackgroundSettings, GlassSettings, ThemeSettings } from './types'

export const DEFAULT_GLASS: GlassSettings = {
  blur: 22,
  opacity: 0.55,
  border: 0.12,
  noise: 0.04,
  radius: 20,
}

export const GLASS_PRESETS: Record<'clear' | 'frosted' | 'solid', Omit<GlassSettings, 'radius'>> = {
  clear: { blur: 10, opacity: 0.25, border: 0.16, noise: 0 },
  frosted: { blur: 24, opacity: 0.55, border: 0.12, noise: 0.05 },
  solid: { blur: 0, opacity: 0.94, border: 0.08, noise: 0.02 },
}

export function defaultBackground(builtinId = 'aurora'): BackgroundSettings {
  return {
    kind: 'builtin',
    builtinId,
    solid: '#0b0f1a',
    blur: 0,
    dim: 0.2,
    brightness: 100,
    saturation: 100,
    parallax: false,
    fit: 'cover',
  }
}

export function defaultTheme(presetId = 'midnight'): ThemeSettings {
  const p = getPreset(presetId)
  return {
    presetId: p.id,
    accent: p.accent,
    positive: p.positive,
    negative: p.negative,
    background: defaultBackground(p.background),
    glass: { ...DEFAULT_GLASS, opacity: p.cardOpacity },
    cursor: 'default',
    buttonStyle: 'soft',
    buttonSize: 'comfortable',
    fontScale: 1,
    density: 'spacious',
    animations: true,
    contrastGuard: true,
  }
}

/** Switch preset while keeping the user's glass, cursor, type and uploaded background. */
export function applyPreset(current: ThemeSettings, presetId: string): ThemeSettings {
  const p = getPreset(presetId)
  return {
    ...current,
    presetId: p.id,
    accent: p.accent,
    positive: p.positive,
    negative: p.negative,
    background:
      current.background.kind === 'builtin'
        ? { ...current.background, builtinId: p.background }
        : current.background,
    glass: { ...current.glass, opacity: p.cardOpacity },
  }
}

export function backdropAverage(theme: ThemeSettings): string {
  const preset = getPreset(theme.presetId)
  const bg = theme.background
  let avg: string
  if (bg.kind === 'solid') avg = isHex(bg.solid) ? bg.solid : preset.base
  else if (bg.kind === 'upload')
    avg = bg.uploadAvg && isHex(bg.uploadAvg) ? bg.uploadAvg : preset.base
  else avg = getBuiltinBackground(bg.builtinId).avg
  const factor = bg.brightness / 100
  const [r, g, b] = hexToRgb(avg)
  return rgbToHex([r * factor, g * factor, b * factor])
}

export interface ResolvedTheme {
  vars: Record<string, string>
  mode: 'dark' | 'light'
  effectiveDim: number
  effectiveCardOpacity: number
  guardBoostedDim: boolean
  guardBoostedCards: boolean
}

export function resolveTheme(theme: ThemeSettings): ResolvedTheme {
  const p = getPreset(theme.presetId)
  const accent = isHex(theme.accent) ? theme.accent : p.accent
  const positive = isHex(theme.positive) ? theme.positive : p.positive
  const negative = isHex(theme.negative) ? theme.negative : p.negative
  const g = theme.glass
  const bg = theme.background

  // Contrast guard: text sitting directly on the background, then text on glass cards.
  const avg = backdropAverage(theme)
  const needDim = Math.max(
    minOverlayForContrast(p.text, p.base, avg, 4.5),
    minOverlayForContrast(p.muted, p.base, avg, 4.5),
  )
  const effectiveDim = theme.contrastGuard ? Math.max(bg.dim, Math.min(0.92, needDim)) : bg.dim
  const behindCards = mix(avg, p.base, effectiveDim)
  const needOpacity = minOverlayForContrast(p.muted, p.surface, behindCards, 4.5)
  const effectiveCardOpacity = theme.contrastGuard ? Math.max(g.opacity, needOpacity) : g.opacity

  const dark = p.mode === 'dark'
  const density = theme.density === 'compact' ? 0.8 : 1
  const vars: Record<string, string> = {
    '--base': p.base,
    '--base-rgb': rgbTriplet(p.base),
    '--surface-rgb': rgbTriplet(p.surface),
    '--text': p.text,
    '--text-muted': p.muted,
    '--text-faint': p.faint,
    '--accent': accent,
    '--accent-rgb': rgbTriplet(accent),
    '--accent-fg': readableOn(accent),
    '--pos': positive,
    '--pos-rgb': rgbTriplet(positive),
    '--neg': negative,
    '--neg-rgb': rgbTriplet(negative),
    '--line-rgb': dark ? '255 255 255' : '30 30 45',
    '--highlight': dark ? '0.07' : '0.7',
    '--shadow-strength': dark ? '0.45' : '0.12',
    '--card-opacity': String(clamp(effectiveCardOpacity, 0, 1)),
    '--card-blur': `${clamp(g.blur, 0, 40)}px`,
    '--border-opacity': String(clamp(g.border, 0, 1)),
    '--noise': String(clamp(g.noise, 0, 0.3)),
    '--radius': `${clamp(g.radius, 6, 32)}px`,
    '--radius-sm': `${Math.round(clamp(g.radius, 6, 32) * 0.6)}px`,
    '--bg-blur': `${clamp(bg.blur, 0, 40)}px`,
    '--bg-dim': String(clamp(effectiveDim, 0, 0.95)),
    '--bg-brightness': String(bg.brightness / 100),
    '--bg-saturate': String(bg.saturation / 100),
    '--font-scale': String(clamp(theme.fontScale, 0.85, 1.2)),
    '--density': String(density),
  }
  return {
    vars,
    mode: p.mode,
    effectiveDim,
    effectiveCardOpacity,
    guardBoostedDim: theme.contrastGuard && effectiveDim > bg.dim + 0.001,
    guardBoostedCards: theme.contrastGuard && effectiveCardOpacity > g.opacity + 0.001,
  }
}

// ---------- import / export ----------

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && isHex(v) ? v : fallback)
const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T =>
  typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : fallback
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/** Validate untrusted JSON into a complete ThemeSettings, falling back to defaults per field. */
export function sanitizeTheme(input: unknown): ThemeSettings {
  const src = isObj(input) && isObj(input.theme) ? input.theme : input
  const o: Obj = isObj(src) ? src : {}
  const presetId = oneOf(
    o.presetId,
    THEME_PRESETS.map((p) => p.id),
    'midnight',
  )
  const d = defaultTheme(presetId)
  const b: Obj = isObj(o.background) ? o.background : {}
  const gl: Obj = isObj(o.glass) ? o.glass : {}
  const kind = oneOf(b.kind, ['builtin', 'upload', 'solid'] as const, 'builtin')
  return {
    presetId,
    accent: hex(o.accent, d.accent),
    positive: hex(o.positive, d.positive),
    negative: hex(o.negative, d.negative),
    background: {
      // Uploaded media lives in this browser's IndexedDB only, so imports fall back to a built-in.
      kind: kind === 'upload' ? 'builtin' : kind,
      builtinId:
        typeof b.builtinId === 'string'
          ? getBuiltinBackground(b.builtinId).id
          : d.background.builtinId,
      solid: hex(b.solid, d.background.solid),
      blur: num(b.blur, d.background.blur, 0, 40),
      dim: num(b.dim, d.background.dim, 0, 0.9),
      brightness: num(b.brightness, 100, 40, 160),
      saturation: num(b.saturation, 100, 0, 200),
      parallax: bool(b.parallax, false),
      fit: oneOf(b.fit, ['cover', 'contain', 'tile'] as const, 'cover'),
    },
    glass: {
      blur: num(gl.blur, d.glass.blur, 0, 40),
      opacity: num(gl.opacity, d.glass.opacity, 0, 1),
      border: num(gl.border, d.glass.border, 0, 0.5),
      noise: num(gl.noise, d.glass.noise, 0, 0.3),
      radius: num(gl.radius, d.glass.radius, 6, 32),
    },
    cursor: oneOf(o.cursor, ['default', 'dot', 'ring'] as const, 'default'),
    buttonStyle: oneOf(o.buttonStyle, ['soft', 'outline', 'solid'] as const, 'soft'),
    buttonSize: oneOf(o.buttonSize, ['compact', 'comfortable'] as const, 'comfortable'),
    fontScale: num(o.fontScale, 1, 0.85, 1.2),
    density: oneOf(o.density, ['compact', 'spacious'] as const, 'spacious'),
    animations: bool(o.animations, true),
    contrastGuard: bool(o.contrastGuard, true),
  }
}

export function exportThemeJson(name: string, theme: ThemeSettings): string {
  const { background, ...rest } = theme
  const portable = {
    ...rest,
    background: {
      ...background,
      uploadId: undefined,
      uploadAvg: undefined,
      uploadName: undefined,
      uploadType: undefined,
    },
  }
  return JSON.stringify({ format: 'tradedesk-theme', version: 1, name, theme: portable }, null, 2)
}
