import { type MsgKey, tr } from '@/i18n'
import { motion } from 'framer-motion'
import {
  Check,
  X,
  CircleDot,
  Download,
  Film,
  ImagePlus,
  Layers,
  MousePointer2,
  Palette,
  Pencil,
  RotateCcw,
  Shield,
  SquarePen,
  Trash2,
  Type,
  Upload,
  UserRound,
  Image as ImageIcon,
} from 'lucide-react'
import { Fragment, useRef, useState, type ReactNode } from 'react'
import { Database, Languages, PlugZap, Tags } from 'lucide-react'
import { LanguageTab } from '@/features/settings/LanguagePicker'
import { AccountsTab } from '@/features/accounts/AccountsTab'
import { DataTab } from '@/features/accounts/DataTab'
import { SymbolsTab } from '@/features/accounts/SymbolsTab'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Segmented, Slider, Toggle } from '@/components/ui/controls'
import { toast } from '@/components/ui/toastStore'
import { spring } from '@/components/motion'
import { contrastRatio, isHex } from '@/lib/color'
import { deleteBlob, sampleAverageColor, saveBlob } from '@/lib/idb'
import { useSettings } from '@/store/settings'
import { useUi, type SettingsTab } from '@/store/ui'
import { BUILTIN_BACKGROUNDS } from './backgrounds'
import { exportThemeJson, GLASS_PRESETS, resolveTheme } from './engine'
import { ACCENT_SWATCHES, getPreset, THEME_PRESETS, type ThemePreset } from './presets'
import { prefersReducedMotion } from './applyTheme'

const TABS: { id: SettingsTab; label: MsgKey; icon: ReactNode; group?: MsgKey }[] = [
  { id: 'accounts', label: 'settings.accounts', icon: <PlugZap />, group: 'settings.groupSync' },
  { id: 'symbols', label: 'settings.symbols', icon: <Tags /> },
  { id: 'data', label: 'settings.data', icon: <Database /> },
  {
    id: 'language',
    label: 'settings.language',
    icon: <Languages />,
    group: 'settings.groupGeneral',
  },
  { id: 'themes', group: 'settings.groupAppearance', label: 'settings.themes', icon: <Palette /> },
  { id: 'colours', label: 'settings.colours', icon: <CircleDot /> },
  { id: 'background', label: 'settings.background', icon: <ImageIcon /> },
  { id: 'glass', label: 'settings.glass', icon: <Layers /> },
  { id: 'cursor', label: 'settings.cursor', icon: <MousePointer2 /> },
  { id: 'buttons', label: 'settings.buttons', icon: <SquarePen /> },
  { id: 'type', label: 'settings.type', icon: <Type /> },
  { id: 'profiles', label: 'settings.profiles', icon: <UserRound /> },
]

export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen)
  const close = useUi((s) => s.closeSettings)
  const tab = useUi((s) => s.settingsTab)
  const setTab = useUi((s) => s.setSettingsTab)
  return (
    <Modal open={open} onClose={close} title={tr('settings.title')} size="xl" bare>
      <div className="flex min-h-0 flex-1 flex-col md:h-[min(720px,88dvh)] md:flex-row">
        <nav
          aria-label={tr('settings.sections')}
          className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b hairline p-3 md:w-56 md:flex-col md:overflow-y-auto md:overflow-x-visible md:border-r md:border-b-0 md:p-4"
        >
          <div className="hidden px-2 pt-1 pb-4 md:block">
            <p className="text-lg font-semibold tracking-tight">{tr('settings.title')}</p>
            <p className="text-xs text-muted">{tr('settings.instant')}</p>
          </div>
          {TABS.map((t) => (
            <Fragment key={t.id}>
              {t.group && <p className="label hidden px-3 pt-3 pb-1 md:block">{tr(t.group)}</p>}
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`relative flex shrink-0 items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4 ${
                  tab === t.id ? 'text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="settings-tab"
                    className="absolute inset-0 rounded-[inherit] bg-line/10"
                    transition={spring}
                  />
                )}
                <span className="relative flex items-center gap-2.5">
                  {t.icon}
                  {tr(t.label)}
                </span>
              </button>
            </Fragment>
          ))}
        </nav>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex justify-end p-3 md:absolute md:right-0">
            <IconButton label={tr('settings.close')} onClick={close} size="sm" variant="ghost">
              <X />
            </IconButton>
          </div>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="px-5 pb-6 md:px-8 md:pt-7"
          >
            {tab === 'themes' && <ThemesTab />}
            {tab === 'colours' && <ColoursTab />}
            {tab === 'background' && <BackgroundTab />}
            {tab === 'glass' && <GlassTab />}
            {tab === 'cursor' && <CursorTab />}
            {tab === 'buttons' && <ButtonsTab />}
            {tab === 'type' && <TypeTab />}
            {tab === 'profiles' && <ProfilesTab />}
            {tab === 'accounts' && <AccountsTab />}
            {tab === 'symbols' && <SymbolsTab />}
            {tab === 'data' && <DataTab />}
            {tab === 'language' && <LanguageTab />}
          </motion.div>
        </div>
      </div>
    </Modal>
  )
}

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// ---------- Themes ----------

function PresetThumb({ preset, bgCss }: { preset: ThemePreset; bgCss: string }) {
  return (
    <div
      className="relative aspect-[16/10] overflow-hidden rounded-[calc(var(--radius-sm)-2px)]"
      style={{ background: preset.base }}
    >
      <div
        className="absolute inset-0"
        style={{ background: bgCss, backgroundSize: 'cover', opacity: 0.9 }}
      />
      <div className="absolute inset-x-[10%] top-[12%] flex gap-[5%]">
        <div
          className="h-1.5 w-[30%] rounded-full"
          style={{ background: preset.text, opacity: 0.9 }}
        />
        <div className="h-1.5 w-[14%] rounded-full" style={{ background: preset.accent }} />
      </div>
      <div className="absolute inset-x-[10%] top-[30%] bottom-[12%] flex gap-[5%]">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-1 flex-col justify-end gap-1 rounded-md border p-[6%]"
            style={{
              background: `${preset.surface}${Math.round(preset.cardOpacity * 255)
                .toString(16)
                .padStart(2, '0')}`,
              borderColor: preset.mode === 'dark' ? '#ffffff20' : '#00000014',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div className="h-1 w-1/2 rounded-full" style={{ background: preset.muted }} />
            <div
              className="h-2 w-3/4 rounded-full"
              style={{ background: i ? preset.negative : preset.positive }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ThemesTab() {
  const theme = useSettings((s) => s.theme)
  const choose = useSettings((s) => s.choosePreset)
  return (
    <Section
      title="Themes"
      description="Each preset sets the palette and a matching background. Your glass, type and uploads are kept."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {THEME_PRESETS.map((p) => {
          const active = theme.presetId === p.id
          const bg = BUILTIN_BACKGROUNDS.find((b) => b.id === p.background)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p.id)}
              aria-pressed={active}
              className={`lift group relative rounded-[var(--radius-sm)] border p-1.5 text-left ${active ? 'border-accent/70' : 'border-line/10 hover:border-line/25'}`}
            >
              <PresetThumb preset={p} bgCss={bg?.css ?? p.base} />
              <div className="flex items-center justify-between px-1 pt-2 pb-0.5">
                <span className="text-sm font-medium">{p.name}</span>
                {active ? (
                  <Check className="size-4 text-accent" />
                ) : (
                  <span className="text-[0.65rem] text-muted uppercase">{p.mode}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// ---------- Colours ----------

function ColourRow({
  label,
  value,
  onChange,
  swatches,
  against,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  swatches: string[]
  against: string
}) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  const ratio = contrastRatio(value, against)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${label} swatches`}>
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === c.toLowerCase()}
            aria-label={c}
            onClick={() => onChange(c)}
            className="relative grid size-8 place-items-center rounded-full border border-line/15 transition-transform hover:scale-110 active:scale-95"
            style={{ background: c }}
          >
            {value.toLowerCase() === c.toLowerCase() && (
              <Check
                className="size-4"
                style={{ color: contrastRatio(c, '#000') > 7 ? '#000' : '#fff' }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label
          className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-[var(--radius-sm)] border border-line/15"
          style={{ background: value }}
        >
          <span className="sr-only">Pick {label}</span>
          <input
            type="color"
            value={isHex(value) && value.length === 7 ? value : '#888888'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <input
          className="field w-32 font-mono uppercase"
          aria-label={`${label} hex`}
          value={draft}
          aria-invalid={!isHex(draft)}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            setDraft(v)
            if (isHex(v)) onChange(v)
          }}
        />
        <span
          className={`text-xs ${ratio >= 4.5 ? 'text-muted' : ratio >= 3 ? 'text-muted' : 'text-neg'}`}
        >
          {ratio.toFixed(1)}:1 on cards{' '}
          {ratio >= 4.5 ? '· AA' : ratio >= 3 ? '· AA large' : '· low'}
        </span>
      </div>
    </div>
  )
}

function ColoursTab() {
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  const p = getPreset(theme.presetId)
  return (
    <>
      <Section
        title="Accent"
        description="Buttons, focus rings, the nav indicator and highlights."
        action={<ResetLink onClick={() => setTheme({ accent: p.accent })} />}
      >
        <ColourRow
          label="Accent"
          value={theme.accent}
          onChange={(accent) => setTheme({ accent })}
          swatches={ACCENT_SWATCHES}
          against={p.surface}
        />
      </Section>
      <Section
        title="Profit"
        description="Positive P&L, wins and the calendar’s green days."
        action={<ResetLink onClick={() => setTheme({ positive: p.positive })} />}
      >
        <ColourRow
          label="Profit colour"
          value={theme.positive}
          onChange={(positive) => setTheme({ positive })}
          swatches={['#3ddc97', '#4ade80', '#22c55e', '#2dd4bf', '#38bdf8', '#28734a']}
          against={p.surface}
        />
      </Section>
      <Section
        title="Loss"
        description="Negative P&L, losses and the calendar’s red days."
        action={<ResetLink onClick={() => setTheme({ negative: p.negative })} />}
      >
        <ColourRow
          label="Loss colour"
          value={theme.negative}
          onChange={(negative) => setTheme({ negative })}
          swatches={['#ff7088', '#f87171', '#ef4444', '#fb923c', '#e879f9', '#b3343a']}
          against={p.surface}
        />
      </Section>
    </>
  )
}

function ResetLink({ onClick, label = 'Reset' }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="quiet" icon={<RotateCcw />} onClick={onClick}>
      {label}
    </Button>
  )
}

// ---------- Background ----------

const MAX_UPLOAD = 40 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']

function BackgroundTab() {
  const theme = useSettings((s) => s.theme)
  const bg = theme.background
  const setBackground = useSettings((s) => s.setBackground)
  const resetBackground = useSettings((s) => s.resetBackground)
  const setTheme = useSettings((s) => s.setTheme)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const resolved = resolveTheme(theme)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!ACCEPT.includes(file.type)) return toast('Use JPG, PNG, WebP, MP4 or WebM', 'info')
    if (file.size > MAX_UPLOAD) return toast('File is larger than 40 MB', 'info')
    setBusy(true)
    try {
      const kind = file.type.startsWith('video') ? 'video' : 'image'
      const id = await saveBlob(file, 'bg')
      const url = URL.createObjectURL(file)
      const avg = await sampleAverageColor(url, kind)
      URL.revokeObjectURL(url)
      const old = bg.uploadId
      setBackground({
        kind: 'upload',
        uploadId: id,
        uploadType: kind,
        uploadName: file.name,
        uploadAvg: avg,
      })
      if (old) void deleteBlob(old)
      toast('Background saved on this device')
    } catch {
      toast('Could not save the file', 'info')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Section
        title="Your background"
        description="Images and short videos are stored privately in this browser (IndexedDB)."
        action={<ResetLink onClick={resetBackground} label="Reset all" />}
      >
        <div
          className={`flex flex-col items-center justify-center gap-3 rounded-[var(--radius-sm)] border border-dashed p-6 text-center sm:flex-row sm:text-left ${bg.kind === 'upload' ? 'border-accent/60 bg-accent/5' : 'border-line/20'}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void onFile(e.dataTransfer.files[0])
          }}
        >
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-line/8 text-accent">
            {bg.uploadType === 'video' ? (
              <Film className="size-5" />
            ) : (
              <ImagePlus className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {bg.uploadName ?? 'Drop an image or video here'}
            </p>
            <p className="text-xs text-muted">JPG, PNG, WebP, MP4, WebM · up to 40 MB</p>
          </div>
          <div className="flex gap-2">
            {bg.uploadId && bg.kind !== 'upload' && (
              <Button size="sm" onClick={() => setBackground({ kind: 'upload' })}>
                Use again
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              icon={<Upload />}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? 'Saving…' : 'Upload'}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={ACCEPT.join(',')}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
        {bg.kind === 'upload' && (
          <div className="mt-3 flex items-center gap-3">
            <span className="label">Fit</span>
            <Segmented
              label="Background fit"
              size="sm"
              value={bg.fit}
              onChange={(fit) => setBackground({ fit })}
              options={[
                { value: 'cover', label: 'Cover' },
                { value: 'contain', label: 'Contain' },
                { value: 'tile', label: 'Tile' },
              ]}
            />
          </div>
        )}
      </Section>

      <Section title="Gallery" description="Original abstract backgrounds, drawn with CSS and SVG.">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
          {BUILTIN_BACKGROUNDS.map((b) => {
            const active = bg.kind === 'builtin' && bg.builtinId === b.id
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={active}
                onClick={() => setBackground({ kind: 'builtin', builtinId: b.id })}
                className="group text-left"
              >
                <div
                  className={`relative aspect-[4/3] overflow-hidden rounded-[var(--radius-sm)] border transition-transform group-active:scale-95 ${active ? 'border-accent ring-2 ring-accent/40' : 'border-line/10'}`}
                  style={{ background: b.css, backgroundSize: 'cover' }}
                >
                  {active && (
                    <Check className="absolute top-1.5 right-1.5 size-4 rounded-full bg-black/50 p-0.5 text-white" />
                  )}
                </div>
                <span className="mt-1 block truncate text-xs text-muted">{b.name}</span>
              </button>
            )
          })}
          <label className="group text-left">
            <div
              className={`relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[var(--radius-sm)] border ${bg.kind === 'solid' ? 'border-accent ring-2 ring-accent/40' : 'border-line/10'}`}
              style={{ background: bg.solid }}
            >
              <input
                type="color"
                aria-label="Solid background colour"
                value={bg.solid}
                onChange={(e) => setBackground({ kind: 'solid', solid: e.target.value })}
                onClick={() => setBackground({ kind: 'solid' })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <Palette className="size-4 text-white/80 mix-blend-difference" />
            </div>
            <span className="mt-1 block truncate text-xs text-muted">Solid colour</span>
          </label>
        </div>
      </Section>

      <Section title="Adjust">
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Blur"
            value={bg.blur}
            min={0}
            max={40}
            onChange={(blur) => setBackground({ blur })}
            format={(v) => `${v}px`}
          />
          <Slider
            label="Dim overlay"
            value={Math.round(bg.dim * 100)}
            min={0}
            max={90}
            onChange={(v) => setBackground({ dim: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Slider
            label="Brightness"
            value={bg.brightness}
            min={40}
            max={160}
            onChange={(brightness) => setBackground({ brightness })}
            format={(v) => `${v}%`}
          />
          <Slider
            label="Saturation"
            value={bg.saturation}
            min={0}
            max={200}
            onChange={(saturation) => setBackground({ saturation })}
            format={(v) => `${v}%`}
          />
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <Toggle
            label="Parallax on cursor"
            description="The background drifts gently as you move the mouse."
            checked={bg.parallax}
            onChange={(parallax) => setBackground({ parallax })}
          />
          <Toggle
            label="Contrast guard"
            description="Raises the dim and card opacity just enough to keep text at WCAG AA when a background is bright."
            checked={theme.contrastGuard}
            onChange={(contrastGuard) => setTheme({ contrastGuard })}
          />
          {(resolved.guardBoostedDim || resolved.guardBoostedCards) && (
            <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-accent/10 px-3 py-2 text-xs text-fg">
              <Shield className="mt-0.5 size-3.5 shrink-0 text-accent" />
              Contrast guard is active: dim {Math.round(resolved.effectiveDim * 100)}%, cards{' '}
              {Math.round(resolved.effectiveCardOpacity * 100)}% opaque.
            </p>
          )}
        </div>
      </Section>
    </>
  )
}

// ---------- Glass ----------

function GlassTab() {
  const glass = useSettings((s) => s.theme.glass)
  const setGlass = useSettings((s) => s.setGlass)
  const preset = (Object.keys(GLASS_PRESETS) as (keyof typeof GLASS_PRESETS)[]).find((k) => {
    const g = GLASS_PRESETS[k]
    return (
      g.blur === glass.blur &&
      g.opacity === glass.opacity &&
      g.border === glass.border &&
      g.noise === glass.noise
    )
  })
  return (
    <>
      <Section title="Glass" description="How the cards float over your background.">
        <div className="mb-6 grid grid-cols-3 gap-2.5">
          {(Object.keys(GLASS_PRESETS) as (keyof typeof GLASS_PRESETS)[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={preset === k}
              onClick={() => setGlass(GLASS_PRESETS[k])}
              className={`lift relative overflow-hidden rounded-[var(--radius-sm)] border p-3 text-left ${preset === k ? 'border-accent/70' : 'border-line/10'}`}
            >
              <div
                className="relative h-16 overflow-hidden rounded-lg"
                style={{
                  background:
                    'linear-gradient(135deg, rgb(var(--accent-rgb)/.9), rgb(var(--pos-rgb)/.6) 60%, rgb(var(--neg-rgb)/.6))',
                }}
              >
                <div
                  className="absolute inset-x-3 top-3 bottom-0 rounded-t-lg border border-white/20"
                  style={{
                    background: `rgb(var(--surface-rgb) / ${GLASS_PRESETS[k].opacity})`,
                    backdropFilter: `blur(${GLASS_PRESETS[k].blur}px)`,
                  }}
                />
              </div>
              <span className="mt-2 block text-sm font-medium capitalize">{k}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Card blur"
            value={glass.blur}
            min={0}
            max={40}
            onChange={(blur) => setGlass({ blur })}
            format={(v) => `${v}px`}
          />
          <Slider
            label="Card opacity"
            value={Math.round(glass.opacity * 100)}
            min={0}
            max={100}
            onChange={(v) => setGlass({ opacity: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Slider
            label="Border opacity"
            value={Math.round(glass.border * 100)}
            min={0}
            max={50}
            onChange={(v) => setGlass({ border: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Slider
            label="Noise / grain"
            value={Math.round(glass.noise * 100)}
            min={0}
            max={30}
            onChange={(v) => setGlass({ noise: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Slider
            label="Corner radius"
            value={glass.radius}
            min={6}
            max={32}
            onChange={(radius) => setGlass({ radius })}
            format={(v) => `${v}px`}
          />
        </div>
      </Section>
    </>
  )
}

// ---------- Cursor / Buttons ----------

function CursorTab() {
  const cursor = useSettings((s) => s.theme.cursor)
  const setTheme = useSettings((s) => s.setTheme)
  const options = [
    { value: 'default' as const, label: 'System', preview: <MousePointer2 className="size-5" /> },
    {
      value: 'dot' as const,
      label: 'Dot',
      preview: <span className="size-2.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />,
    },
    {
      value: 'ring' as const,
      label: 'Ring',
      preview: (
        <span className="relative grid size-8 place-items-center rounded-full border-[1.5px] border-accent/80">
          <span className="size-2 rounded-full bg-accent" />
        </span>
      ),
    },
  ]
  return (
    <Section
      title="Cursor"
      description="A custom cursor for mouse and trackpad. Touch devices always use the system pointer."
    >
      <div className="grid grid-cols-3 gap-3">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={cursor === o.value}
            onClick={() => setTheme({ cursor: o.value })}
            className={`lift relative flex flex-col items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-6 ${cursor === o.value ? 'border-accent/70' : 'border-line/10'}`}
          >
            <div className="grid h-10 place-items-center">{o.preview}</div>
            <span className="text-sm font-medium">{o.label}</span>
          </button>
        ))}
      </div>
    </Section>
  )
}

function ButtonsTab() {
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  return (
    <>
      <Section title="Button style">
        <Segmented
          label="Button style"
          value={theme.buttonStyle}
          onChange={(buttonStyle) => setTheme({ buttonStyle })}
          options={[
            { value: 'soft', label: 'Soft' },
            { value: 'outline', label: 'Outline' },
            { value: 'solid', label: 'Solid' },
          ]}
        />
      </Section>
      <Section title="Size">
        <Segmented
          label="Button size"
          value={theme.buttonSize}
          onChange={(buttonSize) => setTheme({ buttonSize })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
          ]}
        />
      </Section>
      <Section title="Preview">
        <div className="glass pad flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Check />}>
            Save trade
          </Button>
          <Button icon={<Pencil />}>Edit</Button>
          <Button variant="quiet">Cancel</Button>
          <Button variant="danger" icon={<Trash2 />}>
            Delete
          </Button>
          <input className="field max-w-48" placeholder="Input field" aria-label="Preview input" />
        </div>
      </Section>
    </>
  )
}

// ---------- Type & motion ----------

function TypeTab() {
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  const reduced = prefersReducedMotion()
  return (
    <>
      <Section title="Typography">
        <div className="flex flex-col gap-5">
          <Slider
            label="Font size"
            value={Math.round(theme.fontScale * 100)}
            min={85}
            max={120}
            step={5}
            onChange={(v) => setTheme({ fontScale: v / 100 })}
            format={(v) => `${v}%`}
          />
          <div className="glass pad">
            <p className="label">Total P&L</p>
            <p className="display mt-1 text-4xl text-pos">+$4,820.50</p>
          </div>
        </div>
      </Section>
      <Section title="Density">
        <Segmented
          label="Density"
          value={theme.density}
          onChange={(density) => setTheme({ density })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'spacious', label: 'Spacious' },
          ]}
        />
      </Section>
      <Section title="Motion">
        <Toggle
          label="Animations"
          description={
            reduced
              ? 'Your system asks for reduced motion, so animations stay minimal regardless.'
              : 'Page transitions, count-ups, hover lifts and the theme cross-fade.'
          }
          checked={theme.animations}
          onChange={(animations) => setTheme({ animations })}
        />
      </Section>
    </>
  )
}

// ---------- Profiles ----------

function ProfilesTab() {
  const s = useSettings()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const active = s.profiles.find((p) => p.id === s.activeProfileId)

  const download = () => {
    const json = exportThemeJson(active?.name ?? getPreset(s.theme.presetId).name, s.theme)
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(active?.name ?? 'theme').toLowerCase().replace(/\s+/g, '-')}.theme.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const json: unknown = JSON.parse(await file.text())
      const n =
        typeof json === 'object' && json && 'name' in json && typeof json.name === 'string'
          ? json.name
          : file.name.replace(/\.json$/, '')
      s.importTheme(json, n)
      toast(`Imported “${n}”`)
    } catch {
      toast('That file is not a valid theme', 'info')
    }
  }

  return (
    <>
      <Section title="Save current look" description="Name it, switch back any time.">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            s.saveProfile(name || `Look ${s.profiles.length + 1}`)
            setName('')
            toast('Profile saved')
          }}
        >
          <input
            className="field"
            placeholder={`Look ${s.profiles.length + 1}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Profile name"
          />
          <Button type="submit" variant="primary">
            Save
          </Button>
        </form>
      </Section>
      <Section title="Profiles">
        {s.profiles.length === 0 ? (
          <p className="text-sm text-muted">No saved profiles yet.</p>
        ) : (
          <ul className="divide-hairline overflow-hidden rounded-[var(--radius-sm)] border border-line/10">
            {s.profiles.map((p) => {
              const preset = getPreset(p.theme.presetId)
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="size-6 shrink-0 rounded-full border border-line/20"
                    style={{
                      background: `linear-gradient(135deg, ${preset.base} 50%, ${p.theme.accent} 50%)`,
                    }}
                  />
                  {editing === p.id ? (
                    <input
                      className="field h-8"
                      defaultValue={p.name}
                      autoFocus
                      aria-label="Rename profile"
                      onBlur={(e) => {
                        s.renameProfile(p.id, e.target.value || p.name)
                        setEditing(null)
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                      onClick={() => s.loadProfile(p.id)}
                    >
                      {p.name}
                      {s.activeProfileId === p.id && (
                        <span className="ml-2 text-xs text-accent">active</span>
                      )}
                    </button>
                  )}
                  <div className="flex shrink-0 gap-1">
                    {s.activeProfileId !== p.id && (
                      <Button size="sm" onClick={() => s.loadProfile(p.id)}>
                        Apply
                      </Button>
                    )}
                    {s.activeProfileId === p.id && (
                      <Button
                        size="sm"
                        onClick={() => {
                          s.overwriteProfile(p.id)
                          toast('Profile updated')
                        }}
                      >
                        Update
                      </Button>
                    )}
                    <IconButton size="sm" label="Rename" onClick={() => setEditing(p.id)}>
                      <Pencil />
                    </IconButton>
                    <IconButton
                      size="sm"
                      label="Delete profile"
                      onClick={() => s.deleteProfile(p.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      <Section
        title="Share"
        description="Export the current look as JSON, or import one. Uploaded media stays on this device."
      >
        <div className="flex flex-wrap gap-2">
          <Button icon={<Download />} onClick={download}>
            Export JSON
          </Button>
          <Button icon={<Upload />} onClick={() => importRef.current?.click()}>
            Import JSON
          </Button>
          <Button variant="quiet" icon={<RotateCcw />} onClick={() => s.resetTheme()}>
            Reset to preset
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </div>
      </Section>
    </>
  )
}
