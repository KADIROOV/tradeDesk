import { tr } from '@/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { CloudUpload, X } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { toast } from '@/components/ui/toastStore'
import { spring } from '@/components/motion'
import { importLocalTrades, saveProfile, useCloud } from '@/cloud/store'
import { useTrades } from '@/store/trades'

/** One-time offer, after the first sign-in, to copy this device's trades into the account. */
export function ImportLocalBanner() {
  const signedIn = useCloud((s) => s.status === 'signed-in' && s.loaded)
  const settings = useCloud((s) => s.profile?.settings)
  const local = useTrades((s) => s.trades)
  const [busy, setBusy] = useState(false)
  const real = local.filter((t) => !t.id.startsWith('demo-'))
  const show =
    signedIn &&
    real.length > 0 &&
    settings?.localImported !== true &&
    settings?.localImportDismissed !== true

  const run = async () => {
    setBusy(true)
    try {
      const n = await importLocalTrades(real)
      toast(tr('import.done', { n }))
    } catch (e) {
      toast(e instanceof Error ? e.message : tr('common.importFailed'), 'info')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={spring}
          className="glass pad-sm mb-4 flex flex-wrap items-center gap-3"
          role="region"
          aria-label={tr('import.aria')}
        >
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <CloudUpload className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{tr('import.count', { n: real.length })}</span>{' '}
            <span className="text-muted">{tr('import.body')}</span>
          </p>
          <Button variant="primary" size="sm" onClick={() => void run()} disabled={busy}>
            {busy ? tr('common.importing') : tr('import.button')}
          </Button>
          <IconButton
            size="sm"
            label={tr('import.notNow')}
            onClick={() => void saveProfile({ settings: { localImportDismissed: true } })}
          >
            <X />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
