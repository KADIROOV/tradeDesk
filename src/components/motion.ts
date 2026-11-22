import type { Transition, Variants } from 'framer-motion'

export const spring: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }
export const softSpring: Transition = { type: 'spring', stiffness: 220, damping: 30 }

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: softSpring },
}

export const page: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { ...softSpring, when: 'beforeChildren' } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
}
