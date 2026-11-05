import { oauthHeader } from "./oauth";
import { RateLimitedQueue } from "./rateLimit";
import { youtubeId } from "./youtube";
import type {
  DiscogsInventoryResponse,
  DiscogsListing,
  DiscogsRelease,
  DiscogsWantsResponse,
  InventoryPage,
  InventorySort,
  Listing,
  Release,
  SortOrder,
  Video,
} from "./types";

export const API_BASE = "https://api.discogs.com";
export const WEB_BASE = "https://www.discogs.com";
export const USER_AGENT = "DiscogsPreview/0.1 +https://github.com/nearhanfarhan/discogs-preview";

export class DiscogsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "DiscogsError";
  }
}

export interface UserTokens {
  token: string;
  secret: string;
}

/** One queue per rate-limit bucket: the app's key, or each signed-in user's token. */
const queues = new Map<string, RateLimitedQueue>();
function queueFor(key: string) {
  let q = queues.get(key);
  if (!q) {
    q = new RateLimitedQueue();
    queues.set(key, q);
  }
  return q;
}

function consumer() {
  return {
    key: process.env.DISCOGS_CONSUMER_KEY ?? "",
    secret: process.env.DISCOGS_CONSUMER_SECRET ?? "",
  };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  /** Sign as a user (OAuth). Omit to use app-level key/secret auth. */
  user?: UserTokens;
}

export async function discogsRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path, API_BASE);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const { key, secret } = consumer();
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "application/json" };
  if (opts.user) {
    headers.Authorization = oauthHeader({
      consumerKey: key,
      consumerSecret: secret,
      token: opts.user.token,
      tokenSecret: opts.user.secret,
    });
  } else if (key && secret) {
    headers.Authorization = `Discogs key=${key}, secret=${secret}`;
  }

  const bucket = opts.user ? `user:${opts.user.token}` : "app";
  const res = await queueFor(bucket).schedule(() =>
    fetch(url, { method: opts.method ?? "GET", headers, cache: "no-store" }),
  );

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new DiscogsError(res.status, message || `Discogs returned ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ---------- normalisers ---------- */

const stripArtistSuffix = (name: string) => name.replace(/\s*\(\d+\)$/, "").replace(/\*$/, "");

export function toListing(l: DiscogsListing): Listing {
  return {
    id: l.id,
    url: l.uri || `${WEB_BASE}/sell/item/${l.id}`,
    releaseId: l.release.id,
    artist: stripArtistSuffix(l.release.artist ?? ""),
    title: l.release.title ?? l.release.description,
    format: l.release.format ?? "",
    year: l.release.year ?? 0,
    thumb: l.release.thumbnail || null,
    condition: l.condition,
    sleeveCondition: l.sleeve_condition || null,
    price: l.price,
    shipping: l.shipping_price ?? null,
    shipsFrom: l.ships_from ?? null,
    comments: l.comments || null,
  };
}

export function toRelease(r: DiscogsRelease): Release {
  const seen = new Set<string>();
  const videos: Video[] = [];
  for (const v of r.videos ?? []) {
    if (v.embed === false) continue;
    const id = youtubeId(v.uri);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    videos.push({ videoId: id, title: v.title, duration: v.duration });
  }
  const primary = r.images?.find((i) => i.type === "primary") ?? r.images?.[0];
  return {
    id: r.id,
    title: r.title,
    artist: (r.artists ?? []).map((a) => stripArtistSuffix(a.name)).join(", "),
    year: r.year || null,
    url: r.uri || `${WEB_BASE}/release/${r.id}`,
    image: primary?.uri150 || r.thumb || null,
    genres: r.genres ?? [],
    styles: r.styles ?? [],
    videos,
  };
}

/* ---------- endpoints ---------- */

export async function fetchInventoryPage(
  seller: string,
  page: number,
  sort: InventorySort = "listed",
  order: SortOrder = "desc",
): Promise<InventoryPage> {
  const data = await discogsRequest<DiscogsInventoryResponse>(
    `/users/${encodeURIComponent(seller)}/inventory`,
    { query: { status: "for sale", sort, sort_order: order, per_page: 100, page } },
  );
  return {
    page: data.pagination.page,
    pages: data.pagination.pages,
    items: data.pagination.items,
    listings: data.listings.filter((l) => l.status === "For Sale" || !l.status).map(toListing),
  };
}

export async function fetchRelease(id: number): Promise<Release> {
  return toRelease(await discogsRequest<DiscogsRelease>(`/releases/${id}`));
}

export async function fetchWantIds(user: UserTokens & { username: string }, maxPages = 20) {
  const ids: number[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await discogsRequest<DiscogsWantsResponse>(
      `/users/${encodeURIComponent(user.username)}/wants`,
      { user, query: { per_page: 100, page } },
    );
    ids.push(...data.wants.map((w) => w.id));
    if (page >= data.pagination.pages) break;
  }
  return ids;
}

export function setWant(user: UserTokens & { username: string }, releaseId: number, want: boolean) {
  return discogsRequest<unknown>(`/users/${encodeURIComponent(user.username)}/wants/${releaseId}`, {
    user,
    method: want ? "PUT" : "DELETE",
  });
}

/* ---------- OAuth handshake (form-encoded responses, not JSON) ---------- */

async function oauthStep(path: string, header: string): Promise<URLSearchParams> {
  const res = await fetch(new URL(path, API_BASE), {
    method: "POST",
    headers: {
      Authorization: header,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new DiscogsError(res.status, `OAuth ${path} failed: ${text.slice(0, 200)}`);
  return new URLSearchParams(text);
}

export async function getRequestToken(callback: string) {
  const { key, secret } = consumer();
  if (!key || !secret) throw new DiscogsError(500, "DISCOGS_CONSUMER_KEY/SECRET are not configured");
  const p = await oauthStep("/oauth/request_token", oauthHeader({ consumerKey: key, consumerSecret: secret, callback }));
  const token = p.get("oauth_token");
  const tokenSecret = p.get("oauth_token_secret");
  if (!token || !tokenSecret) throw new DiscogsError(502, "Discogs returned no request token");
  return { token, secret: tokenSecret, authorizeUrl: `${WEB_BASE}/oauth/authorize?oauth_token=${encodeURIComponent(token)}` };
}

export async function getAccessToken(requestToken: string, requestSecret: string, verifier: string) {
  const { key, secret } = consumer();
  const p = await oauthStep(
    "/oauth/access_token",
    oauthHeader({ consumerKey: key, consumerSecret: secret, token: requestToken, tokenSecret: requestSecret, verifier }),
  );
  const token = p.get("oauth_token");
  const tokenSecret = p.get("oauth_token_secret");
  if (!token || !tokenSecret) throw new DiscogsError(502, "Discogs returned no access token");
  return { token, secret: tokenSecret };
}

export async function getIdentity(user: UserTokens) {
  return discogsRequest<{ id: number; username: string }>("/oauth/identity", { user });
}
