import { Calculator, CalendarDays, GraduationCap, LayoutDashboard, NotebookPen } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MsgKey } from '@/i18n'
import type { Route } from '@/store/ui'

export const NAV: { route: Route; label: MsgKey; icon: ReactNode; key: string }[] = [
  { route: 'dashboard', label: 'nav.dashboard', icon: <LayoutDashboard />, key: 'D' },
  { route: 'journal', label: 'nav.journal', icon: <NotebookPen />, key: 'J' },
  { route: 'calendar', label: 'nav.calendar', icon: <CalendarDays />, key: 'C' },
  { route: 'calculators', label: 'nav.calculators', icon: <Calculator />, key: 'K' },
  { route: 'study', label: 'nav.study', icon: <GraduationCap />, key: 'S' },
]
