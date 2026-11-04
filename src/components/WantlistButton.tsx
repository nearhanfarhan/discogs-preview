"use client";

import { loginHref, useAccount } from "@/store/account";

export function WantlistButton({ releaseId, compact }: { releaseId: number; compact?: boolean }) {
  const username = useAccount((s) => s.username);
  const loaded = useAccount((s) => s.loaded);
  const wanted = useAccount((s) => s.wants.has(releaseId));
  const pending = useAccount((s) => s.pending.has(releaseId));
  const toggleWant = useAccount((s) => s.toggleWant);

  const base = "inline-flex items-center gap-1 rounded-md border text-xs transition disabled:opacity-60";
  const size = compact ? "px-2 py-1" : "px-2.5 py-1.5";

  if (loaded && !username) {
    return (
      <a
        href={loginHref()}
        onClick={(e) => (e.currentTarget.href = loginHref())}
        title="Connect your Discogs account to use your wantlist"
        className={`${base} ${size} border-zinc-700 text-zinc-300 hover:bg-zinc-800`}
      >
        ♡ {compact ? "" : "Want"}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={!loaded || pending}
      onClick={() => toggleWant(releaseId)}
      aria-pressed={wanted}
      title={wanted ? "Remove from your wantlist" : "Add to your wantlist"}
      className={`${base} ${size} ${
        wanted
          ? "border-rose-400/60 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
          : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {wanted ? "♥" : "♡"} {compact ? "" : wanted ? "In wantlist" : "Want"}
    </button>
  );
}
