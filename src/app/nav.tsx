import { tr } from '@/i18n'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Keyboard, Palette, PanelRight, Plus } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { spring } from '@/components/motion'
import { APP_CONFIG } from '@/config'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { NAV } from './navItems'
import { cloudEnabled } from '@/cloud/client'
import { chooseOffline, useCloud } from '@/cloud/store'
import { AccountSwitcher } from '@/features/accounts/AccountSwitcher'

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--pos)" />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="9"
          fill="rgb(var(--line-rgb) / 0.06)"
          stroke="rgb(var(--line-rgb) / 0.14)"
        />
        <path
          d="M8 20.5 13 15l4 3.5 7-8"
          fill="none"
          stroke="url(#lg)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="10.5" r="2.2" fill="var(--pos)" />
      </svg>
      <span className="text-[0.95rem] font-semibold tracking-tight">{APP_CONFIG.name}</span>
    </div>
  )
}

export function TopBar() {
  const route = useUi((s) => s.route)
  const navigate = useUi((s) => s.navigate)
  const openSettings = useUi((s) => s.openSettings)
  const openTrade = useUi((s) => s.openTrade)
  const setShortcuts = useUi((s) => s.setShortcutsOpen)
  const setMobileSidebar = useUi((s) => s.setMobileSidebar)
  const hidden = useSettings((s) => s.hideBalances)
  const toggleHidden = useSettings((s) => s.toggleHideBalances)
  const cloudActive = useCloud((s) => s.status === 'signed-in')

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-5 bg-gradient-to-b from-[rgb(var(--base-rgb)/0.92)] via-[rgb(var(--base-rgb)/0.7)] to-transparent px-4 pt-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <a
          href="#/dashboard"
          onClick={(e) => {
            e.preventDefault()
            navigate('dashboard')
          }}
          className="rounded-xl"
          aria-label={tr('nav.home', { app: APP_CONFIG.name })}
        >
          <Logo />
        </a>
        <nav
          aria-label={tr('nav.primary')}
          className="glass hidden items-center gap-0.5 rounded-full p-1 md:flex"
        >
          {NAV.map((n) => {
            const active = route === n.route
            return (
              <a
                key={n.route}
                href={`#/${n.route}`}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(n.route)
                }}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors lg:px-4 [&_svg]:size-4 ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full border border-line/10 bg-line/12"
                    style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / var(--highlight))' }}
                    transition={spring}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <span className="hidden lg:inline">{n.icon}</span>
                  {tr(n.label)}
                </span>
              </a>
            )
          })}
        </nav>
        <div className="flex items-center gap-1.5">
          {cloudActive && <AccountSwitcher />}
          {cloudEnabled && !cloudActive && (
            <Button
              variant="ghost"
              onClick={() => chooseOffline(false)}
              className="hidden sm:inline-flex"
            >
              {tr('nav.signIn')}
            </Button>
          )}
          <IconButton
            label={hidden ? tr('nav.showBalances') : tr('nav.hideBalances')}
            onClick={toggleHidden}
            variant="ghost"
          >
            {hidden ? <EyeOff /> : <Eye />}
          </IconButton>
          <IconButton label={tr('nav.settings')} onClick={() => openSettings()} variant="ghost">
            <Palette />
          </IconButton>
          <IconButton
            label={tr('nav.shortcuts')}
            onClick={() => setShortcuts(true)}
            variant="ghost"
            className="hidden lg:inline-flex"
          >
            <Keyboard />
          </IconButton>
          <IconButton
            label={tr('nav.strategy')}
            onClick={() => setMobileSidebar(true)}
            variant="ghost"
            className="lg:hidden"
          >
            <PanelRight />
          </IconButton>
          <IconButton
            label={tr('nav.logTradeKey')}
            onClick={() => openTrade()}
            variant="primary"
            className="hidden sm:inline-flex xl:hidden"
          >
            <Plus />
          </IconButton>
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => openTrade()}
            kbd="N"
            className="hidden xl:inline-flex"
          >
            {tr('nav.logTrade')}
          </Button>
        </div>
      </div>
    </header>
  )
}

export function MobileTabBar() {
  const route = useUi((s) => s.route)
  const navigate = useUi((s) => s.navigate)
  const openTrade = useUi((s) => s.openTrade)
  return (
    <>
      <button
        type="button"
        onClick={() => openTrade()}
        aria-label={tr('nav.logTrade')}
        className="btn btn-primary btn-icon fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 !size-12 !rounded-full shadow-lg sm:hidden [&_svg]:!size-5"
      >
        <Plus />
      </button>
      <nav
        aria-label={tr('nav.primary')}
        className="glass glass-strong fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-around rounded-[1.375rem] p-1 md:hidden"
      >
        {NAV.map((n) => {
          const active = route === n.route
          return (
            <a
              key={n.route}
              href={`#/${n.route}`}
              onClick={(e) => {
                e.preventDefault()
                navigate(n.route)
              }}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[0.65rem] font-medium [&_svg]:size-5 ${active ? 'text-fg' : 'text-muted'}`}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-2xl bg-line/10"
                  transition={spring}
                />
              )}
              <span className="relative">{n.icon}</span>
              <span className="relative">{tr(n.label)}</span>
            </a>
          )
        })}
      </nav>
    </>
  )
}

export function Footer() {
  const cloudActive = useCloud((s) => s.status === 'signed-in')
  return (
    <footer className="mt-10 mb-28 flex flex-col items-center justify-between gap-2 border-t hairline pt-5 text-xs text-muted sm:flex-row md:mb-8">
      <p>{tr('footer.disclaimer')}</p>
      <p>
        {APP_CONFIG.name} · {cloudActive ? tr('footer.synced') : tr('footer.local')}{' '}
        {tr('footer.shortcuts')}
      </p>
    </footer>
  )
}
