import { tr } from '@/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, GraduationCap, Heart, Link, Play, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/controls'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toastStore'
import { fadeUp, spring, stagger } from '@/components/motion'
import { embedUrl, fetchOEmbed, parseYouTubeId, thumbnailUrl } from '@/lib/youtube'
import { useStudy } from '@/store/study'
import { useUi } from '@/store/ui'
import { CATEGORIES, LESSONS, type Category, type Lesson } from './lessons'

type Filter = 'All' | 'Favorites' | Category

export default function StudyPage() {
  const { watched, favorites, custom } = useStudy()
  const [filter, setFilter] = useState<Filter>('All')
  const [q, setQ] = useState('')
  const [playing, setPlaying] = useState<Lesson | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const tick = useUi((s) => s.searchFocusTick)
  useEffect(() => {
    if (tick) searchRef.current?.focus()
  }, [tick])

  const all = useMemo(() => [...custom, ...LESSONS], [custom])
  const cats: Category[] = custom.length ? [...CATEGORIES, 'My lessons'] : [...CATEGORIES]
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((l) =>
        filter === 'All'
          ? true
          : filter === 'Favorites'
            ? favorites.includes(l.youtubeId)
            : l.category === filter,
      )
      .filter(
        (l) =>
          !needle ||
          `${l.title} ${l.channel} ${l.notes} ${l.category}`.toLowerCase().includes(needle),
      )
  }, [all, filter, q, favorites])
  const watchedCount = all.filter((l) => watched.includes(l.youtubeId)).length

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
      <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">{tr('study.label')}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {tr('study.title')}{' '}
            <span className="display text-accent">{tr('study.titleAccent')}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tr('study.progress', { w: watchedCount, n: all.length })}
          </p>
        </div>
        <AddLink />
      </motion.div>

      <Card padded="sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {cats.map((c) => {
            const list = all.filter((l) => l.category === c)
            const done = list.filter((l) => watched.includes(l.youtubeId)).length
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className="group text-left"
                aria-label={`${c}: ${done} of ${list.length} watched`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-medium ${filter === c ? 'text-accent' : 'text-fg'}`}>
                    {c}
                  </span>
                  <span className="tabular text-muted">
                    {done}/{list.length}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/10">
                  <motion.div
                    className="h-full origin-left rounded-full bg-accent"
                    initial={false}
                    animate={{ scaleX: list.length ? done / list.length : 0 }}
                    transition={spring}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="search"
            className="field pl-9"
            placeholder={tr('study.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={tr('study.searchAria')}
          />
        </div>
        <div
          className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
          role="tablist"
          aria-label={tr('study.category')}
        >
          {(['All', 'Favorites', ...cats] as Filter[]).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={filter === c}
              onClick={() => setFilter(c)}
              className={`relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === c ? 'text-fg' : 'text-muted hover:text-fg'}`}
            >
              {filter === c && (
                <motion.span
                  layoutId="study-chip"
                  className="absolute inset-0 rounded-full border border-line/12 bg-line/12"
                  transition={spring}
                />
              )}
              <span className="relative flex items-center gap-1">
                {c === 'Favorites' && <Heart className="size-3" />}
                {c === 'All' ? tr('study.all') : c === 'Favorites' ? tr('study.favorites') : c}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={filter === 'Favorites' ? <Heart /> : <GraduationCap />}
            title={filter === 'Favorites' ? 'No favourites yet' : 'No lessons found'}
            body={
              filter === 'Favorites'
                ? 'Tap the heart on any lesson to keep it here.'
                : 'Try another search or category.'
            }
            action={
              <Button
                onClick={() => {
                  setFilter('All')
                  setQ('')
                }}
              >
                Show all lessons
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {shown.map((l) => (
              <LessonCard key={l.youtubeId} lesson={l} onPlay={() => setPlaying(l)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
      <Player lesson={playing} onClose={() => setPlaying(null)} />
    </motion.div>
  )
}

const LEVEL_TONE: Record<string, string> = {
  beginner: 'bg-pos/12 text-pos',
  intermediate: 'bg-accent/12 text-accent',
  advanced: 'bg-neg/12 text-neg',
}

function LessonCard({ lesson, onPlay }: { lesson: Lesson; onPlay: () => void }) {
  const { watched, favorites, toggleWatched, toggleFavorite, removeCustom } = useStudy()
  const isWatched = watched.includes(lesson.youtubeId)
  const isFav = favorites.includes(lesson.youtubeId)
  const [loaded, setLoaded] = useState(false)
  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={spring}
      className="glass lift flex flex-col overflow-hidden"
    >
      <button
        type="button"
        onClick={onPlay}
        className="group relative block aspect-video overflow-hidden rounded-none"
        aria-label={`Play ${lesson.title}`}
      >
        {!loaded && <div className="skeleton absolute inset-0 rounded-none" />}
        <img
          src={thumbnailUrl(lesson.youtubeId)}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-[transform,opacity] duration-500 group-hover:scale-[1.04] ${loaded ? 'opacity-100' : 'opacity-0'} ${isWatched ? 'opacity-60' : ''}`}
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="grid size-14 place-items-center rounded-full bg-white/90 text-black shadow-xl">
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
        </span>
        {isWatched && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] font-medium text-white">
            <CircleCheck className="size-3" /> Watched
          </span>
        )}
        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] font-medium text-white">
          {lesson.category}
        </span>
      </button>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{lesson.title}</h3>
        <p className="mt-1 text-xs text-muted">{lesson.channel}</p>
        {lesson.notes && <p className="mt-2 line-clamp-2 text-xs text-muted">{lesson.notes}</p>}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold capitalize ${LEVEL_TONE[lesson.level]}`}
          >
            {lesson.level}
          </span>
          <div className="flex gap-0.5">
            {lesson.category === 'My lessons' && (
              <IconButton
                size="sm"
                label="Remove lesson"
                onClick={() => removeCustom(lesson.youtubeId)}
              >
                <Trash2 />
              </IconButton>
            )}
            <IconButton
              size="sm"
              label={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
              onClick={() => toggleWatched(lesson.youtubeId)}
              aria-pressed={isWatched}
              className={isWatched ? '!text-pos' : ''}
            >
              <CircleCheck />
            </IconButton>
            <IconButton
              size="sm"
              label={isFav ? 'Remove favourite' : 'Add to favourites'}
              onClick={() => toggleFavorite(lesson.youtubeId)}
              aria-pressed={isFav}
              className={isFav ? '!text-neg' : ''}
            >
              <motion.span
                animate={{ scale: isFav ? [1, 1.3, 1] : 1 }}
                transition={{ duration: 0.3 }}
                className="grid"
              >
                <Heart className={isFav ? 'fill-current' : ''} />
              </motion.span>
            </IconButton>
          </div>
        </div>
      </div>
    </motion.article>
  )
}

function Player({ lesson, onClose }: { lesson: Lesson | null; onClose: () => void }) {
  const { watched, toggleWatched } = useStudy()
  const [last, setLast] = useState(lesson)
  if (lesson && lesson !== last) setLast(lesson)
  const l = lesson ?? last
  const isWatched = l ? watched.includes(l.youtubeId) : false
  return (
    <Modal
      open={!!lesson}
      onClose={onClose}
      title={l?.title ?? ''}
      description={l?.channel}
      size="xl"
    >
      {l && (
        <>
          <div className="aspect-video overflow-hidden rounded-[var(--radius-sm)] bg-black">
            {lesson && (
              <iframe
                className="h-full w-full"
                src={embedUrl(l.youtubeId)}
                title={l.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted">{l.notes}</p>
            <Button
              variant={isWatched ? 'ghost' : 'primary'}
              icon={<CircleCheck />}
              onClick={() => toggleWatched(l.youtubeId)}
            >
              {isWatched ? tr('study.watched') : tr('study.markWatched')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

function AddLink() {
  const addCustom = useStudy((s) => s.addCustom)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    const id = parseYouTubeId(url)
    if (!id) return setError('Paste a YouTube link, e.g. youtube.com/watch?v=…')
    if (LESSONS.some((l) => l.youtubeId === id))
      return setError('That lesson is already in the library.')
    setBusy(true)
    setError(null)
    try {
      const o = await fetchOEmbed(id)
      addCustom({
        title: o.title,
        channel: o.author_name,
        youtubeId: id,
        category: 'My lessons',
        level: 'beginner',
        notes: '',
      })
      setUrl('')
      toast(`Added “${o.title}”`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that video.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex w-full flex-col gap-1 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1 sm:w-80">
          <Link className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            className="field pl-9"
            placeholder={tr('study.paste')}
            value={url}
            aria-invalid={!!error}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            aria-label="YouTube link"
          />
        </div>
        <Button type="submit" variant="primary" disabled={busy || !url.trim()}>
          {busy ? tr('study.adding') : tr('study.add')}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-neg" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
