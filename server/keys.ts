import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const KEY_PREFIX = 'tdk_'
const KEY_RE = /^tdk_[A-Za-z0-9_-]{43}$/

/** A new random sync key: "tdk_" + 32 random bytes (base64url). Shown to the user once. */
export function generateSyncKey(): string {
  return KEY_PREFIX + randomBytes(32).toString('base64url')
}

export function isWellFormedKey(key: string): boolean {
  return KEY_RE.test(key)
}

/** HMAC-SHA256 with a server-side pepper: a leaked database alone cannot verify guesses. */
export function hashSyncKey(key: string, pepper: string): string {
  return createHmac('sha256', pepper).update(key).digest('hex')
}

/** First characters, safe to display so users can tell keys apart. */
export function keyDisplayPrefix(key: string): string {
  return key.slice(0, 10)
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
