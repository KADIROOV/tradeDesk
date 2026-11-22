import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { APP_CONFIG } from '@/config'
import { DEFAULT_SYMBOL_SPECS } from '@/data/symbolSpecs'
import { uid } from '@/lib/format'
import type { SymbolSpec } from '@/lib/types'
import { DEFAULT_TIMEZONE, isValidTimeZone } from '@/lib/mt5/tz'
import {
  applyPreset,
  defaultBackground,
  defaultTheme,
  sanitizeTheme,
} from '@/features/theme/engine'
import { getPreset } from '@/features/theme/presets'
import type {
  BackgroundSettings,
  GlassSettings,
  ThemeProfile,
  ThemeSettings,
} from '@/features/theme/types'

interface SettingsState {
  theme: ThemeSettings
  profiles: ThemeProfile[]
  activeProfileId: string | null
  hideBalances: boolean
  startingBalance: number
  symbolSpecs: SymbolSpec[]
  /** IANA zone used to decide which calendar day a trade belongs to. */
  timezone: string
  /** 'all', 'manual' (trades logged by hand) or an MT5 account id. */
  selectedAccount: string
  setTimezone: (tz: string) => void
  setSelectedAccount: (id: string) => void
  setTheme: (patch: Partial<ThemeSettings>) => void
  setBackground: (patch: Partial<BackgroundSettings>) => void
  setGlass: (patch: Partial<GlassSettings>) => void
  choosePreset: (id: string) => void
  resetBackground: () => void
  resetTheme: () => void
  saveProfile: (name: string) => void
  overwriteProfile: (id: string) => void
  loadProfile: (id: string) => void
  renameProfile: (id: string, name: string) => void
  deleteProfile: (id: string) => void
  importTheme: (json: unknown, name: string) => void
  toggleHideBalances: () => void
  setStartingBalance: (v: number) => void
  updateSpec: (symbol: string, patch: Partial<SymbolSpec>) => void
  resetSpecs: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: defaultTheme(),
      profiles: [],
      activeProfileId: null,
      hideBalances: false,
      startingBalance: 10000,
      symbolSpecs: DEFAULT_SYMBOL_SPECS,
      timezone: DEFAULT_TIMEZONE,
      selectedAccount: 'all',
      setTimezone: (timezone) =>
        set({ timezone: isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE }),
      setSelectedAccount: (selectedAccount) => set({ selectedAccount }),
      setTheme: (patch) => set((s) => ({ theme: { ...s.theme, ...patch } })),
      setBackground: (patch) =>
        set((s) => ({ theme: { ...s.theme, background: { ...s.theme.background, ...patch } } })),
      setGlass: (patch) =>
        set((s) => ({ theme: { ...s.theme, glass: { ...s.theme.glass, ...patch } } })),
      choosePreset: (id) => set((s) => ({ theme: applyPreset(s.theme, id) })),
      resetBackground: () =>
        set((s) => ({
          theme: {
            ...s.theme,
            background: defaultBackground(getPreset(s.theme.presetId).background),
          },
        })),
      resetTheme: () =>
        set((s) => ({ theme: defaultTheme(s.theme.presetId), activeProfileId: null })),
      saveProfile: (name) => {
        const p: ThemeProfile = {
          id: uid(),
          name: name.trim() || 'Untitled',
          theme: get().theme,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ profiles: [...s.profiles, p], activeProfileId: p.id }))
      },
      overwriteProfile: (id) =>
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === id ? { ...p, theme: s.theme } : p)),
        })),
      loadProfile: (id) => {
        const p = get().profiles.find((x) => x.id === id)
        if (p) set({ theme: p.theme, activeProfileId: id })
      },
      renameProfile: (id, name) =>
        set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, name } : p)) })),
      deleteProfile: (id) =>
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id),
          activeProfileId: s.activeProfileId === id ? null : s.activeProfileId,
        })),
      importTheme: (json, name) => {
        const theme = sanitizeTheme(json)
        const p: ThemeProfile = { id: uid(), name, theme, createdAt: new Date().toISOString() }
        set((s) => ({ theme, profiles: [...s.profiles, p], activeProfileId: p.id }))
      },
      toggleHideBalances: () => set((s) => ({ hideBalances: !s.hideBalances })),
      setStartingBalance: (v) => set({ startingBalance: v }),
      updateSpec: (symbol, patch) =>
        set((s) => ({
          symbolSpecs: s.symbolSpecs.map((x) => (x.symbol === symbol ? { ...x, ...patch } : x)),
        })),
      resetSpecs: () => set({ symbolSpecs: DEFAULT_SYMBOL_SPECS }),
    }),
    {
      name: `${APP_CONFIG.storagePrefix}:settings`,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>
        return {
          ...current,
          ...p,
          // Re-validate in case the stored shape is from an older version.
          theme: p.theme
            ? {
                ...sanitizeTheme(p.theme),
                background: {
                  ...sanitizeTheme(p.theme).background,
                  ...pickUpload(p.theme.background),
                },
              }
            : current.theme,
          symbolSpecs: mergeSpecs(p.symbolSpecs),
        }
      },
    },
  ),
)

function pickUpload(b: BackgroundSettings | undefined): Partial<BackgroundSettings> {
  if (!b || b.kind !== 'upload' || !b.uploadId) return {}
  return {
    kind: 'upload',
    uploadId: b.uploadId,
    uploadType: b.uploadType,
    uploadName: b.uploadName,
    uploadAvg: b.uploadAvg,
  }
}

function mergeSpecs(saved: SymbolSpec[] | undefined): SymbolSpec[] {
  if (!saved?.length) return DEFAULT_SYMBOL_SPECS
  return DEFAULT_SYMBOL_SPECS.map((d) => ({ ...d, ...saved.find((s) => s.symbol === d.symbol) }))
}

export const useSpec = (symbol: string): SymbolSpec | undefined =>
  useSettings((s) => s.symbolSpecs.find((x) => x.symbol === symbol))
