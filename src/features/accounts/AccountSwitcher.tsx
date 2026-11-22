import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Layers, LogOut, PencilLine, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { spring } from '@/components/motion'
import { connectionStatus } from '@/cloud/status'
import { signOut, useCloud } from '@/cloud/store'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useNow } from '@/lib/useNow'
import { StatusDot } from './StatusChip'

/** Account picker + connection status + user menu, shown when signed in. */
export function AccountSwitcher() {
  const accounts = useCloud((s) => s.accounts)
  const email = useCloud((s) => s.email)
  const sel = useSettings((s) => s.selectedAccount)
  const setSel = useSettings((s) => s.setSelectedAccount)
  const openSettings = useUi((s) => s.openSettings)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const now = useNow()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = accounts.find((a) => a.id === sel)
  const label =
    sel === 'all'
      ? 'All accounts'
      : sel === 'manual'
        ? 'Manual trades'
        : (current?.name ?? 'All accounts')
  const statuses = accounts.map((a) => connectionStatus(a, now))
  const summary = current
    ? connectionStatus(current, now)
    : statuses.includes('connected')
      ? 'connected'
      : statuses.includes('offline')
        ? 'offline'
        : 'waiting'

  const pick = (id: string) => {
    setSel(id)
    setOpen(false)
  }
  const item =
    'flex w-full items-center gap-2.5 rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-line/8'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-ghost gap-2 !px-3"
        title="Switch account"
      >
        {accounts.length > 0 && <StatusDot status={summary} />}
        <span className="hidden max-w-36 truncate xl:inline">{label}</span>
        <ChevronDown className="!size-3.5 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={spring}
            className="glass glass-strong absolute right-0 z-50 mt-2 w-72 origin-top-right p-1.5 shadow-2xl"
          >
            <p className="label px-2.5 pt-1.5 pb-1">View</p>
            <button
              role="menuitemradio"
              aria-checked={sel === 'all'}
              className={item}
              onClick={() => pick('all')}
            >
              <Layers className="size-4 text-muted" />
              <span className="flex-1">All accounts</span>
              {sel === 'all' && <Check className="size-4 text-accent" />}
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                role="menuitemradio"
                aria-checked={sel === a.id}
                className={item}
                onClick={() => pick(a.id)}
              >
                <StatusDot status={connectionStatus(a, now)} className="mx-1" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{a.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.broker}
                    {a.login ? ` · ${a.login}` : ' · not connected yet'}
                  </span>
                </span>
                {sel === a.id && <Check className="size-4 text-accent" />}
              </button>
            ))}
            <button
              role="menuitemradio"
              aria-checked={sel === 'manual'}
              className={item}
              onClick={() => pick('manual')}
            >
              <PencilLine className="size-4 text-muted" />
              <span className="flex-1">Manual trades</span>
              {sel === 'manual' && <Check className="size-4 text-accent" />}
            </button>
            <div className="my-1.5 border-t hairline" />
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false)
                openSettings('accounts')
              }}
            >
              <Settings2 className="size-4 text-muted" />
              {accounts.length ? 'Manage accounts' : 'Connect MT5'}
            </button>
            <button role="menuitem" className={item} onClick={() => void signOut()}>
              <LogOut className="size-4 text-muted" />
              <span className="min-w-0 flex-1 truncate">
                Sign out <span className="text-xs text-muted">{email}</span>
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
