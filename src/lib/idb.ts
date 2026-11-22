import { del, get, set } from 'idb-keyval'
import { uid } from './format'

/** Media (backgrounds, screenshots) lives in IndexedDB as Blobs. */
export async function saveBlob(blob: Blob, prefix: string): Promise<string> {
  const id = `${prefix}:${uid()}`
  await set(id, blob)
  return id
}

export async function loadBlob(id: string): Promise<Blob | undefined> {
  const v: unknown = await get(id)
  return v instanceof Blob ? v : undefined
}

export async function deleteBlob(id: string): Promise<void> {
  await del(id)
}

/** Average colour of an image or the first frame of a video, for the contrast guard. */
export async function sampleAverageColor(
  url: string,
  kind: 'image' | 'video',
): Promise<string | undefined> {
  try {
    const el: HTMLImageElement | HTMLVideoElement = await new Promise((resolve, reject) => {
      if (kind === 'image') {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = url
      } else {
        const v = document.createElement('video')
        v.muted = true
        v.preload = 'auto'
        v.onloadeddata = () => resolve(v)
        v.onerror = reject
        v.src = url
      }
    })
    const c = document.createElement('canvas')
    c.width = 24
    c.height = 24
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return undefined
    ctx.drawImage(el, 0, 0, 24, 24)
    const d = ctx.getImageData(0, 0, 24, 24).data
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]
      g += d[i + 1]
      b += d[i + 2]
    }
    const n = d.length / 4
    const hex = (v: number) =>
      Math.round(v / n)
        .toString(16)
        .padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  } catch {
    return undefined
  }
}
