"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InventoryPage, Listing, Release } from "./discogs/types";
import { matchesListing, matchesRelease, needsRelease, type Filters } from "./filters";

export const SCAN_STEP = 1000;
const BATCH = 10;

export type ScanStatus = "running" | "paused" | "done" | "error";

export interface ScanResult {
  listing: Listing;
  release: Release | null;
}

export interface Scan {
  status: ScanStatus;
  error: string | null;
  /** Listings fetched from the inventory so far. */
  scanned: number;
  /** Total listings the seller has for sale. */
  total: number | null;
  /** Listings that pass the cheap filters but are still waiting for release details. */
  pendingDetails: number;
  cap: number;
  results: ScanResult[];
  /** All loaded releases for listings that pass the inventory filters (for facet counts). */
  facetReleases: Release[];
  pause(): void;
  resume(): void;
  scanMore(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { status: res.status });
  return body as T;
}

/**
 * Walks a seller's inventory page by page, applies the cheap filters straight away, and
 * fetches release details (genres, styles, videos) only for the listings that pass.
 * Changing filters doesn't restart anything: the loop re-reads them on every step.
 * Changing the sort restarts the scan, because Discogs returns a different order.
 */
export function useSellerScan(username: string, filters: Filters): Scan {
  const [listings, setListings] = useState<Listing[]>([]);
  const [releases, setReleases] = useState<Map<number, Release>>(new Map());
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<ScanStatus>("running");
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [cap, setCap] = useState(SCAN_STEP);

  // The async loop reads live values through refs.
  const filtersRef = useRef(filters);
  const listingsRef = useRef(listings);
  const releasesRef = useRef(releases);
  const failedRef = useRef(failed);
  const capRef = useRef(cap);
  const pausedRef = useRef(false);
  const wakeRef = useRef<(() => void) | null>(null);

  const wake = useCallback(() => {
    wakeRef.current?.();
    wakeRef.current = null;
  }, []);

  useEffect(() => {
    filtersRef.current = filters;
    wake();
  }, [filters, wake]);
  useEffect(() => {
    capRef.current = cap;
    wake();
  }, [cap, wake]);

  const { sort, order } = filters;

  useEffect(() => {
    let cancelled = false;
    const idle = () => new Promise<void>((r) => (wakeRef.current = r));

    // Reset for a fresh scan.
    listingsRef.current = [];
    setListings([]);
    setTotal(null);
    setError(null);
    setStatus("running");
    pausedRef.current = false;

    let nextPage = 1;
    let pages = Infinity;
    let retries = 0;

    (async () => {
      while (!cancelled) {
        if (pausedRef.current) {
          await idle();
          continue;
        }
        const f = filtersRef.current;

        const want: number[] = [];
        for (const l of listingsRef.current) {
          if (want.length >= BATCH) break;
          if (!matchesListing(l, f)) continue;
          if (releasesRef.current.has(l.releaseId) || failedRef.current.has(l.releaseId)) continue;
          if (!want.includes(l.releaseId)) want.push(l.releaseId);
        }

        try {
          if (want.length) {
            setStatus("running");
            const data = await getJson<{ releases: Release[]; failed: number[]; retry: number[] }>("/api/releases", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: want }),
            });
            if (cancelled) return;
            const map = new Map(releasesRef.current);
            for (const r of data.releases) map.set(r.id, r);
            releasesRef.current = map;
            setReleases(map);
            if (data.failed.length) {
              const fs = new Set(failedRef.current);
              data.failed.forEach((id) => fs.add(id));
              failedRef.current = fs;
              setFailed(fs);
            }
            // Transient failures with no progress mean Discogs is throttling us: back off.
            if (data.retry.length && !data.releases.length && !data.failed.length) await sleep(10000);
          } else if (nextPage <= pages && listingsRef.current.length < capRef.current) {
            setStatus("running");
            const page = await getJson<InventoryPage>(
              `/api/seller/${encodeURIComponent(username)}/inventory?page=${nextPage}&sort=${sort}&order=${order}`,
            );
            if (cancelled) return;
            pages = page.pages;
            nextPage = page.page + 1;
            setTotal(page.items);
            const seen = new Set(listingsRef.current.map((l) => l.id));
            const merged = [...listingsRef.current, ...page.listings.filter((l) => !seen.has(l.id))];
            listingsRef.current = merged;
            setListings(merged);
          } else {
            setStatus("done");
            await idle();
          }
          retries = 0;
        } catch (err) {
          if (cancelled) return;
          const status = (err as { status?: number }).status ?? 0;
          // Seller-level problems (not found, private) are final.
          if ((status === 404 || status === 403) && listingsRef.current.length === 0) {
            setError((err as Error).message);
            setStatus("error");
            return;
          }
          if (++retries > 3) {
            setError(`${(err as Error).message}. Paused, press resume to try again.`);
            pausedRef.current = true;
            setStatus("error");
            retries = 0;
            continue;
          }
          await sleep(2000 * 2 ** retries);
        }
      }
    })();

    return () => {
      cancelled = true;
      wake();
    };
  }, [username, sort, order, wake]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setStatus("paused");
  }, []);
  const resume = useCallback(() => {
    pausedRef.current = false;
    setError(null);
    setStatus("running");
    wake();
  }, [wake]);
  const scanMore = useCallback(() => setCap((c) => c + SCAN_STEP), []);

  const derived = useMemo(() => {
    const strict = needsRelease(filters);
    const results: ScanResult[] = [];
    const facetReleases: Release[] = [];
    let pendingDetails = 0;
    for (const l of listings) {
      if (!matchesListing(l, filters)) continue;
      const r = releases.get(l.releaseId) ?? null;
      if (r) facetReleases.push(r);
      else if (!failed.has(l.releaseId)) pendingDetails++;
      if (r ? matchesRelease(r, filters) : !strict) results.push({ listing: l, release: r });
    }
    return { results, facetReleases, pendingDetails };
  }, [listings, releases, failed, filters]);

  return {
    status,
    error,
    scanned: listings.length,
    total,
    cap,
    ...derived,
    pause,
    resume,
    scanMore,
  };
}
