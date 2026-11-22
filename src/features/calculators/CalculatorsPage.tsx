import { type MsgKey, tr } from '@/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Segmented } from '@/components/ui/controls'
import { fadeUp, stagger } from '@/components/motion'
import { PnlCalc, PositionSizeCalc } from './PositionSize'
import { CompoundCalc, RRCalc, RuinCalc } from './RiskTools'
import { SessionsTool } from './Sessions'
import { SpecsTable } from './SpecsTable'

type Tool = 'size' | 'pnl' | 'rr' | 'ruin' | 'compound' | 'sessions' | 'specs'

const TOOLS: { value: Tool; label: MsgKey }[] = [
  { value: 'size', label: 'calc.size' },
  { value: 'pnl', label: 'calc.pnl' },
  { value: 'rr', label: 'calc.rr' },
  { value: 'ruin', label: 'calc.ruin' },
  { value: 'compound', label: 'calc.compound' },
  { value: 'sessions', label: 'calc.sessions' },
  { value: 'specs', label: 'calc.specs' },
]

export default function CalculatorsPage() {
  const [tool, setTool] = useState<Tool>('size')
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
      <motion.div variants={fadeUp}>
        <p className="label">{tr('calc.label')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {tr('calc.title')} <span className="serif text-accent">{tr('calc.titleAccent')}</span>{' '}
          {tr('calc.titleEnd')}
        </h1>
      </motion.div>
      <motion.div
        variants={fadeUp}
        className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <Segmented
          label={tr('calc.tool')}
          value={tool}
          onChange={setTool}
          options={TOOLS.map((o) => ({ value: o.value, label: tr(o.label) }))}
          className="min-w-max"
        />
      </motion.div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tool}
          variants={stagger}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          {tool === 'size' && <PositionSizeCalc />}
          {tool === 'pnl' && <PnlCalc />}
          {tool === 'rr' && <RRCalc />}
          {tool === 'ruin' && <RuinCalc />}
          {tool === 'compound' && <CompoundCalc />}
          {tool === 'sessions' && <SessionsTool />}
          {tool === 'specs' && <SpecsTable />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
