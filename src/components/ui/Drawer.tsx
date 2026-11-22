import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { spring } from '../motion'
import { IconButton } from './Button'
import { useDialogBehaviour } from './useDialog'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  headerExtra?: ReactNode
  footer?: ReactNode
  children: ReactNode
  width?: string
}

/** Right-side panel on desktop, bottom sheet on phones. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  footer,
  children,
  width = 'sm:max-w-lg',
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useDialogBehaviour(open, onClose, ref)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
          <motion.aside
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-t`}
            className={`glass glass-strong absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col rounded-b-none sm:inset-y-3 sm:right-3 sm:left-auto sm:max-h-none sm:w-full sm:rounded-b-[var(--radius)] ${width}`}
            initial={{ opacity: 0, x: 0, y: 40 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={spring}
          >
            <header className="flex items-start justify-between gap-3 border-b hairline px-5 py-4">
              <div className="min-w-0">
                <h2 id={`${id}-t`} className="truncate text-lg font-semibold tracking-tight">
                  {title}
                </h2>
                {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-2">
                {headerExtra}
                <IconButton label="Close" onClick={onClose} size="sm">
                  <X />
                </IconButton>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="border-t hairline px-5 py-3">{footer}</footer>}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
