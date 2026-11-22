export type RGB = [number, number, number]

export function isHex(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim())
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** "r g b" triplet for use inside rgb(var(--x) / a). */
export function rgbTriplet(hex: string): string {
  return hexToRgb(hex).join(' ')
}

/** Linear blend: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex([0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * t) as RGB)
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Pick black or white text for a solid fill. */
export function readableOn(fill: string, dark = '#0b0d12', light = '#ffffff'): string {
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light
}

/**
 * Smallest overlay amount t (0..1) of `overlay` over `backdrop` so that `text` reaches
 * `target` contrast. Returns 1 if even a full overlay cannot reach it.
 */
export function minOverlayForContrast(
  text: string,
  overlay: string,
  backdrop: string,
  target = 4.5,
): number {
  if (contrastRatio(text, backdrop) >= target) return 0
  if (contrastRatio(text, overlay) < target) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (contrastRatio(text, mix(backdrop, overlay, mid)) >= target) hi = mid
    else lo = mid
  }
  return Math.ceil(hi * 100) / 100
}
