const ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
])

/** Extract an 11-character video id from a YouTube URL or a bare id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim()
  if (ID.test(s)) return s
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (!HOSTS.has(url.hostname)) return null
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return ID.test(id) ? id : null
  }
  const v = url.searchParams.get('v')
  if (v && ID.test(v)) return v
  const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

export const thumbnailUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const embedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`

export interface OEmbed {
  title: string
  author_name: string
}

export async function fetchOEmbed(id: string, signal?: AbortSignal): Promise<OEmbed> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`
  const res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'This video does not allow embedding.'
        : 'Video not found.',
    )
  const data: unknown = await res.json()
  if (typeof data !== 'object' || data === null) throw new Error('Unexpected response')
  const o = data as Record<string, unknown>
  return { title: String(o.title ?? 'Untitled'), author_name: String(o.author_name ?? '') }
}
