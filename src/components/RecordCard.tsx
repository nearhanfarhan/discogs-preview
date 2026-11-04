"use client";

import { memo, useEffect, useRef } from "react";
import type { Listing, Release } from "@/lib/discogs/types";
import { conditionCode, formatPrice } from "@/lib/format";
import { usePlayer } from "@/store/player";
import { WantlistButton } from "./WantlistButton";

export const RecordCard = memo(function RecordCard({ listing: l, release: r }: { listing: Listing; release: Release | null }) {
  const isCurrent = usePlayer((s) => s.current?.record.listing.id === l.id);
  const playing = usePlayer((s) => s.playing && s.current?.record.listing.id === l.id);
  const play = usePlayer((s) => s.play);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isCurrent) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isCurrent]);

  const image = r?.image || l.thumb;
  const tracks = r?.videos.length ?? 0;
  const tags = r ? [...r.genres, ...r.styles].slice(0, 5) : [];

  return (
    <article
      ref={ref}
      data-testid="record-card"
      className={`flex gap-3 rounded-xl border p-3 transition ${
        isCurrent ? "border-amber-400/70 bg-amber-400/5" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
      }`}
    >
      <button
        type="button"
        disabled={!tracks}
        onClick={() => play(l.id)}
        className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-800 disabled:cursor-not-allowed"
        aria-label={tracks ? `Play ${l.artist} – ${l.title}` : "No audio available"}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
        {tracks > 0 && (
          <span
            className={`absolute inset-0 grid place-items-center bg-black/50 text-2xl text-white transition ${
              isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {playing ? "❚❚" : "▶"}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-zinc-100" title={l.title}>
              {l.title}
            </h3>
            <p className="truncate text-sm text-zinc-400" title={l.artist}>
              {l.artist}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold text-amber-300" data-testid="price">
              {formatPrice(l.price)}
            </div>
            {l.shipping && l.shipping.value > 0 && (
              <div className="text-[11px] text-zinc-500">+{formatPrice(l.shipping)} ship</div>
            )}
          </div>
        </div>

        <p className="mt-1 truncate text-xs text-zinc-500">
          {[l.year || null, l.format, `${conditionCode(l.condition)}${l.sleeveCondition ? ` / ${conditionCode(l.sleeveCondition)}` : ""}`]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="mt-1 flex flex-wrap gap-1">
          {r === null ? (
            <span className="text-[11px] text-zinc-600">loading details…</span>
          ) : (
            tags.map((t) => (
              <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                {t}
              </span>
            ))
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            type="button"
            disabled={!tracks}
            onClick={() => play(l.id)}
            className="rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {tracks ? `▶ Play${tracks > 1 ? ` (${tracks})` : ""}` : r ? "No audio" : "…"}
          </button>
          <WantlistButton releaseId={l.releaseId} />
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            Buy on Discogs ↗
          </a>
        </div>
      </div>
    </article>
  );
});
