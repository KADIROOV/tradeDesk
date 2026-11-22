import { motion } from 'framer-motion'
import { useId, type ReactNode } from 'react'
import { spring } from '../motion'

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: ReactNode
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = String,
}: SliderProps) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <span className="tabular text-xs text-muted">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  description?: string
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'border-accent/60 bg-accent/70' : 'border-line/15 bg-line/10'
        }`}
      >
        <motion.span
          className="absolute left-0.5 size-[1.125rem] rounded-full bg-white shadow"
          animate={{ x: checked ? 16 : 0 }}
          transition={spring}
        />
      </button>
    </div>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  onChange: (v: T) => void
  label: string
  size?: 'sm' | 'md'
  className?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  className = '',
}: SegmentedProps<T>) {
  const group = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-[var(--radius-sm)] border border-line/10 bg-line/5 p-0.5 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius-sm)-2px)] font-medium whitespace-nowrap transition-colors ${
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm'
            } ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-[inherit] border border-line/10 bg-line/12 shadow-sm"
                transition={spring}
              />
            )}
            <span className="relative flex items-center gap-1.5 [&_svg]:size-3.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  className?: string
}) {
  return (
    <label className={`group flex cursor-pointer items-center gap-2.5 text-sm ${className}`}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={`grid size-[1.125rem] shrink-0 place-items-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
          checked ? 'border-accent bg-accent text-accent-fg' : 'border-line/25 bg-line/5'
        }`}
      >
        <motion.svg
          viewBox="0 0 24 24"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.2 }}
          />
        </motion.svg>
      </span>
      <span
        className={`min-w-0 transition-opacity ${checked ? 'text-muted line-through decoration-line/30' : ''}`}
      >
        {label}
      </span>
    </label>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-line/10 bg-line/5 text-accent [&_svg]:size-5">
        {icon}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-line/15 bg-line/5 px-1.5 py-0.5 text-xs font-medium text-fg">
      {children}
    </kbd>
  )
}
