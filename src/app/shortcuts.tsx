import { Modal } from '@/components/ui/Modal'
import { Kbd } from '@/components/ui/controls'
import { useUi } from '@/store/ui'

const LIST: [string[], string][] = [
  [['N'], 'Log a new trade'],
  [['Q'], 'Quick log (4 fields)'],
  [['/'], 'Search trades or lessons'],
  [['T'], 'Open themes'],
  [['H'], 'Hide / show balances'],
  [['G', 'D'], 'Go to Dashboard'],
  [['G', 'J'], 'Go to Journal'],
  [['G', 'C'], 'Go to Calendar'],
  [['G', 'K'], 'Go to Calculators'],
  [['G', 'S'], 'Go to Study'],
  [['?'], 'Show this list'],
  [['Esc'], 'Close any dialog'],
]

export function ShortcutsModal() {
  const open = useUi((s) => s.shortcutsOpen)
  const set = useUi((s) => s.setShortcutsOpen)
  return (
    <Modal
      open={open}
      onClose={() => set(false)}
      title="Keyboard shortcuts"
      description="Work without leaving the keyboard."
      size="sm"
    >
      <ul className="divide-hairline">
        {LIST.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted">{label}</span>
            <span className="flex items-center gap-1">
              {keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs text-faint">then</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
