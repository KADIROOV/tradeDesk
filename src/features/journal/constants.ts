import { tr, tMaybe } from '@/i18n'
import type { Session } from '@/lib/types'

export const SESSION_LABEL: Record<Session, string> = {
  asia: 'Asia',
  london: 'London',
  newyork: 'New York',
  overlap: 'LDN/NY overlap',
  other: 'Off-hours',
}
export const EMOTIONS = [
  'Calm',
  'Confident',
  'Patient',
  'Hesitant',
  'FOMO',
  'Frustrated',
  'Greedy',
  'Tired',
]

/** Display label for a session in the current language. */
export const sessionLabel = (s: Session): string => tr(`session.${s}`)

/** Display label for an emotion tag (values are stored in English). */
export const emotionLabel = (e: string): string => tMaybe(`emotion.${e}`, e)
