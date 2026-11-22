/**
 * Sliding-window limiter. State lives in the function instance, so it is a
 * best-effort guard per warm instance (see README threat model), backed by the
 * per-request cost limits (batch size, body size) and authenticated keys.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns seconds to wait, or 0 when the request is allowed. */
  check(key: string, now = Date.now()): number {
    const from = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter((t) => t > from)
    if (list.length >= this.limit) {
      this.hits.set(key, list)
      return Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000))
    }
    list.push(now)
    this.hits.set(key, list)
    if (this.hits.size > 10_000) this.prune(from)
    return 0
  }

  private prune(from: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => t > from)) this.hits.delete(k)
  }
}
