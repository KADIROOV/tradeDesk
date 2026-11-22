/**
 * Ten original abstract backgrounds generated from CSS gradients and inline SVG.
 * `avg` is an approximate average colour, used by the contrast guard.
 */
export interface BuiltinBackground {
  id: string
  name: string
  mode: 'dark' | 'light'
  avg: string
  css: string
}

const svg = (body: string, w = 1600, h = 1000) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'>${body}</svg>`,
  )}")`

const grain = (opacity: number) =>
  svg(
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${opacity} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`,
    400,
    400,
  )

const mountains = (sky: [string, string], layers: string[], sun?: string) =>
  svg(
    `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${sky[0]}'/><stop offset='1' stop-color='${sky[1]}'/></linearGradient>${
      sun
        ? `<radialGradient id='g' cx='0.68' cy='0.42' r='0.35'><stop offset='0' stop-color='${sun}' stop-opacity='0.55'/><stop offset='1' stop-color='${sun}' stop-opacity='0'/></radialGradient>`
        : ''
    }</defs><rect width='1600' height='1000' fill='url(#s)'/>${sun ? `<rect width='1600' height='1000' fill='url(#g)'/>` : ''}${layers
      .map((c, i) => {
        const y = 520 + i * 110
        const a = 90 - i * 12
        return `<path fill='${c}' d='M0 ${y} C 200 ${y - a} 360 ${y - a * 1.4} 560 ${y - a * 0.6} S 900 ${y - a * 1.8} 1120 ${y - a * 0.9} S 1450 ${y - a * 1.2} 1600 ${y - a * 0.5} V1000 H0 Z'/>`
      })
      .join('')}`,
  )

export const BUILTIN_BACKGROUNDS: BuiltinBackground[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    mode: 'dark',
    avg: '#141a33',
    css: `radial-gradient(60% 50% at 20% 15%, #3b4bb8aa 0%, transparent 60%), radial-gradient(50% 45% at 85% 20%, #6d3fc4aa 0%, transparent 60%), radial-gradient(70% 60% at 60% 100%, #0f766e99 0%, transparent 65%), linear-gradient(160deg, #0a0f24 0%, #070a16 100%)`,
  },
  {
    id: 'ember',
    name: 'Ember mesh',
    mode: 'dark',
    avg: '#1c1714',
    css: `radial-gradient(45% 40% at 15% 85%, #c2410c88 0%, transparent 60%), radial-gradient(40% 40% at 90% 10%, #a1620755 0%, transparent 60%), radial-gradient(55% 50% at 55% 45%, #3f3f4655 0%, transparent 70%), linear-gradient(180deg, #121214 0%, #0b0b0c 100%)`,
  },
  {
    id: 'pines',
    name: 'Night ridges',
    mode: 'dark',
    avg: '#0f2a22',
    css: mountains(['#0b1d2b', '#1d4a3f'], ['#163a33', '#10302a', '#0b241f', '#061712'], '#7dd3a8'),
  },
  {
    id: 'dusk',
    name: 'Dusk',
    mode: 'dark',
    avg: '#2a1424',
    css: mountains(['#2a1033', '#a8466a'], ['#5b2346', '#431a37', '#2e1228', '#1c0b19'], '#ffb38a'),
  },
  {
    id: 'tide',
    name: 'Tide',
    mode: 'dark',
    avg: '#12213a',
    css: `${svg(
      Array.from({ length: 7 }, (_, i) => {
        const y = 380 + i * 90
        return `<path fill='none' stroke='#93c5fd' stroke-opacity='${0.05 + i * 0.015}' stroke-width='2' d='M0 ${y} C 300 ${y - 70} 500 ${y + 70} 800 ${y} S 1300 ${y - 70} 1600 ${y}'/>`
      }).join(''),
    )}, radial-gradient(80% 60% at 50% 0%, #1e3a8a88 0%, transparent 70%), linear-gradient(180deg, #0c1628 0%, #0a1222 100%)`,
  },
  {
    id: 'grain',
    name: 'Grain',
    mode: 'dark',
    avg: '#18181c',
    css: `${grain(0.09)}, radial-gradient(70% 70% at 30% 20%, #2d2d36 0%, transparent 70%), linear-gradient(200deg, #15151a 0%, #0c0c0f 100%)`,
  },
  {
    id: 'void',
    name: 'Void',
    mode: 'dark',
    avg: '#050507',
    css: `radial-gradient(50% 35% at 50% 0%, #4c1d9533 0%, transparent 70%), #000000`,
  },
  {
    id: 'prism',
    name: 'Prism',
    mode: 'dark',
    avg: '#211c33',
    css: `radial-gradient(circle at 50% 50%, transparent 0%, #0b0b14cc 75%), conic-gradient(from 210deg at 60% 40%, #3730a3, #0e7490, #15803d, #a16207, #9d174d, #3730a3)`,
  },
  {
    id: 'dunes',
    name: 'Dunes',
    mode: 'light',
    avg: '#e8d9c2',
    css: mountains(['#f6efe4', '#efdcc2'], ['#ead3b3', '#e2c7a2', '#d9bb93', '#cfae84'], '#ffffff'),
  },
  {
    id: 'paper',
    name: 'Paper',
    mode: 'light',
    avg: '#eef0f4',
    css: `${grain(0.05)}, radial-gradient(60% 50% at 80% 0%, #dbe4ff 0%, transparent 70%), radial-gradient(50% 50% at 0% 100%, #e6fcf5 0%, transparent 70%), linear-gradient(180deg, #f8f9fb 0%, #eceef2 100%)`,
  },
]

export function getBuiltinBackground(id: string): BuiltinBackground {
  return BUILTIN_BACKGROUNDS.find((b) => b.id === id) ?? BUILTIN_BACKGROUNDS[0]
}

/** Grain overlay used on glass cards. */
export const CARD_NOISE = grain(0.6)
