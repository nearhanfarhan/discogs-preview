"use client";

import { useEffect, useState } from "react";
import { CONDITIONS, DEFAULT_FILTERS, FORMATS, GENRES, type ConditionCode, type Filters } from "@/lib/filters";
import type { InventorySort, Release } from "@/lib/discogs/types";

interface Props {
  filters: Filters;
  /** Partial update; the parent merges it with the latest filters. */
  onChange(patch: Partial<Filters>): void;
  /** Loaded releases that pass the inventory filters, used for genre/style counts. */
  facetReleases: Release[];
  currency: string | null;
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FilterPanel({ filters, onChange, facetReleases, currency }: Props) {
  const set = onChange;

  const genreCounts = new Map<string, number>();
  const styleCounts = new Map<string, number>();
  for (const r of facetReleases) {
    r.genres.forEach((g) => genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1));
    r.styles.forEach((s) => styleCounts.set(s, (styleCounts.get(s) ?? 0) + 1));
  }
  const styles = [...new Set([...filters.styles, ...[...styleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)])].slice(
    0,
    Math.max(40, filters.styles.length),
  );

  const sortValue = `${filters.sort}:${filters.order}`;

  return (
    <aside className="space-y-5 text-sm" aria-label="Filters">
      <Section title="Sort">
        <select
          value={sortValue}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(":") as [InventorySort, "asc" | "desc"];
            set({ sort, order });
          }}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5"
        >
          <option value="listed:desc">Newly listed</option>
          <option value="price:asc">Price: low to high</option>
          <option value="price:desc">Price: high to low</option>
          <option value="artist:asc">Artist A–Z</option>
        </select>
      </Section>

      <Section title={`Price${currency ? ` (${currency})` : ""}`}>
        <Range
          min={filters.priceMin}
          max={filters.priceMax}
          step={1}
          onChange={(priceMin, priceMax) => set({ priceMin, priceMax })}
          labels={["Min", "Max"]}
        />
      </Section>

      <Section title="Year">
        <Range
          min={filters.yearMin}
          max={filters.yearMax}
          step={1}
          onChange={(yearMin, yearMax) => set({ yearMin, yearMax })}
          labels={["From", "To"]}
        />
      </Section>

      <Section title="Format">
        <Chips options={FORMATS.map((f) => ({ value: f }))} selected={filters.formats} onToggle={(v) => set({ formats: toggle(filters.formats, v) })} />
      </Section>

      <Section title="Media condition (at least)">
        <select
          value={filters.minCondition ?? ""}
          onChange={(e) => set({ minCondition: (e.target.value || undefined) as ConditionCode | undefined })}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5"
        >
          <option value="">Any</option>
          {CONDITIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </Section>

      <Section title="Genre">
        <Chips
          options={GENRES.map((g) => ({ value: g, count: genreCounts.get(g) }))}
          selected={filters.genres}
          onToggle={(v) => set({ genres: toggle(filters.genres, v) })}
        />
      </Section>

      <Section title="Style">
        {styles.length ? (
          <>
            <Chips
              options={styles.map((s) => ({ value: s, count: styleCounts.get(s) }))}
              selected={filters.styles}
              onToggle={(v) => set({ styles: toggle(filters.styles, v) })}
            />
            {filters.styles.length >= 2 && (
              <div className="mt-2">
                <div className="inline-flex rounded-full border border-zinc-700 p-0.5" role="group" aria-label="How to combine styles">
                  {(
                    [
                      ["any", "Match any"],
                      ["all", "Match all"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={filters.styleMode === mode}
                      onClick={() => set({ styleMode: mode })}
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        filters.styleMode === mode ? "bg-amber-400/15 text-amber-200" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {filters.styleMode === "all" ? "Records tagged with every selected style." : "Records tagged with at least one selected style."}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-zinc-500">Styles appear as records load.</p>
        )}
      </Section>

      <label className="flex items-center gap-2 text-zinc-300">
        <input
          type="checkbox"
          checked={filters.audioOnly}
          onChange={(e) => set({ audioOnly: e.target.checked })}
          className="accent-amber-400"
        />
        Only records with audio
      </label>

      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort, order: filters.order })}
        className="text-xs text-zinc-500 underline hover:text-zinc-300"
      >
        Clear filters
      </button>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; count?: number }[];
  selected: string[];
  onToggle(v: string): void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ value, count }) => {
        const on = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(value)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              on ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {value}
            {count ? <span className="ml-1 text-zinc-500">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Two number inputs that commit after a short pause in typing. */
function Range({
  min,
  max,
  step,
  labels,
  onChange,
}: {
  min?: number;
  max?: number;
  step: number;
  labels: [string, string];
  onChange(min?: number, max?: number): void;
}) {
  const [lo, setLo] = useState(min?.toString() ?? "");
  const [hi, setHi] = useState(max?.toString() ?? "");

  // Follow external changes (e.g. "Clear filters", back button).
  useEffect(() => setLo(min?.toString() ?? ""), [min]);
  useEffect(() => setHi(max?.toString() ?? ""), [max]);

  useEffect(() => {
    const parse = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
    const nextLo = parse(lo);
    const nextHi = parse(hi);
    if (nextLo === min && nextHi === max) return;
    const t = setTimeout(() => onChange(nextLo, nextHi), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);

  const cls = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5";
  return (
    <div className="flex items-center gap-2">
      <input type="number" inputMode="decimal" step={step} min={0} placeholder={labels[0]} aria-label={labels[0]} value={lo} onChange={(e) => setLo(e.target.value)} className={cls} />
      <span className="text-zinc-600">–</span>
      <input type="number" inputMode="decimal" step={step} min={0} placeholder={labels[1]} aria-label={labels[1]} value={hi} onChange={(e) => setHi(e.target.value)} className={cls} />
    </div>
  );
}
