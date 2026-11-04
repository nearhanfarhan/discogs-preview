"use client";

import { useEffect, useState } from "react";
import { conditionCode, formatPrice } from "@/lib/format";
import { currentVideo, usePlayer } from "@/store/player";
import { WantlistButton } from "./WantlistButton";
import { playerControls, YouTubePlayer } from "./YouTubePlayer";

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export function PlayerBar() {
  const current = usePlayer((s) => s.current);
  const video = usePlayer(currentVideo);
  const playing = usePlayer((s) => s.playing);
  const mode = usePlayer((s) => s.mode);
  const shuffle = usePlayer((s) => s.shuffle);
  const queued = usePlayer((s) => s.records.length);
  const { next, prev, nextRecord, setMode, toggleShuffle, stop } = usePlayer.getState();
  const [videoOpen, setVideoOpen] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!usePlayer.getState().current || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        playerControls.toggle();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) usePlayer.getState().nextRecord();
        else usePlayer.getState().next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        usePlayer.getState().prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the tab title in sync, which helps when the tab is in the background.
  useEffect(() => {
    if (!current || !video) return;
    const prevTitle = document.title;
    document.title = `${playing ? "▶" : "❚❚"} ${video.title} · ${formatPrice(current.record.listing.price)}`;
    return () => {
      document.title = prevTitle;
    };
  }, [current, video, playing]);

  const l = current?.record.listing;
  const r = current?.record.release;

  return (
    <div className={current ? "" : "hidden"} data-testid="player">
      {/* Video stays mounted while the bar is hidden; collapsing only shrinks it to YouTube's 200px minimum. */}
      <div
        className={`fixed right-3 z-40 overflow-hidden rounded-lg border border-zinc-700 bg-black shadow-2xl transition-all bottom-[calc(var(--player-h)+0.75rem)] ${
          videoOpen ? "aspect-video w-[min(420px,calc(100vw-1.5rem))]" : "h-[200px] w-[200px]"
        }`}
      >
        <YouTubePlayer />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 h-[var(--player-h)] border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4">
          {r?.image || l?.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r?.image || l?.thumb || ""} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded bg-zinc-800" />
          )}

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-100" data-testid="now-playing">
              {video?.title ?? "—"}
            </div>
            <div className="truncate text-xs text-zinc-400">
              {l && (
                <>
                  {l.artist} – {l.title}
                  {mode === "all" && r && r.videos.length > 1 && (
                    <span className="ml-1 text-zinc-500">
                      · track {current!.track + 1}/{r.videos.length}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {l && (
            <div className="hidden shrink-0 text-right sm:block">
              <div className="text-sm font-semibold text-amber-300" data-testid="now-playing-price">
                {formatPrice(l.price)}
              </div>
              <div className="text-[11px] text-zinc-500">
                {conditionCode(l.condition)}
                {l.sleeveCondition ? ` / ${conditionCode(l.sleeveCondition)}` : ""}
              </div>
            </div>
          )}

          {l && <WantlistButton releaseId={l.releaseId} compact />}
          {l && (
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 md:inline-block"
            >
              Buy
            </a>
          )}

          <div className="flex shrink-0 items-center gap-1">
            <IconButton label="Previous (←)" onClick={prev}>⏮</IconButton>
            <IconButton label="Play/pause (space)" onClick={() => playerControls.toggle()} primary>
              {playing ? "❚❚" : "▶"}
            </IconButton>
            <IconButton label="Next track (→)" onClick={next}>⏭</IconButton>
            <IconButton label="Next record (shift+→)" onClick={nextRecord}>⏩</IconButton>
          </div>

          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <Toggle on={mode === "all"} onClick={() => setMode(mode === "all" ? "one" : "all")}>
              {mode === "all" ? "All tracks" : "1 per record"}
            </Toggle>
            <Toggle on={shuffle} onClick={toggleShuffle}>
              Shuffle
            </Toggle>
            <Toggle on={!videoOpen} onClick={() => setVideoOpen((v) => !v)}>
              {videoOpen ? "Shrink video" : "Grow video"}
            </Toggle>
            <span className="ml-1 text-[11px] text-zinc-500">{queued} in queue</span>
            <IconButton label="Close player" onClick={() => { playerControls.player?.pauseVideo(); stop(); }}>✕</IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  primary,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-full text-sm transition ${
        primary ? "bg-amber-400 text-zinc-950 hover:bg-amber-300" : "text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-md border px-2 py-1 text-xs ${
        on ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
