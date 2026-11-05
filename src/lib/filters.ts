import type { InventorySort, Listing, Release, SortOrder } from "./discogs/types";

/** Discogs' fixed top-level genre list. Styles are open-ended and discovered as releases load. */
export const GENRES = [
  "Blues",
  "Brass & Military",
  "Children's",
  "Classical",
  "Electronic",
  "Folk, World, & Country",
  "Funk / Soul",
  "Hip Hop",
  "Jazz",
  "Latin",
  "Non-Music",
  "Pop",
  "Reggae",
  "Rock",
  "Stage & Screen",
] as const;

export const FORMATS = ["LP", '12"', '10"', '7"', "CD", "Cassette"] as const;

/** Grading scale, best first. `rank` is used for "at least" comparisons. */
export const CONDITIONS = [
  { code: "M", name: "Mint", rank: 8 },
  { code: "NM", name: "Near Mint", rank: 7 },
  { code: "VG+", name: "Very Good Plus", rank: 6 },
  { code: "VG", name: "Very Good", rank: 5 },
  { code: "G+", name: "Good Plus", rank: 4 },
  { code: "G", name: "Good", rank: 3 },
  { code: "F", name: "Fair", rank: 2 },
  { code: "P", name: "Poor", rank: 1 },
] as const;

export type ConditionCode = (typeof CONDITIONS)[number]["code"];

/** How several selected genres combine: "any" = OR, "all" = AND. */
export type MatchMode = "any" | "all";

export interface Filters {
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  formats: string[];
  minCondition?: ConditionCode;
  genres: string[];
  genreMode: MatchMode;
  styles: string[];
  audioOnly: boolean;
  sort: InventorySort;
  order: SortOrder;
}

export const DEFAULT_FILTERS: Filters = {
  formats: [],
  genres: [],
  genreMode: "any",
  styles: [],
  audioOnly: true,
  sort: "listed",
  order: "desc",
};

/** Rank a Discogs condition string like "Very Good Plus (VG+)". Unknown/generic → 0. */
export function conditionRank(condition: string | null | undefined): number {
  if (!condition) return 0;
  const c = condition.trim().toLowerCase();
  // Longest names first so "Very Good Plus" isn't read as "Very Good".
  const byLength = [...CONDITIONS].sort((a, b) => b.name.length - a.name.length);
  return byLength.find((x) => c.startsWith(x.name.toLowerCase()))?.rank ?? 0;
}

export function matchesFormat(format: string, wanted: string): boolean {
  const f = format.toLowerCase();
  switch (wanted) {
    case "LP":
      return /(^|[^a-z]|\dx)lp\b/.test(f); // "LP", "2xLP"
    case "Cassette":
      return /\bcass/.test(f);
    case "CD":
      return /(^|[^a-z]|\dx)cdr?\b/.test(f); // "CD", "2xCD", "CDr"
    default:
      return f.includes(wanted.toLowerCase());
  }
}

/** Cheap filters that only need the inventory listing. */
export function matchesListing(l: Listing, f: Filters): boolean {
  const price = l.price.value;
  if (f.priceMin !== undefined && price < f.priceMin) return false;
  if (f.priceMax !== undefined && price > f.priceMax) return false;
  if (f.yearMin !== undefined || f.yearMax !== undefined) {
    if (!l.year) return false;
    if (f.yearMin !== undefined && l.year < f.yearMin) return false;
    if (f.yearMax !== undefined && l.year > f.yearMax) return false;
  }
  if (f.formats.length && !f.formats.some((w) => matchesFormat(l.format, w))) return false;
  if (f.minCondition) {
    const min = CONDITIONS.find((c) => c.code === f.minCondition)?.rank ?? 0;
    if (conditionRank(l.condition) < min) return false;
  }
  return true;
}

/** Filters that need full release details (genre, style, audio). */
export function matchesRelease(r: Release, f: Filters): boolean {
  if (f.audioOnly && r.videos.length === 0) return false;
  if (f.genres.length) {
    const has = (g: string) => r.genres.includes(g);
    if (!(f.genreMode === "all" ? f.genres.every(has) : f.genres.some(has))) return false;
  }
  if (f.styles.length && !f.styles.some((s) => r.styles.includes(s))) return false;
  return true;
}

/** Does this filter set need release details at all? */
export function needsRelease(f: Filters): boolean {
  return f.audioOnly || f.genres.length > 0 || f.styles.length > 0;
}

/* ---------- URL (de)serialisation so filtered views are shareable ---------- */

const num = (v: string | null) => {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const list = (v: string | null) => (v ? v.split("|").filter(Boolean) : []);
const SORTS: InventorySort[] = ["listed", "price", "artist", "item"];

export function parseFilters(sp: URLSearchParams): Filters {
  const sort = sp.get("sort") as InventorySort | null;
  const cond = sp.get("cond") as ConditionCode | null;
  return {
    priceMin: num(sp.get("pmin")),
    priceMax: num(sp.get("pmax")),
    yearMin: num(sp.get("ymin")),
    yearMax: num(sp.get("ymax")),
    formats: list(sp.get("fmt")),
    minCondition: cond && CONDITIONS.some((c) => c.code === cond) ? cond : undefined,
    genres: list(sp.get("genre")),
    genreMode: sp.get("gmode") === "all" ? "all" : "any",
    styles: list(sp.get("style")),
    audioOnly: sp.get("audio") !== "0",
    sort: sort && SORTS.includes(sort) ? sort : DEFAULT_FILTERS.sort,
    order: sp.get("order") === "asc" ? "asc" : "desc",
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  };
  set("pmin", f.priceMin);
  set("pmax", f.priceMax);
  set("ymin", f.yearMin);
  set("ymax", f.yearMax);
  if (f.formats.length) sp.set("fmt", f.formats.join("|"));
  set("cond", f.minCondition);
  if (f.genres.length) sp.set("genre", f.genres.join("|"));
  if (f.genreMode === "all") sp.set("gmode", "all");
  if (f.styles.length) sp.set("style", f.styles.join("|"));
  if (!f.audioOnly) sp.set("audio", "0");
  if (f.sort !== DEFAULT_FILTERS.sort) sp.set("sort", f.sort);
  if (f.order !== DEFAULT_FILTERS.order) sp.set("order", f.order);
  return sp;
}
