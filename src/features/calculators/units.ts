import type { SymbolSpec } from '@/lib/types'

export const unitName = (spec: SymbolSpec) =>
  spec.category.startsWith('fx') || spec.category === 'metal' ? 'pips' : 'points'
