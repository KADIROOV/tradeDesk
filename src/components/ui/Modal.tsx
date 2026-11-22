import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { spring } from '../motion'
import { IconButton } from './Button'
import { useDialogBehaviour } from './useDialog'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  bare?: boolean
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  bare,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useDialogBehaviour(open, onClose, ref)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-t`}
            className={`glass glass-strong relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-b-[var(--radius)] ${SIZES[size]}`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={spring}
          >
            {bare ? (
              <>
                <h2 id={`${id}-t`} className="sr-only">
                  {title}
                </h2>
                {children}
              </>
            ) : (
              <>
                <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6">
                  <div>
                    <h2 id={`${id}-t`} className="text-lg font-semibold tracking-tight">
                      {title}
                    </h2>
                    {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
                  </div>
                  <IconButton label="Close" onClick={onClose} size="sm">
                    <X />
                  </IconButton>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
                  {children}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
