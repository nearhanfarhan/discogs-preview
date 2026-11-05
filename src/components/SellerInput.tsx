"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseSeller } from "@/lib/discogs/parseSeller";

export function SellerInput({ initial = "", compact }: { initial?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const seller = parseSeller(value);
        if (!seller) {
          setError("Paste a Discogs seller link (discogs.com/seller/NAME/profile) or a username");
          return;
        }
        setError(null);
        router.push(`/seller/${encodeURIComponent(seller)}`);
      }}
    >
      <div className={`flex gap-2 ${compact ? "" : "flex-col sm:flex-row"}`}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://www.discogs.com/seller/NAME/profile"
          aria-label="Discogs seller link or username"
          className={`min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none ${
            compact ? "py-1.5 text-sm" : "py-3"
          }`}
        />
        <button
          className={`rounded-lg bg-amber-400 font-semibold text-zinc-950 hover:bg-amber-300 ${
            compact ? "px-3 py-1.5 text-sm" : "px-5 py-3"
          }`}
        >
          {compact ? "Go" : "Dig the crates"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </form>
  );
}
