import { Calculator, CalendarDays, GraduationCap, LayoutDashboard, NotebookPen } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Route } from '@/store/ui'

export const NAV: { route: Route; label: string; icon: ReactNode; key: string }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, key: 'D' },
  { route: 'journal', label: 'Journal', icon: <NotebookPen />, key: 'J' },
  { route: 'calendar', label: 'Calendar', icon: <CalendarDays />, key: 'C' },
  { route: 'calculators', label: 'Calculators', icon: <Calculator />, key: 'K' },
  { route: 'study', label: 'Study', icon: <GraduationCap />, key: 'S' },
]
