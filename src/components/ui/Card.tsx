import { motion, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'
import { fadeUp } from '../motion'

interface CardProps extends HTMLMotionProps<'section'> {
  lift?: boolean
  padded?: boolean | 'sm'
  label?: ReactNode
  action?: ReactNode
}

export function Card({
  lift,
  padded = true,
  label,
  action,
  className = '',
  children,
  ...rest
}: CardProps) {
  const pad = padded === 'sm' ? 'pad-sm' : padded ? 'pad' : ''
  return (
    <motion.section
      variants={fadeUp}
      className={`glass ${pad} ${lift ? 'lift' : ''} ${className}`}
      {...rest}
    >
      {(label || action) && (
        <header className="mb-3 flex min-h-6 items-center justify-between gap-3">
          {typeof label === 'string' ? <h2 className="label">{label}</h2> : label}
          {action}
        </header>
      )}
      {children as ReactNode}
    </motion.section>
  )
}
