import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { APP_CONFIG } from '@/config'
import { dateKey, uid } from '@/lib/format'

export type Mood = 1 | 2 | 3 | 4 | 5

export interface DayEntry {
  note: string
  mood?: Mood
  /** Rule id → kept. */
  rules: Record<string, boolean>
  /** Pre-market checklist item id → done. */
  checklist: Record<string, boolean>
}

export interface ListItem {
  id: string
  text: string
}

interface JournalState {
  days: Record<string, DayEntry>
  plan: string
  planCollapsed: boolean
  checklist: ListItem[]
  rules: ListItem[]
  setDay: (key: string, patch: Partial<DayEntry>) => void
  toggleRule: (key: string, ruleId: string) => void
  toggleChecklist: (key: string, itemId: string) => void
  setPlan: (s: string) => void
  setPlanCollapsed: (v: boolean) => void
  addItem: (list: 'checklist' | 'rules', text: string) => void
  editItem: (list: 'checklist' | 'rules', id: string, text: string) => void
  removeItem: (list: 'checklist' | 'rules', id: string) => void
}

const emptyDay = (): DayEntry => ({ note: '', rules: {}, checklist: {} })

export const useJournal = create<JournalState>()(
  persist(
    (set) => ({
      days: {},
      plan: '**Bias:** \n**Key levels:** \n**News:** \n**Only take:** ',
      planCollapsed: false,
      checklist: [
        { id: 'c1', text: 'Marked HTF levels and bias' },
        { id: 'c2', text: 'Checked the news calendar' },
        { id: 'c3', text: 'Max risk per trade set' },
        { id: 'c4', text: 'Calm, rested, no revenge' },
      ],
      rules: [
        { id: 'r1', text: 'Waited for my setup' },
        { id: 'r2', text: 'Risked ≤ 1% per trade' },
        { id: 'r3', text: 'Stop loss placed at entry' },
        { id: 'r4', text: 'Stopped after 2 losses' },
      ],
      setDay: (key, patch) =>
        set((s) => ({ days: { ...s.days, [key]: { ...emptyDay(), ...s.days[key], ...patch } } })),
      toggleRule: (key, ruleId) =>
        set((s) => {
          const d = { ...emptyDay(), ...s.days[key] }
          return {
            days: { ...s.days, [key]: { ...d, rules: { ...d.rules, [ruleId]: !d.rules[ruleId] } } },
          }
        }),
      toggleChecklist: (key, itemId) =>
        set((s) => {
          const d = { ...emptyDay(), ...s.days[key] }
          return {
            days: {
              ...s.days,
              [key]: { ...d, checklist: { ...d.checklist, [itemId]: !d.checklist[itemId] } },
            },
          }
        }),
      setPlan: (plan) => set({ plan }),
      setPlanCollapsed: (planCollapsed) => set({ planCollapsed }),
      addItem: (list, text) => set((s) => ({ [list]: [...s[list], { id: uid(), text }] })),
      editItem: (list, id, text) =>
        set((s) => ({ [list]: s[list].map((i) => (i.id === id ? { ...i, text } : i)) })),
      removeItem: (list, id) => set((s) => ({ [list]: s[list].filter((i) => i.id !== id) })),
    }),
    {
      name: `${APP_CONFIG.storagePrefix}:journal`,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

export const todayKey = () => dateKey(new Date())

export function getDay(days: Record<string, DayEntry>, key: string): DayEntry {
  return days[key] ?? emptyDay()
}
