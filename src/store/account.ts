import { create } from "zustand";

interface AccountState {
  username: string | null;
  loaded: boolean;
  wants: Set<number>;
  pending: Set<number>;
  error: string | null;
  load(): Promise<void>;
  toggleWant(releaseId: number): Promise<void>;
  clearError(): void;
}

export const useAccount = create<AccountState>((set, get) => ({
  username: null,
  loaded: false,
  wants: new Set(),
  pending: new Set(),
  error: null,

  async load() {
    try {
      const me = await fetch("/api/me").then((r) => r.json());
      set({ username: me.username ?? null, loaded: true });
      if (!me.username) return;
      const res = await fetch("/api/wantlist");
      if (res.ok) set({ wants: new Set((await res.json()).ids as number[]) });
    } catch {
      set({ loaded: true });
    }
  },

  async toggleWant(releaseId) {
    const { wants, pending, username } = get();
    if (!username || pending.has(releaseId)) return;
    const want = !wants.has(releaseId);
    const update = (fn: (w: Set<number>) => void) => {
      const w = new Set(get().wants);
      fn(w);
      return w;
    };
    // Optimistic update, rolled back on failure.
    set({
      wants: update((w) => (want ? w.add(releaseId) : w.delete(releaseId))),
      pending: new Set(pending).add(releaseId),
    });
    try {
      const res = await fetch("/api/wantlist", {
        method: want ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Wantlist update failed");
    } catch (err) {
      set({
        wants: update((w) => (want ? w.delete(releaseId) : w.add(releaseId))),
        error: err instanceof Error ? err.message : "Wantlist update failed",
      });
    } finally {
      const p = new Set(get().pending);
      p.delete(releaseId);
      set({ pending: p });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

export function loginHref() {
  if (typeof window === "undefined") return "/api/auth/discogs/login";
  return `/api/auth/discogs/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}
