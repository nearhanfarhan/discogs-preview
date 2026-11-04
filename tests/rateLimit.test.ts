import { describe, expect, it } from "vitest";
import { RateLimitedQueue } from "@/lib/discogs/rateLimit";

function harness() {
  let now = 0;
  const sleeps: number[] = [];
  const queue = new RateLimitedQueue({
    minIntervalMs: 1000,
    lowWaterMark: 2,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });
  return { queue, sleeps, tick: (ms: number) => (now += ms) };
}

const res = (status: number, remaining?: number, extra: Record<string, string> = {}) =>
  new Response("{}", {
    status,
    headers: { ...(remaining !== undefined ? { "x-discogs-ratelimit-remaining": String(remaining) } : {}), ...extra },
  });

describe("RateLimitedQueue", () => {
  it("runs calls one at a time, in order", async () => {
    const { queue } = harness();
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;
    const call = (n: number) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      order.push(n);
      active--;
      return res(200, 50);
    };
    await Promise.all([1, 2, 3].map((n) => queue.schedule(call(n))));
    expect(order).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
  });

  it("doesn't wait while there is budget, then spaces calls once it runs low", async () => {
    const { queue, sleeps } = harness();
    await queue.schedule(async () => res(200, 10));
    await queue.schedule(async () => res(200, 2));
    expect(sleeps).toEqual([]);
    await queue.schedule(async () => res(200, 1));
    await queue.schedule(async () => res(200, 0));
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("retries a 429 with backoff, honouring Retry-After", async () => {
    const { queue, sleeps } = harness();
    const responses = [res(429, 0, { "retry-after": "3" }), res(429, 0), res(200, 30)];
    let calls = 0;
    const out = await queue.schedule(async () => responses[calls++]);
    expect(out.status).toBe(200);
    expect(calls).toBe(3);
    expect(sleeps).toContain(3000);
    expect(sleeps).toContain(4000); // 2 ** 1 * 2000 on the second attempt
  });

  it("gives up after maxRetries and returns the 429", async () => {
    const { queue } = harness();
    let calls = 0;
    const out = await queue.schedule(async () => {
      calls++;
      return res(429, 0);
    });
    expect(out.status).toBe(429);
    expect(calls).toBe(5);
  });

  it("keeps working after a call throws", async () => {
    const { queue } = harness();
    await expect(queue.schedule(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const ok = await queue.schedule(async () => res(200, 40));
    expect(ok.status).toBe(200);
  });
});
