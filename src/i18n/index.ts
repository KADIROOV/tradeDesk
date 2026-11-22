import { format, type Locale } from 'date-fns'
import { enUS, ru as ruLocale, uz as uzLocale } from 'date-fns/locale'
import { en, type Messages, type MsgKey } from './en'
import { ru } from './ru'
import { uz } from './uz'

export type Lang = 'en' | 'ru' | 'uz'
export type { MsgKey }

export const LANGUAGES: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'ru', label: 'Russian', native: 'Русский' },
  { id: 'uz', label: 'Uzbek', native: 'Oʻzbekcha' },
]

const DICTS: Record<Lang, Messages> = { en, ru, uz }
const INTL: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU', uz: 'uz-Latn-UZ' }
const DATE_FNS: Record<Lang, Locale> = { en: enUS, ru: ruLocale, uz: uzLocale }

let current: Lang = 'en'

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ru' || v === 'uz'

/** Best guess from the browser: Russian or Uzbek if preferred, otherwise English. */
export function detectLanguage(): Lang {
  const list =
    typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language]
  for (const l of list) {
    const base = l?.toLowerCase().slice(0, 2)
    if (isLang(base)) return base
  }
  return 'en'
}

export function setLanguage(lang: Lang) {
  current = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export const getLanguage = () => current
export const intlLocale = () => INTL[current]
export const dateLocale = (): Locale => DATE_FNS[current]

function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Translate a key in the current language (falls back to English). */
export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  return fill(DICTS[current][key] ?? en[key], vars)
}

type PluralBase<K extends string> = K extends `${infer B}_other` ? B : never
export type PluralKey = PluralBase<MsgKey>

const rules = new Map<Lang, Intl.PluralRules>()

/** Plural-aware translation: tn('n.trades', 5) → "5 сделок" in Russian. */
export function tn(base: PluralKey, n: number, vars?: Record<string, string | number>): string {
  let pr = rules.get(current)
  if (!pr) {
    pr = new Intl.PluralRules(INTL[current])
    rules.set(current, pr)
  }
  const cat = pr.select(n)
  const key = (`${base}_${cat}` in en ? `${base}_${cat}` : `${base}_other`) as MsgKey
  return t(key, { n, ...vars })
}

/** Translate a dynamic key when it exists (e.g. emotion values stored in English). */
export function tMaybe(key: string, fallback: string): string {
  return key in en ? t(key as MsgKey) : fallback
}
export const tr = t

/** date-fns format() in the current language (month and weekday names). */
export function fmtDate(date: Date | number, pattern: string): string {
  return format(date, pattern, { locale: dateLocale() })
}
