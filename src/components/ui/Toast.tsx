import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, Info } from 'lucide-react'
import { useToasts } from './toastStore'
import { spring } from '../motion'

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={spring}
            className="glass glass-strong flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg"
          >
            {t.tone === 'ok' ? (
              <CircleCheck className="size-4 text-pos" />
            ) : (
              <Info className="size-4 text-accent" />
            )}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
