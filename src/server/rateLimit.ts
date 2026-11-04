/**
 * Sliding-window rate limiter kept in memory. On serverless hosts each instance has its
 * own window, so this is a best-effort guard against abuse, not a billing control.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Record a hit. Returns whether it is allowed and how long until the next slot frees up. */
  hit(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfterMs: recent[0] + this.windowMs - now };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(since);
    return { allowed: true, retryAfterMs: 0 };
  }

  private prune(since: number): void {
    for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
  }
}
