import { create } from 'zustand'

export type Route = 'dashboard' | 'journal' | 'calendar' | 'calculators' | 'study'
export const ROUTES: Route[] = ['dashboard', 'journal', 'calendar', 'calculators', 'study']

export type SettingsTab =
  | 'accounts'
  | 'symbols'
  | 'data'
  | 'language'
  | 'themes'
  | 'colours'
  | 'background'
  | 'glass'
  | 'cursor'
  | 'buttons'
  | 'type'
  | 'profiles'

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(h) ? h : 'dashboard'
}

interface UiState {
  route: Route
  settingsOpen: boolean
  settingsTab: SettingsTab
  shortcutsOpen: boolean
  tradeDrawer: { open: boolean; editId: string | null; quick: boolean }
  searchFocusTick: number
  mobileSidebarOpen: boolean
  /** Day the Calendar should open on (yyyy-MM-dd), set from other pages. */
  calendarDay: string | null
  navigate: (r: Route) => void
  openCalendarDay: (day: string | null) => void
  openSettings: (tab?: SettingsTab) => void
  closeSettings: () => void
  setSettingsTab: (t: SettingsTab) => void
  setShortcutsOpen: (v: boolean) => void
  openTrade: (opts?: { editId?: string; quick?: boolean }) => void
  closeTrade: () => void
  setQuick: (v: boolean) => void
  focusSearch: () => void
  setMobileSidebar: (v: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  route: routeFromHash(),
  settingsOpen: false,
  settingsTab: 'themes',
  shortcutsOpen: false,
  tradeDrawer: { open: false, editId: null, quick: false },
  searchFocusTick: 0,
  mobileSidebarOpen: false,
  calendarDay: null,
  navigate: (route) => {
    if (window.location.hash !== `#/${route}`) window.history.pushState(null, '', `#/${route}`)
    set({ route })
    window.scrollTo({ top: 0, behavior: 'instant' })
  },
  openCalendarDay: (calendarDay) => {
    set({ calendarDay })
    if (calendarDay) useUi.getState().navigate('calendar')
  },
  openSettings: (tab) => set((s) => ({ settingsOpen: true, settingsTab: tab ?? s.settingsTab })),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  openTrade: (opts) =>
    set({ tradeDrawer: { open: true, editId: opts?.editId ?? null, quick: opts?.quick ?? false } }),
  closeTrade: () => set((s) => ({ tradeDrawer: { ...s.tradeDrawer, open: false } })),
  setQuick: (quick) => set((s) => ({ tradeDrawer: { ...s.tradeDrawer, quick } })),
  focusSearch: () => set((s) => ({ searchFocusTick: s.searchFocusTick + 1 })),
  setMobileSidebar: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
}))

window.addEventListener('popstate', () => useUi.setState({ route: routeFromHash() }))
