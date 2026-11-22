import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/controls'
import { Drawer } from '@/components/ui/Drawer'
import { stagger } from '@/components/motion'
import { dateKey, formatCurrency } from '@/lib/format'
import { getDay, todayKey, useJournal, type ListItem } from '@/store/journal'
import { useSettings } from '@/store/settings'
import { useTrades } from '@/store/trades'
import { useUi } from '@/store/ui'
import { format, subDays } from 'date-fns'

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="tabular text-xs text-muted">
        {done}/{total}
      </span>
      <div
        className="h-1 w-14 overflow-hidden rounded-full bg-line/10"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <motion.div
          className="h-full origin-left rounded-full bg-accent"
          animate={{ scaleX: pct / 100 }}
          initial={false}
          transition={{ type: 'spring', stiffness: 200, damping: 30 }}
        />
      </div>
    </div>
  )
}

/** A checklist whose items can be edited inline. */
export function EditableChecklist({
  list,
  items,
  checked,
  onToggle,
}: {
  list: 'checklist' | 'rules'
  items: ListItem[]
  checked: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { addItem, editItem, removeItem } = useJournal()
  return (
    <div>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className="flex min-h-7 items-center gap-2">
            {editing ? (
              <>
                <input
                  className="field h-8 text-sm"
                  defaultValue={i.text}
                  aria-label="Edit item"
                  onBlur={(e) =>
                    e.target.value.trim() && editItem(list, i.id, e.target.value.trim())
                  }
                />
                <IconButton size="sm" label="Remove item" onClick={() => removeItem(list, i.id)}>
                  <Trash2 />
                </IconButton>
              </>
            ) : (
              <Checkbox checked={!!checked[i.id]} onChange={() => onToggle(i.id)} label={i.text} />
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        {editing && (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) addItem(list, draft.trim())
              setDraft('')
            }}
          >
            <input
              className="field h-8 text-sm"
              placeholder="New item"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="New item"
            />
            <IconButton size="sm" type="submit" label="Add item" variant="ghost">
              <Plus />
            </IconButton>
          </form>
        )}
        <Button
          size="sm"
          variant="quiet"
          icon={editing ? undefined : <Pencil />}
          onClick={() => setEditing((v) => !v)}
          className="ml-auto"
        >
          {editing ? 'Done' : 'Edit'}
        </Button>
      </div>
    </div>
  )
}

function PlanCard() {
  const { plan, setPlan, planCollapsed, setPlanCollapsed } = useJournal()
  const [editing, setEditing] = useState(false)
  return (
    <Card padded="sm">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md"
          onClick={() => setPlanCollapsed(!planCollapsed)}
          aria-expanded={!planCollapsed}
        >
          <motion.span animate={{ rotate: planCollapsed ? 0 : 90 }} transition={{ duration: 0.2 }}>
            <ChevronRight className="size-3.5 text-muted" />
          </motion.span>
          <h2 className="label">Pre-market plan</h2>
        </button>
        {!planCollapsed && (
          <Button size="sm" variant="quiet" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {!planCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              {editing ? (
                <textarea
                  className="field min-h-36 font-mono text-xs"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  aria-label="Pre-market plan (markdown)"
                />
              ) : (
                <div className="prose-md cursor-text" onDoubleClick={() => setEditing(true)}>
                  <ReactMarkdown>{plan.replace(/\n/g, '  \n')}</ReactMarkdown>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function ChecklistCard() {
  const items = useJournal((s) => s.checklist)
  const days = useJournal((s) => s.days)
  const toggle = useJournal((s) => s.toggleChecklist)
  const key = todayKey()
  const checked = getDay(days, key).checklist
  const done = items.filter((i) => checked[i.id]).length
  return (
    <Card padded="sm" label="Checklist" action={<Progress done={done} total={items.length} />}>
      <EditableChecklist
        list="checklist"
        items={items}
        checked={checked}
        onToggle={(id) => toggle(key, id)}
      />
    </Card>
  )
}

function RulesCard() {
  const rules = useJournal((s) => s.rules)
  const days = useJournal((s) => s.days)
  const toggle = useJournal((s) => s.toggleRule)
  const key = todayKey()
  const today = getDay(days, key).rules
  const done = rules.filter((r) => today[r.id]).length
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i)
    const k = dateKey(d)
    const r = getDay(days, k).rules
    const kept = rules.filter((x) => r[x.id]).length
    return {
      k,
      label: format(d, 'EEEEE'),
      pct: rules.length ? kept / rules.length : 0,
      any: Object.keys(r).length > 0,
    }
  })
  return (
    <Card
      padded="sm"
      label="Session rules kept"
      action={<Progress done={done} total={rules.length} />}
    >
      <EditableChecklist
        list="rules"
        items={rules}
        checked={today}
        onToggle={(id) => toggle(key, id)}
      />
      <div
        className="mt-4 flex items-end justify-between gap-1"
        aria-label="Rules kept, last 7 days"
      >
        {week.map((d) => (
          <div
            key={d.k}
            className="flex flex-1 flex-col items-center gap-1"
            title={`${d.k}: ${Math.round(d.pct * 100)}%`}
          >
            <div className="relative h-8 w-full max-w-5 overflow-hidden rounded-md bg-line/8">
              <motion.div
                className="absolute inset-x-0 bottom-0 h-full origin-bottom rounded-md"
                style={{
                  background:
                    d.pct >= 0.75 ? 'var(--pos)' : d.pct > 0 ? 'var(--accent)' : 'transparent',
                }}
                initial={false}
                animate={{ scaleY: d.pct }}
              />
            </div>
            <span className="text-[0.6rem] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function RecentTrades() {
  const trades = useTrades((s) => s.trades)
  const hidden = useSettings((s) => s.hideBalances)
  const openTrade = useUi((s) => s.openTrade)
  const recent = useMemo(
    () => [...trades].sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, 5),
    [trades],
  )
  return (
    <Card padded="sm" label="Recent trades">
      {recent.length === 0 ? (
        <p className="text-sm text-muted">Nothing logged yet.</p>
      ) : (
        <ul className="-mx-1.5 flex flex-col">
          {recent.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => openTrade({ editId: t.id })}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-line/5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${t.pnl >= 0 ? 'bg-pos' : 'bg-neg'}`}
                  />
                  <span className="truncate font-medium">{t.symbol}</span>
                  <span className="text-xs text-muted">
                    {format(new Date(t.openedAt), 'MMM d')}
                  </span>
                </span>
                <span className={`tabular text-sm ${t.pnl >= 0 ? 'text-pos' : 'text-neg'}`}>
                  {formatCurrency(t.pnl, { hidden, signed: true })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function SidebarContent() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
      <PlanCard />
      <ChecklistCard />
      <RulesCard />
      <RecentTrades />
    </motion.div>
  )
}

export function Sidebar() {
  return (
    <aside aria-label="Strategy and plan" className="hidden lg:block">
      <div className="pb-4">
        <SidebarContent />
      </div>
    </aside>
  )
}

export function MobileSidebar() {
  const open = useUi((s) => s.mobileSidebarOpen)
  const set = useUi((s) => s.setMobileSidebar)
  return (
    <Drawer
      open={open}
      onClose={() => set(false)}
      title="Strategy & plan"
      subtitle="Today’s plan, checklist and rules"
      width="sm:max-w-sm"
    >
      <SidebarContent />
    </Drawer>
  )
}
