import { create } from "zustand";
import type { Listing, Release } from "@/lib/discogs/types";

export interface PlayerRecord {
  listing: Listing;
  release: Release;
}

export type PlayMode = "one" | "all";

export interface Position {
  record: PlayerRecord;
  track: number;
}

export interface PlayerState {
  /** The playlist: filtered records that have at least one playable video, in display order. */
  records: PlayerRecord[];
  current: Position | null;
  mode: PlayMode;
  shuffle: boolean;
  /** Actual playback state, reported by the YouTube player. */
  playing: boolean;
  /** Listing IDs played this session, most recent last (used for shuffle + prev). */
  history: number[];
  /** Consecutive player errors, so a run of dead videos can't spin forever. */
  errorStreak: number;
  /** Bumped when the user asks to play the current video again (e.g. after the end of the list). */
  nonce: number;

  setRecords(records: PlayerRecord[]): void;
  play(listingId: number, track?: number): void;
  next(): void;
  nextRecord(): void;
  prev(): void;
  stop(): void;
  setMode(mode: PlayMode): void;
  toggleShuffle(): void;
  setPlaying(playing: boolean): void;
  reportError(): void;
}

export type Chooser = (n: number) => number;
const defaultPick: Chooser = (n) => Math.floor(Math.random() * n);

/** Pure: where does "next record" go? Returns null at the end of a non-shuffled list. */
export function nextRecordIndex(
  records: PlayerRecord[],
  currentId: number | null,
  shuffle: boolean,
  history: number[],
  pick: Chooser = defaultPick,
): number | null {
  if (!records.length) return null;
  const idx = currentId === null ? -1 : records.findIndex((r) => r.listing.id === currentId);
  if (shuffle) {
    const played = new Set(history);
    let pool = records.map((_, i) => i).filter((i) => i !== idx && !played.has(records[i].listing.id));
    if (!pool.length) pool = records.map((_, i) => i).filter((i) => i !== idx);
    if (!pool.length) return null;
    return pool[pick(pool.length)];
  }
  const nextIdx = idx + 1;
  return nextIdx < records.length ? nextIdx : null;
}

export function createPlayerStore(pick: Chooser = defaultPick) {
  return create<PlayerState>((set, get) => {
    const goTo = (record: PlayerRecord, track: number) =>
      set((s) => ({
        current: { record, track },
        history: s.current?.record.listing.id === record.listing.id ? s.history : [...s.history, record.listing.id].slice(-500),
      }));

    return {
      records: [],
      current: null,
      mode: "one",
      shuffle: false,
      playing: false,
      history: [],
      errorStreak: 0,
      nonce: 0,

      setRecords(records) {
        set({ records: records.filter((r) => r.release.videos.length > 0) });
      },

      play(listingId, track = 0) {
        const record = get().records.find((r) => r.listing.id === listingId);
        if (!record) return;
        const t = Math.min(Math.max(0, track), record.release.videos.length - 1);
        set((s) => ({ errorStreak: 0, nonce: s.nonce + 1 }));
        goTo(record, t);
      },

      next() {
        const { current, mode } = get();
        if (current && mode === "all" && current.track + 1 < current.record.release.videos.length) {
          goTo(current.record, current.track + 1);
          return;
        }
        get().nextRecord();
      },

      nextRecord() {
        const { records, current, shuffle, history } = get();
        const idx = nextRecordIndex(records, current?.record.listing.id ?? null, shuffle, history, pick);
        if (idx === null) {
          set({ playing: false });
          return;
        }
        goTo(records[idx], 0);
      },

      prev() {
        const { current, records, history, mode } = get();
        if (!current) return;
        if (mode === "all" && current.track > 0) {
          goTo(current.record, current.track - 1);
          return;
        }
        let target: PlayerRecord | undefined;
        if (get().shuffle) {
          const prevId = history[history.length - 2];
          target = records.find((r) => r.listing.id === prevId);
          if (target) set({ history: history.slice(0, -2) });
        } else {
          const idx = records.findIndex((r) => r.listing.id === current.record.listing.id);
          target = idx > 0 ? records[idx - 1] : undefined;
        }
        if (target) goTo(target, 0);
        else set((s) => ({ nonce: s.nonce + 1 })); // restart current track
      },

      stop() {
        set({ current: null, playing: false });
      },

      setMode(mode) {
        set({ mode });
      },

      toggleShuffle() {
        set((s) => ({ shuffle: !s.shuffle }));
      },

      setPlaying(playing) {
        set(playing ? { playing, errorStreak: 0 } : { playing });
      },

      reportError() {
        const streak = get().errorStreak + 1;
        if (streak >= 8) {
          set({ errorStreak: 0, playing: false });
          return;
        }
        set({ errorStreak: streak });
        get().next();
      },
    };
  });
}

export const usePlayer = createPlayerStore();

export function currentVideo(s: Pick<PlayerState, "current">) {
  return s.current ? (s.current.record.release.videos[s.current.track] ?? null) : null;
}
