import { afterEach, describe, expect, it } from 'vitest'
import { en } from './en'
import { setLanguage, t, tn } from './index'
import { ru } from './ru'
import { uz } from './uz'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

afterEach(() => setLanguage('en'))

describe('dictionaries', () => {
  for (const [name, dict] of Object.entries({ ru, uz })) {
    it(`${name} has exactly the English keys, all non-empty`, () => {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe('')
    })
    it(`${name} keeps every {placeholder}`, () => {
      for (const k of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dict[k]), k).toEqual(placeholders(en[k]))
      }
    })
  }
})

describe('t / tn', () => {
  it('fills variables', () => {
    expect(t('dash.payoff', { v: '2.85' })).toBe('Payoff ratio 2.85')
  })
  it('switches language', () => {
    setLanguage('ru')
    expect(t('nav.journal')).toBe('Журнал')
    setLanguage('uz')
    expect(t('nav.journal')).toBe('Jurnal')
  })
  it('uses Russian plural forms', () => {
    setLanguage('ru')
    expect(tn('n.trades', 1)).toBe('1 сделка')
    expect(tn('n.trades', 3)).toBe('3 сделки')
    expect(tn('n.trades', 5)).toBe('5 сделок')
    expect(tn('n.trades', 21)).toBe('21 сделка')
  })
  it('uses English plural forms', () => {
    expect(tn('n.trades', 1)).toBe('1 trade')
    expect(tn('n.trades', 2)).toBe('2 trades')
  })
})
