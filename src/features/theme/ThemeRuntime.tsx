import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadBlob } from '@/lib/idb'
import { useSettings } from '@/store/settings'
import { applyThemeToDocument, applyThemeWithTransition, prefersReducedMotion } from './applyTheme'
import { getBuiltinBackground } from './backgrounds'

/** Keeps <html> CSS variables in sync with the settings store. */
export function ThemeApplier() {
  const theme = useSettings((s) => s.theme)
  const prevPreset = useRef(theme.presetId)
  useEffect(() => {
    if (prevPreset.current !== theme.presetId) {
      prevPreset.current = theme.presetId
      applyThemeWithTransition(theme)
    } else applyThemeToDocument(theme)
  }, [theme])
  return null
}

function useObjectUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    let created: string | null = null
    loadBlob(id).then((blob) => {
      if (!alive || !blob) return
      created = URL.createObjectURL(blob)
      setUrl({ id, url: created })
    })
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [id])
  return url && url.id === id ? url.url : null
}

export function BackgroundLayer() {
  const bg = useSettings((s) => s.theme.background)
  const animations = useSettings((s) => s.theme.animations)
  const mediaUrl = useObjectUrl(bg.kind === 'upload' ? bg.uploadId : undefined)
  const layerRef = useRef<HTMLDivElement>(null)
  const parallax = bg.parallax && animations && !prefersReducedMotion()

  useEffect(() => {
    const el = layerRef.current
    if (!parallax || !el || !window.matchMedia('(pointer: fine)').matches) {
      if (el) el.style.transform = ''
      return
    }
    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    let raf = 0
    const tick = () => {
      x += (tx - x) * 0.08
      y += (ty - y) * 0.08
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.05 ? requestAnimationFrame(tick) : 0
    }
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * -24
      ty = (e.clientY / window.innerHeight - 0.5) * -24
      if (!raf) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
      el.style.transform = ''
    }
  }, [parallax])

  const overscan = bg.blur > 0 || parallax ? '-4%' : '0'
  let key: string
  let style: CSSProperties = {}
  let video: string | null = null
  if (bg.kind === 'solid') {
    key = `solid-${bg.solid}`
    style = { background: bg.solid }
  } else if (bg.kind === 'upload' && bg.uploadId) {
    key = `up-${bg.uploadId}-${bg.fit}`
    if (bg.uploadType === 'video') video = mediaUrl
    else if (mediaUrl)
      style = {
        backgroundImage: `url("${mediaUrl}")`,
        backgroundSize: bg.fit === 'tile' ? 'auto' : bg.fit,
        backgroundRepeat: bg.fit === 'tile' ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
      }
  } else {
    const b = getBuiltinBackground(bg.builtinId)
    key = `b-${b.id}`
    style = { background: b.css, backgroundSize: 'cover', backgroundPosition: 'center' }
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <div ref={layerRef} className="absolute inset-0 will-change-transform">
        <AnimatePresence initial={false}>
          <motion.div
            key={key}
            className="absolute"
            style={{
              inset: overscan,
              filter:
                'blur(var(--bg-blur)) brightness(var(--bg-brightness)) saturate(var(--bg-saturate))',
              ...style,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {video && (
              <video
                src={video}
                className="h-full w-full"
                style={{ objectFit: bg.fit === 'contain' ? 'contain' : 'cover' }}
                autoPlay={animations}
                muted
                loop
                playsInline
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div
        className="absolute inset-0"
        style={{ background: 'rgb(var(--base-rgb) / var(--bg-dim))' }}
      />
    </div>
  )
}

export function CustomCursor() {
  const style = useSettings((s) => s.theme.cursor)
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const [fine] = useState(() => window.matchMedia('(pointer: fine)').matches)

  useEffect(() => {
    if (style === 'default' || !fine) return
    let mx = -100
    let my = -100
    let rx = -100
    let ry = -100
    let raf = 0
    let hovering = false
    let down = false
    const loop = () => {
      rx += (mx - rx) * 0.2
      ry += (my - ry) * 0.2
      const scale = (hovering ? 1.6 : 1) * (down ? 0.85 : 1)
      if (dotRef.current)
        dotRef.current.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%) scale(${down ? 0.7 : 1})`
      if (ringRef.current)
        ringRef.current.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${scale})`
      raf = Math.abs(mx - rx) + Math.abs(my - ry) > 0.1 ? requestAnimationFrame(loop) : 0
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }
    const onMove = (e: PointerEvent) => {
      mx = e.clientX
      my = e.clientY
      const t = e.target as Element | null
      hovering = !!t?.closest?.(
        'a, button, [role="button"], [role="switch"], [role="radio"], select, label, input[type="range"]',
      )
      kick()
    }
    const onDown = () => {
      down = true
      kick()
    }
    const onUp = () => {
      down = false
      kick()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      cancelAnimationFrame(raf)
    }
  }, [style, fine])

  if (style === 'default' || !fine) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      {style === 'ring' && (
        <div
          ref={ringRef}
          className="absolute top-0 left-0 size-8 rounded-full border-[1.5px] transition-[opacity] duration-200"
          style={{
            borderColor: 'rgb(var(--accent-rgb) / 0.8)',
            transform: 'translate3d(-100px,-100px,0)',
          }}
        />
      )}
      <div
        ref={dotRef}
        className="absolute top-0 left-0 size-2 rounded-full"
        style={{
          background: 'var(--accent)',
          boxShadow: '0 0 12px rgb(var(--accent-rgb) / 0.7)',
          transform: 'translate3d(-100px,-100px,0)',
        }}
      />
    </div>
  )
}
