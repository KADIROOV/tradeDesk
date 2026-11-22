import { Check, Languages } from 'lucide-react'
import { Segmented } from '@/components/ui/controls'
import { saveProfile, useCloud } from '@/cloud/store'
import { LANGUAGES, tr, type Lang } from '@/i18n'
import { useSettings } from '@/store/settings'

function useChangeLanguage() {
  const setLanguage = useSettings((s) => s.setLanguage)
  const signedIn = useCloud((s) => s.status === 'signed-in')
  return (lang: Lang) => {
    setLanguage(lang)
    if (signedIn) void saveProfile({ settings: { language: lang } }).catch(() => undefined)
  }
}

/** Compact switcher (sign-in screen). */
export function LanguageSegmented({ className = '' }: { className?: string }) {
  const language = useSettings((s) => s.language)
  const change = useChangeLanguage()
  return (
    <Segmented
      label={tr('settings.language')}
      size="sm"
      className={className}
      value={language}
      onChange={change}
      options={LANGUAGES.map((l) => ({ value: l.id, label: l.id.toUpperCase() }))}
    />
  )
}

/** Settings → Language. */
export function LanguageTab() {
  const language = useSettings((s) => s.language)
  const change = useChangeLanguage()
  return (
    <section>
      <h3 className="text-base font-semibold tracking-tight">{tr('lang.title')}</h3>
      <p className="mb-4 text-sm text-muted">{tr('lang.body')}</p>
      <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label={tr('lang.title')}>
        {LANGUAGES.map((l) => {
          const active = l.id === language
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={active}
              lang={l.id}
              onClick={() => change(l.id)}
              className={`lift relative flex items-center gap-3 rounded-[var(--radius-sm)] border p-4 text-left ${active ? 'border-accent/70' : 'border-line/10 hover:border-line/25'}`}
            >
              <span className="grid size-9 place-items-center rounded-xl bg-accent/12 text-accent">
                <Languages className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{l.native}</span>
                <span className="block text-xs text-muted">{l.label}</span>
              </span>
              {active && <Check className="size-4 text-accent" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}
