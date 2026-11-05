import type { DiscogsPrice } from "./discogs/types";

export function formatPrice(p: DiscogsPrice | null | undefined): string {
  if (!p) return "";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(p.value);
  } catch {
    return `${p.value.toFixed(2)} ${p.currency}`;
  }
}

/** "Very Good Plus (VG+)" → "VG+" */
export function conditionCode(c: string | null | undefined): string {
  if (!c) return "";
  const m = c.match(/\(([^)]+)\)/);
  return m ? m[1].replace(" or M-", "") : c;
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
