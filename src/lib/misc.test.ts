import { describe, expect, it } from 'vitest'
import { THEME_PRESETS } from '@/features/theme/presets'
import { defaultTheme, resolveTheme, sanitizeTheme } from '@/features/theme/engine'
import { contrastRatio, minOverlayForContrast, mix } from './color'
import { csvToTrades, parseCsv, tradesToCsv } from './csv'
import { mergeDuplicates } from './dedupe'
import { convertTime, sessionForInstant, zoneOffsetMinutes, zonedTimeToUtc } from './sessions'
import type { Trade } from './types'
import { parseYouTubeId } from './youtube'

const trade = (over: Partial<Trade> = {}): Trade => ({
  id: 'a',
  symbol: 'EURUSD',
  direction: 'long',
  openedAt: '2026-03-02T09:15:00.000Z',
  entry: 1.1,
  stop: 1.098,
  exit: 1.104,
  lots: 0.5,
  fees: 3.5,
  pnl: 196.5,
  pnlManual: false,
  rulesFollowed: true,
  ...over,
})

describe('csv', () => {
  it('round-trips trades including commas, quotes and newlines in notes', () => {
    const t = trade({ notes: 'Waited for "confirmation", then\nentered' })
    const back = csvToTrades(tradesToCsv([t])).trades[0]
    expect(back.notes).toBe(t.notes)
    expect(back.pnl).toBe(196.5)
    expect(back.entry).toBe(1.1)
  })
  it('accepts buy/sell and skips incomplete rows', () => {
    const csv =
      'symbol,direction,openedAt,pnl\nxauusd,BUY,2026-01-05T10:00:00Z,120\nNAS100,sell,,50'
    const r = csvToTrades(csv)
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0].symbol).toBe('XAUUSD')
    expect(r.trades[0].direction).toBe('long')
    expect(r.skipped).toBe(1)
  })
  it('parses CRLF', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('mergeDuplicates', () => {
  it('collapses identical trades and fills missing fields', () => {
    const r = mergeDuplicates([
      trade({ id: '1', setup: undefined }),
      trade({ id: '2', setup: 'Breakout' }),
      trade({ id: '3', symbol: 'GBPUSD' }),
    ])
    expect(r.removed).toBe(1)
    expect(r.trades).toHaveLength(2)
    expect(r.trades[0].id).toBe('1')
    expect(r.trades[0].setup).toBe('Breakout')
  })
})

describe('sessions', () => {
  it('Tashkent is UTC+5 all year', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Asia/Tashkent')).toBe(300)
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Tashkent')).toBe(300)
  })
  it('London observes BST in summer', () => {
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Europe/London')).toBe(60)
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe(0)
  })
  it('NY 09:30 in winter is 19:30 in Tashkent', () => {
    expect(convertTime('2026-01-15', 9 * 60 + 30, 'America/New_York', 'Asia/Tashkent')).toBe(
      19 * 60 + 30,
    )
  })
  it('NY 09:30 in summer is 18:30 in Tashkent', () => {
    expect(convertTime('2026-07-15', 9 * 60 + 30, 'America/New_York', 'Asia/Tashkent')).toBe(
      18 * 60 + 30,
    )
  })
  it('London 08:00 in summer is 07:00 UTC', () => {
    expect(zonedTimeToUtc('2026-07-15', 8 * 60, 'Europe/London').toISOString()).toBe(
      '2026-07-15T07:00:00.000Z',
    )
  })
  it('classifies the London/NY overlap', () => {
    expect(sessionForInstant(new Date('2026-01-15T14:00:00Z'))).toBe('overlap')
    expect(sessionForInstant(new Date('2026-01-15T09:00:00Z'))).toBe('london')
    expect(sessionForInstant(new Date('2026-01-15T02:00:00Z'))).toBe('asia')
  })
})

describe('colour + contrast', () => {
  it('black on white is 21:1', () => expect(contrastRatio('#000', '#fff')).toBeCloseTo(21))
  it('mix midpoint', () => expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080'))
  it('min overlay is 0 when contrast already passes', () => {
    expect(minOverlayForContrast('#ffffff', '#000000', '#000000')).toBe(0)
  })
  it('min overlay reaches the target', () => {
    const t = minOverlayForContrast('#ffffff', '#000000', '#ffffff')
    expect(contrastRatio('#ffffff', mix('#ffffff', '#000000', t))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('theme presets meet WCAG AA', () => {
  for (const p of THEME_PRESETS) {
    it(`${p.name}: text and muted ≥ 4.5:1 on cards over its own background`, () => {
      const r = resolveTheme(defaultTheme(p.id))
      // Card colour over the dimmed default background, as the guard computes it.
      expect(r.effectiveCardOpacity).toBeGreaterThanOrEqual(0)
      expect(contrastRatio(p.text, p.surface)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(p.muted, p.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(p.positive, p.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(p.negative, p.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(p.accent, p.surface)).toBeGreaterThanOrEqual(3)
    })
  }
  it('contrast guard boosts dim/opacity for a bright background on a dark theme', () => {
    const t = defaultTheme('midnight')
    t.background = { ...t.background, kind: 'solid', solid: '#f5f5f5', dim: 0 }
    t.glass.opacity = 0.1
    const r = resolveTheme(t)
    expect(r.guardBoostedDim).toBe(true)
    const behind = mix('#f5f5f5', '#070b14', r.effectiveDim)
    expect(contrastRatio('#a3aec6', behind)).toBeGreaterThanOrEqual(4.4)
  })
  it('guard off leaves the user values alone', () => {
    const t = { ...defaultTheme('midnight'), contrastGuard: false }
    t.background = { ...t.background, kind: 'solid', solid: '#ffffff', dim: 0 }
    expect(resolveTheme(t).effectiveDim).toBe(0)
  })
})

describe('sanitizeTheme', () => {
  it('fills defaults and rejects junk', () => {
    const s = sanitizeTheme({
      theme: { presetId: 'forest', accent: 'red', glass: { blur: 999 }, cursor: 'laser' },
    })
    expect(s.presetId).toBe('forest')
    expect(s.accent).toBe('#7ee2b8')
    expect(s.glass.blur).toBe(40)
    expect(s.cursor).toBe('default')
  })
  it('never imports an upload reference', () => {
    expect(sanitizeTheme({ background: { kind: 'upload' } }).background.kind).toBe('builtin')
  })
})

describe('youtube', () => {
  it('parses common URL shapes', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })
})
