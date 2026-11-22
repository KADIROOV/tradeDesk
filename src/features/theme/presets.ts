export type ThemeMode = 'dark' | 'light'

export interface ThemePreset {
  id: string
  name: string
  mode: ThemeMode
  /** Page colour behind everything; also the dim/overlay colour. */
  base: string
  /** Glass card tint. */
  surface: string
  text: string
  muted: string
  faint: string
  accent: string
  positive: string
  negative: string
  background: string
  /** Default glass for this preset. */
  cardOpacity: number
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    base: '#070b14',
    surface: '#121a2c',
    text: '#eef2fb',
    muted: '#a3aec6',
    faint: '#6f7a93',
    accent: '#8aa4ff',
    positive: '#3ddc97',
    negative: '#ff7088',
    background: 'aurora',
    cardOpacity: 0.55,
  },
  {
    id: 'graphite',
    name: 'Graphite',
    mode: 'dark',
    base: '#0d0e10',
    surface: '#1c1e22',
    text: '#f3f3f4',
    muted: '#a9acb3',
    faint: '#73767d',
    accent: '#f5b544',
    positive: '#4ade80',
    negative: '#f87171',
    background: 'ember',
    cardOpacity: 0.6,
  },
  {
    id: 'obsidian',
    name: 'Obsidian OLED',
    mode: 'dark',
    base: '#000000',
    surface: '#0b0b0d',
    text: '#fafafa',
    muted: '#a5a5ae',
    faint: '#6b6b74',
    accent: '#b69cff',
    positive: '#34d399',
    negative: '#fb7185',
    background: 'void',
    cardOpacity: 0.7,
  },
  {
    id: 'slate',
    name: 'Slate Blue',
    mode: 'dark',
    base: '#0b1324',
    surface: '#1a2539',
    text: '#e6ecf5',
    muted: '#9fb0c8',
    faint: '#6c7d96',
    accent: '#4cc3f5',
    positive: '#4ade9b',
    negative: '#ff7a8a',
    background: 'tide',
    cardOpacity: 0.55,
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    base: '#06120d',
    surface: '#0f2219',
    text: '#e9f4ed',
    muted: '#a1bdad',
    faint: '#6a8778',
    accent: '#7ee2b8',
    positive: '#8af0b0',
    negative: '#ffa3a3',
    background: 'pines',
    cardOpacity: 0.5,
  },
  {
    id: 'rose',
    name: 'Rose Dusk',
    mode: 'dark',
    base: '#150a12',
    surface: '#2a1421',
    text: '#fcf0f5',
    muted: '#d0aebd',
    faint: '#94707f',
    accent: '#ffa8d2',
    positive: '#74e8bd',
    negative: '#ff8197',
    background: 'dusk',
    cardOpacity: 0.5,
  },
  {
    id: 'sand',
    name: 'Sand Light',
    mode: 'light',
    base: '#efe6d8',
    surface: '#fbf7f0',
    text: '#2a2017',
    muted: '#64574a',
    faint: '#8f8171',
    accent: '#a85a26',
    positive: '#28734a',
    negative: '#b3343a',
    background: 'dunes',
    cardOpacity: 0.62,
  },
  {
    id: 'paper',
    name: 'Paper White',
    mode: 'light',
    base: '#f3f4f7',
    surface: '#ffffff',
    text: '#11141a',
    muted: '#555c6a',
    faint: '#858b98',
    accent: '#3654d1',
    positive: '#1c7d46',
    negative: '#c22b2b',
    background: 'paper',
    cardOpacity: 0.68,
  },
]

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0]
}

export const ACCENT_SWATCHES = [
  '#8aa4ff',
  '#4cc3f5',
  '#2dd4bf',
  '#7ee2b8',
  '#a3e635',
  '#f5b544',
  '#fb923c',
  '#f87171',
  '#ffa8d2',
  '#c084fc',
  '#b69cff',
  '#e5e7eb',
]
