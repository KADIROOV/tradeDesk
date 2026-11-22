import raw from '@/data/lessons.json'

export const CATEGORIES = [
  'Beginner',
  'Price Action',
  'ICT/SMC',
  'Risk Management',
  'Psychology',
  'Gold/XAUUSD',
  'Nasdaq',
  'Backtesting',
] as const
export type Category = (typeof CATEGORIES)[number] | 'My lessons'
export type Level = 'beginner' | 'intermediate' | 'advanced'

export interface Lesson {
  title: string
  channel: string
  youtubeId: string
  category: Category
  level: Level
  notes: string
}

const isCategory = (c: string): c is Category =>
  (CATEGORIES as readonly string[]).includes(c) || c === 'My lessons'
const isLevel = (l: string): l is Level =>
  l === 'beginner' || l === 'intermediate' || l === 'advanced'

/** lessons.json is hand-edited, so validate it once at load time. */
export const LESSONS: Lesson[] = (raw as Record<string, string>[]).flatMap((l) =>
  l.youtubeId && l.title && isCategory(l.category)
    ? [
        {
          title: l.title,
          channel: l.channel ?? '',
          youtubeId: l.youtubeId,
          category: l.category,
          level: isLevel(l.level) ? l.level : 'beginner',
          notes: l.notes ?? '',
        },
      ]
    : [],
)
