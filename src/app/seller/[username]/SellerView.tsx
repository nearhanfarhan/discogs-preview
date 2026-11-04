"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FilterPanel } from "@/components/FilterPanel";
import { RecordCard } from "@/components/RecordCard";
import { parseFilters, serializeFilters, type Filters } from "@/lib/filters";
import { useSellerScan } from "@/lib/useSellerScan";
import { usePlayer, type PlayerRecord } from "@/store/player";

export function SellerView({ username }: { username: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const updateFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = serializeFilters({ ...filtersRef.current, ...patch }).toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const scan = useSellerScan(username, filters);
  const { results } = scan;

  // Keep the player's queue in step with what's on screen.
  const playable = useMemo<PlayerRecord[]>(
    () => results.filter((x) => x.release && x.release.videos.length).map((x) => ({ listing: x.listing, release: x.release! })),
    [results],
  );
  useEffect(() => {
    usePlayer.getState().setRecords(playable);
  }, [playable]);

  const isPlaying = usePlayer((s) => s.current !== null);
  const currency = results[0]?.listing.price.currency ?? null;

  const progress = scan.total ? Math.min(100, Math.round((scan.scanned / Math.min(scan.total, scan.cap)) * 100)) : 0;
  const capped = scan.total !== null && scan.scanned >= scan.cap && scan.total > scan.scanned;

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
      <div className="lg:sticky lg:top-20 lg:self-start">
        <details className="group lg:open" open>
          <summary className="mb-3 cursor-pointer list-none text-sm font-semibold text-zinc-300 lg:hidden">
            Filters ▾
          </summary>
          <FilterPanel filters={filters} onChange={updateFilters} facetReleases={scan.facetReleases} currency={currency} />
        </details>
      </div>

      <main className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">
              <a href={`https://www.discogs.com/seller/${encodeURIComponent(username)}/profile`} target="_blank" rel="noreferrer" className="hover:underline">
                {username}
              </a>
            </h1>
            <p className="text-sm text-zinc-400" data-testid="scan-status">
              {scan.status === "error" && !scan.scanned ? (
                <span className="text-rose-300">{scan.error}</span>
              ) : (
                <>
                  <strong className="text-zinc-200">{results.length}</strong> matching · scanned {scan.scanned}
                  {scan.total !== null && ` of ${scan.total}`} listings
                  {scan.pendingDetails > 0 && ` · loading details for ${scan.pendingDetails}`}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {scan.status === "running" && (
              <button onClick={scan.pause} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                Pause scan
              </button>
            )}
            {(scan.status === "paused" || (scan.status === "error" && scan.scanned > 0)) && (
              <button onClick={scan.resume} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                Resume scan
              </button>
            )}
            {capped && scan.status === "done" && (
              <button onClick={scan.scanMore} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                Scan 1,000 more
              </button>
            )}
            <button
              disabled={!playable.length}
              onClick={() => {
                const p = usePlayer.getState();
                if (p.shuffle) p.nextRecord();
                else p.play(playable[0].listing.id);
              }}
              className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
            >
              ▶ Play all ({playable.length})
            </button>
          </div>
        </div>

        {scan.total !== null && scan.status !== "done" && (
          <div className="mb-4 h-1 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {scan.status === "error" && scan.scanned > 0 && <p className="mb-4 text-sm text-rose-300">{scan.error}</p>}

        {results.length === 0 && scan.status === "done" && (
          <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-zinc-400">
            No records match these filters{capped ? " in the listings scanned so far" : ""}.
          </div>
        )}
        {results.length === 0 && scan.status === "running" && (
          <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">Digging through the crates…</div>
        )}

        <div className={`grid gap-3 md:grid-cols-2 ${isPlaying ? "pb-[calc(var(--player-h)+240px)]" : ""}`}>
          {results.map(({ listing, release }) => (
            <RecordCard key={listing.id} listing={listing} release={release} />
          ))}
        </div>
      </main>
    </div>
  );
}
