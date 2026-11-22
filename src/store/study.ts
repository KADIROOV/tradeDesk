import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { APP_CONFIG } from '@/config'
import type { Lesson } from '@/features/study/lessons'

interface StudyState {
  watched: string[]
  favorites: string[]
  custom: Lesson[]
  toggleWatched: (id: string) => void
  toggleFavorite: (id: string) => void
  addCustom: (l: Lesson) => void
  removeCustom: (id: string) => void
}

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

export const useStudy = create<StudyState>()(
  persist(
    (set) => ({
      watched: [],
      favorites: [],
      custom: [],
      toggleWatched: (id) => set((s) => ({ watched: toggle(s.watched, id) })),
      toggleFavorite: (id) => set((s) => ({ favorites: toggle(s.favorites, id) })),
      addCustom: (l) =>
        set((s) => ({ custom: [l, ...s.custom.filter((x) => x.youtubeId !== l.youtubeId)] })),
      removeCustom: (id) => set((s) => ({ custom: s.custom.filter((x) => x.youtubeId !== id) })),
    }),
    {
      name: `${APP_CONFIG.storagePrefix}:study`,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
