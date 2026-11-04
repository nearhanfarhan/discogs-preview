import { beforeEach, describe, expect, it } from "vitest";
import { createPlayerStore, currentVideo, nextRecordIndex, type PlayerRecord } from "@/store/player";

const rec = (id: number, videos: number): PlayerRecord => ({
  listing: {
    id,
    url: "",
    releaseId: id * 10,
    artist: `Artist ${id}`,
    title: `Title ${id}`,
    format: "LP",
    year: 2000,
    thumb: null,
    condition: "Mint (M)",
    sleeveCondition: null,
    price: { value: id, currency: "USD" },
    shipping: null,
    shipsFrom: null,
    comments: null,
  },
  release: {
    id: id * 10,
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    year: 2000,
    url: "",
    image: null,
    genres: [],
    styles: [],
    videos: Array.from({ length: videos }, (_, i) => ({ videoId: `vid${id}-${i}`.padEnd(11, "x"), title: `T${id}.${i}`, duration: 60 })),
  },
});

let store: ReturnType<typeof createPlayerStore>;
const s = () => store.getState();
const now = () => currentVideo(s())?.title;

beforeEach(() => {
  store = createPlayerStore(() => 0);
  s().setRecords([rec(1, 2), rec(2, 0), rec(3, 3), rec(4, 1)]);
});

describe("player store", () => {
  it("drops records without videos from the queue", () => {
    expect(s().records.map((r) => r.listing.id)).toEqual([1, 3, 4]);
  });

  it("one-per-record mode: ended → first track of the next record", () => {
    s().play(1);
    expect(now()).toBe("T1.0");
    s().next();
    expect(now()).toBe("T3.0");
    s().next();
    expect(now()).toBe("T4.0");
  });

  it("all-tracks mode walks every track, then moves on", () => {
    s().setMode("all");
    s().play(1);
    s().next();
    expect(now()).toBe("T1.1");
    s().next();
    expect(now()).toBe("T3.0");
    s().prev();
    expect(now()).toBe("T1.0");
  });

  it("nextRecord skips the rest of a record even in all-tracks mode", () => {
    s().setMode("all");
    s().play(3);
    s().nextRecord();
    expect(now()).toBe("T4.0");
  });

  it("stops at the end of the list", () => {
    s().play(4);
    s().setPlaying(true);
    s().next();
    expect(now()).toBe("T4.0");
    expect(s().playing).toBe(false);
  });

  it("keeps playing a record that drops out of the filtered list, then continues from the top", () => {
    s().play(3);
    s().setRecords([rec(1, 1), rec(4, 1)]);
    expect(now()).toBe("T3.0");
    s().next();
    expect(now()).toBe("T1.0");
  });

  it("skips past broken videos but gives up after a long run of errors", () => {
    s().setRecords(Array.from({ length: 20 }, (_, i) => rec(i + 1, 1)));
    s().play(1);
    s().setPlaying(true);
    for (let i = 0; i < 7; i++) s().reportError();
    expect(s().current?.record.listing.id).toBe(8);
    s().reportError();
    expect(s().playing).toBe(false);
  });

  it("prev on the first record restarts it", () => {
    s().play(1);
    const nonce = s().nonce;
    s().prev();
    expect(now()).toBe("T1.0");
    expect(s().nonce).toBe(nonce + 1);
  });
});

describe("nextRecordIndex with shuffle", () => {
  const records = [rec(1, 1), rec(2, 1), rec(3, 1)];
  it("never picks the current record and prefers unplayed ones", () => {
    expect(nextRecordIndex(records, 1, true, [1, 2], () => 0)).toBe(2);
  });
  it("falls back to any other record once everything has played", () => {
    expect(nextRecordIndex(records, 3, true, [1, 2, 3], (n) => n - 1)).toBe(1);
  });
  it("returns null for a single-record list", () => {
    expect(nextRecordIndex([records[0]], 1, true, [1])).toBeNull();
  });
});
