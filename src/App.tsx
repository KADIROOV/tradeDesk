import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { lazy, Suspense, useEffect } from 'react'
import { Footer, MobileTabBar, TopBar } from '@/app/nav'
import { ShortcutsModal } from '@/app/shortcuts'
import { useGlobalShortcuts } from '@/app/useShortcuts'
import { page } from '@/components/motion'
import { Skeleton } from '@/components/ui/controls'
import { Toaster } from '@/components/ui/Toast'
import { MobileSidebar, Sidebar } from '@/features/sidebar/Sidebar'
import { SettingsModal } from '@/features/theme/SettingsModal'
import { BackgroundLayer, CustomCursor, ThemeApplier } from '@/features/theme/ThemeRuntime'
import { TradeDrawer } from '@/features/journal/TradeDrawer'
import { useSettings } from '@/store/settings'
import { useUi, type Route } from '@/store/ui'
import { useProfileSync } from '@/cloud/profileSync'
import { initCloud, useCloud } from '@/cloud/store'
import { AuthScreen } from '@/features/auth/AuthScreen'
import { ImportLocalBanner } from '@/features/accounts/ImportLocalBanner'

const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const Journal = lazy(() => import('@/features/journal/JournalPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const Calculators = lazy(() => import('@/features/calculators/CalculatorsPage'))
const Study = lazy(() => import('@/features/study/StudyPage'))

const PAGES: Record<Route, React.LazyExoticComponent<() => React.JSX.Element>> = {
  dashboard: Dashboard,
  journal: Journal,
  calendar: CalendarPage,
  calculators: Calculators,
  study: Study,
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-36 rounded-[var(--radius)]" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-[var(--radius)]" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-[var(--radius)]" />
    </div>
  )
}

export default function App() {
  const route = useUi((s) => s.route)
  const animations = useSettings((s) => s.theme.animations)
  const cloudStatus = useCloud((s) => s.status)
  const offline = useCloud((s) => s.offline)
  useGlobalShortcuts()
  useProfileSync()
  useEffect(() => initCloud(), [])
  const Page = PAGES[route]
  // Session guard: when sync is configured, sign in first (or explicitly choose on-device mode).
  const gate =
    cloudStatus === 'loading'
      ? 'loading'
      : cloudStatus === 'signed-out' && !offline
        ? 'auth'
        : 'app'
  if (gate !== 'app')
    return (
      <MotionConfig reducedMotion={animations ? 'user' : 'always'}>
        <ThemeApplier />
        <BackgroundLayer />
        <CustomCursor />
        {gate === 'auth' ? (
          <AuthScreen />
        ) : (
          <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-40 w-80 rounded-[var(--radius)]" />
          </div>
        )}
        <Toaster />
      </MotionConfig>
    )
  return (
    <MotionConfig reducedMotion={animations ? 'user' : 'always'}>
      <ThemeApplier />
      <BackgroundLayer />
      <CustomCursor />
      <a
        href="#main"
        className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70]"
      >
        Skip to content
      </a>
      <div className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-8">
        <TopBar />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
          <main id="main" className="min-w-0">
            <ImportLocalBanner />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={route} variants={page} initial="initial" animate="enter" exit="exit">
                <Suspense fallback={<PageSkeleton />}>
                  <Page />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
          <Sidebar />
        </div>
        <Footer />
      </div>
      <MobileTabBar />
      <MobileSidebar />
      <TradeDrawer />
      <SettingsModal />
      <ShortcutsModal />
      <Toaster />
    </MotionConfig>
  )
}
