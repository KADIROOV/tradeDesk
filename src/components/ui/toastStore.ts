import { create } from 'zustand'

export interface ToastItem {
  id: number
  text: string
  tone: 'ok' | 'info'
}

export const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }))
let next = 1

export function toast(text: string, tone: ToastItem['tone'] = 'ok') {
  const id = next++
  useToasts.setState((s) => ({ items: [...s.items, { id, text, tone }] }))
  window.setTimeout(
    () => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })),
    3200,
  )
}
