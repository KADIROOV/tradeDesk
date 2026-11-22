import { tr, type MsgKey } from '@/i18n'
import { Modal } from '@/components/ui/Modal'
import { Kbd } from '@/components/ui/controls'
import { useUi } from '@/store/ui'

const LIST: [string[], MsgKey][] = [
  [['N'], 'keys.new'],
  [['Q'], 'keys.quick'],
  [['/'], 'keys.search'],
  [['T'], 'keys.themes'],
  [['H'], 'keys.hide'],
  [['G', 'D'], 'keys.goDash'],
  [['G', 'J'], 'keys.goJournal'],
  [['G', 'C'], 'keys.goCal'],
  [['G', 'K'], 'keys.goCalc'],
  [['G', 'S'], 'keys.goStudy'],
  [['?'], 'keys.list'],
  [['Esc'], 'keys.close'],
]

export function ShortcutsModal() {
  const open = useUi((s) => s.shortcutsOpen)
  const set = useUi((s) => s.setShortcutsOpen)
  return (
    <Modal
      open={open}
      onClose={() => set(false)}
      title={tr('keys.title')}
      description={tr('keys.body')}
      size="sm"
    >
      <ul className="divide-hairline">
        {LIST.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted">{tr(label)}</span>
            <span className="flex items-center gap-1">
              {keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs text-faint">{tr('keys.then')}</span>}
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
