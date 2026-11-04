export interface QueueOptions {
  /** Spacing between calls once the remaining budget is low (ms). Discogs allows 60/min. */
  minIntervalMs?: number;
  /** Start spacing calls when the remaining budget drops to this many requests. */
  lowWaterMark?: number;
  /** Max retries after a 429. */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Serialises requests to one Discogs rate-limit bucket.
 * Runs at full speed while the `X-Discogs-Ratelimit-Remaining` header says there is budget,
 * then drops to one call per `minIntervalMs`, and retries 429s with exponential backoff.
 */
export class RateLimitedQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private remaining = Infinity;
  private lastCall = 0;
  private readonly minIntervalMs: number;
  private readonly lowWaterMark: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(opts: QueueOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 1100;
    this.lowWaterMark = opts.lowWaterMark ?? 5;
    this.maxRetries = opts.maxRetries ?? 4;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
  }

  schedule(call: () => Promise<Response>): Promise<Response> {
    const run = this.tail.then(() => this.execute(call));
    // Keep the chain alive even if this call fails.
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async execute(call: () => Promise<Response>): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (this.remaining <= this.lowWaterMark) {
        const wait = this.lastCall + this.minIntervalMs - this.now();
        if (wait > 0) await this.sleep(wait);
      }
      this.lastCall = this.now();
      const res = await call();
      const remaining = Number(res.headers.get("x-discogs-ratelimit-remaining"));
      if (Number.isFinite(remaining) && res.headers.has("x-discogs-ratelimit-remaining")) {
        this.remaining = remaining;
      }
      if (res.status !== 429 || attempt >= this.maxRetries) return res;
      this.remaining = 0;
      const retryAfter = Number(res.headers.get("retry-after"));
      await this.sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 2000);
    }
  }
}
