import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Session is backed by Next's request cookies; stub it per test.
const session: { user?: { id: number; username: string; token: string; secret: string } } = {};
vi.mock("@/lib/session", () => ({
  getSession: async () => session,
  appUrl: () => "http://localhost:3000",
  safeReturnTo: (v: string | null) => v ?? "/",
}));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-discogs-ratelimit-remaining": "50", ...headers },
  });

const discogsRelease = (id: number) => ({
  id,
  title: `Release ${id}`,
  year: 1999,
  uri: `https://www.discogs.com/release/${id}`,
  artists: [{ name: "Artist (2)" }],
  genres: ["Electronic"],
  styles: ["House"],
  images: [{ type: "primary", uri: "", uri150: `https://i.discogs.com/${id}.jpg` }],
  videos: [
    { uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Track A", duration: 200, embed: true },
    { uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "dupe", duration: 200, embed: true },
    { uri: "https://youtu.be/oHg5SJYRHA0", title: "No embed", duration: 100, embed: false },
  ],
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  delete session.user;
});
afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown) =>
  new Request("http://localhost/api/releases", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("POST /api/releases", () => {
  it("fetches misses, normalises them, then serves repeats from the cache", async () => {
    const { POST } = await import("@/app/api/releases/route");
    fetchMock.mockImplementation(async (url: URL) => {
      const id = Number(String(url).split("/").pop());
      return id === 404 ? json({ message: "Release not found." }, 404) : json(discogsRelease(id));
    });

    const first = await (await POST(post({ ids: [101, 102, 404, "junk", 101] }))).json();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(first.failed).toEqual([404]);
    expect(first.retry).toEqual([]);
    const r101 = first.releases.find((r: { id: number }) => r.id === 101);
    expect(r101).toMatchObject({
      artist: "Artist",
      genres: ["Electronic"],
      image: "https://i.discogs.com/101.jpg",
      videos: [{ videoId: "dQw4w9WgXcQ", title: "Track A", duration: 200 }],
    });

    fetchMock.mockClear();
    const second = await (await POST(post({ ids: [101, 102] }))).json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(second.releases.map((r: { id: number }) => r.id).sort()).toEqual([101, 102]);
  });

  it("returns the rest of the batch as retryable when Discogs is down", async () => {
    const { POST } = await import("@/app/api/releases/route");
    fetchMock.mockResolvedValue(json({ message: "Service unavailable" }, 503));
    const body = await (await POST(post({ ids: [201, 202, 203] }))).json();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ releases: [], failed: [], retry: [201, 202, 203] });
  });

  it("rejects bad bodies", async () => {
    const { POST } = await import("@/app/api/releases/route");
    expect((await POST(post({ ids: "nope" }))).status).toBe(400);
  });
});

describe("GET /api/seller/[username]/inventory", () => {
  const inventory = {
    pagination: { page: 1, pages: 3, per_page: 100, items: 250 },
    listings: [
      {
        id: 9,
        status: "For Sale",
        uri: "https://www.discogs.com/sell/item/9",
        condition: "Near Mint (NM or M-)",
        sleeve_condition: "Very Good Plus (VG+)",
        price: { value: 12.5, currency: "EUR" },
        shipping_price: { value: 4, currency: "EUR" },
        release: { id: 77, description: "X - Y (LP)", artist: "X (3)", title: "Y", format: "LP, Album", year: 2001, thumbnail: "t.jpg" },
      },
    ],
  };

  it("passes sort and page through to Discogs and normalises listings", async () => {
    const { GET } = await import("@/app/api/seller/[username]/inventory/route");
    fetchMock.mockResolvedValue(json(inventory));
    const res = await GET(new Request("http://localhost/api/seller/shop/inventory?page=2&sort=price&order=asc"), {
      params: Promise.resolve({ username: "shop" }),
    });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/users/shop/inventory");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ page: "2", sort: "price", sort_order: "asc", per_page: "100" });
    const body = await res.json();
    expect(body.items).toBe(250);
    expect(body.listings[0]).toMatchObject({
      id: 9,
      releaseId: 77,
      artist: "X",
      price: { value: 12.5, currency: "EUR" },
      shipping: { value: 4, currency: "EUR" },
    });
  });

  it("caches pages and maps unknown sellers to 404", async () => {
    const { GET } = await import("@/app/api/seller/[username]/inventory/route");
    fetchMock.mockResolvedValue(json(inventory));
    const req = () => new Request("http://localhost/api/seller/cached/inventory?page=1");
    await GET(req(), { params: Promise.resolve({ username: "cached" }) });
    await GET(req(), { params: Promise.resolve({ username: "cached" }) });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(json({ message: "User does not exist or may have been deleted." }, 404));
    const res = await GET(new Request("http://localhost/api/seller/ghost/inventory"), { params: Promise.resolve({ username: "ghost" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/ghost/);
  });
});

describe("/api/wantlist", () => {
  const body = (releaseId: unknown) =>
    new Request("http://localhost/api/wantlist", { method: "POST", body: JSON.stringify({ releaseId }) });

  it("returns 401 without a Discogs session", async () => {
    const { GET, POST } = await import("@/app/api/wantlist/route");
    expect((await GET()).status).toBe(401);
    expect((await POST(body(1))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PUTs to the user's wantlist with an OAuth header", async () => {
    process.env.DISCOGS_CONSUMER_KEY = "ck";
    process.env.DISCOGS_CONSUMER_SECRET = "cs";
    session.user = { id: 1, username: "digger", token: "tok", secret: "sec" };
    const { POST, DELETE } = await import("@/app/api/wantlist/route");
    fetchMock.mockResolvedValue(json({ id: 555 }, 201));

    const res = await POST(body(555));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.discogs.com/users/digger/wants/555");
    expect(init.method).toBe("PUT");
    expect(init.headers.Authorization).toMatch(/^OAuth .*oauth_token="tok"/);
    expect(init.headers.Authorization).toContain('oauth_signature="cs%26sec"');

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const del = await DELETE(new Request("http://localhost/api/wantlist", { method: "DELETE", body: JSON.stringify({ releaseId: 555 }) }));
    expect(del.status).toBe(200);
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");

    expect((await POST(body("x"))).status).toBe(400);
  });

  it("pages through the wantlist", async () => {
    session.user = { id: 1, username: "digger", token: "tok", secret: "sec" };
    const { GET } = await import("@/app/api/wantlist/route");
    fetchMock
      .mockResolvedValueOnce(json({ pagination: { page: 1, pages: 2, per_page: 100, items: 3 }, wants: [{ id: 1 }, { id: 2 }] }))
      .mockResolvedValueOnce(json({ pagination: { page: 2, pages: 2, per_page: 100, items: 3 }, wants: [{ id: 3 }] }));
    expect(await (await GET()).json()).toEqual({ ids: [1, 2, 3] });
  });
});
