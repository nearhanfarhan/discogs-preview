import { NextResponse } from "next/server";
import { DiscogsError, fetchRelease } from "@/lib/discogs/client";
import { getCachedReleases, putCachedRelease } from "@/lib/db";
import type { Release } from "@/lib/discogs/types";

const MAX_IDS = 20;

/**
 * POST { ids: number[] } → { releases: Release[], failed: number[], retry: number[] }
 * `failed` = permanent (e.g. 404); `retry` = transient (rate limit, Discogs down), ask again later.
 * Serves from the cache where possible; misses go through the rate-limited Discogs queue.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const raw = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
  const ids = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_IDS);

  const cached = await getCachedReleases(ids);
  const releases: Release[] = [...cached.values()];
  const failed: number[] = [];
  const retry: number[] = [];
  const misses = ids.filter((id) => !cached.has(id));

  for (let i = 0; i < misses.length; i++) {
    const id = misses[i];
    try {
      const r = await fetchRelease(id);
      await putCachedRelease(r);
      releases.push(r);
    } catch (err) {
      const status = err instanceof DiscogsError ? err.status : 0;
      if (status === 404 || status === 403) {
        failed.push(id);
        continue;
      }
      if (!(err instanceof DiscogsError)) console.error("release", id, err);
      // Rate limited or Discogs unavailable: stop and let the client retry the rest later.
      retry.push(...misses.slice(i));
      break;
    }
  }
  return NextResponse.json({ releases, failed, retry });
}
