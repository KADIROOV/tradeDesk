import { animate, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useSettings } from '@/store/settings'

interface CountUpProps {
  value: number
  format: (v: number) => string
  className?: string
  duration?: number
}

/** Animates text content directly (no re-render per frame). */
export function CountUp({ value, format, className, duration = 0.9 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  const reduce = useReducedMotion()
  const animations = useSettings((s) => s.theme.animations)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || !animations || !Number.isFinite(value)) {
      el.textContent = format(value)
      from.current = value
      return
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = format(v)
      },
    })
    from.current = value
    return () => controls.stop()
  }, [value, format, reduce, animations, duration])
  return (
    <span ref={ref} className={`tabular ${className ?? ''}`}>
      {format(value)}
    </span>
  )
}
