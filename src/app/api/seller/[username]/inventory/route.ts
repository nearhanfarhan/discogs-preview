import { NextResponse } from "next/server";
import { DiscogsError, fetchInventoryPage } from "@/lib/discogs/client";
import type { InventoryPage, InventorySort, SortOrder } from "@/lib/discogs/types";
import { errorResponse } from "@/lib/http";

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; page: InventoryPage }>();

const SORTS: InventorySort[] = ["listed", "price", "artist", "item"];

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Math.min(1000, Number(sp.get("page")) || 1));
  const sortParam = sp.get("sort") as InventorySort;
  const sort = SORTS.includes(sortParam) ? sortParam : "listed";
  const order: SortOrder = sp.get("order") === "asc" ? "asc" : "desc";

  const key = `${username.toLowerCase()}|${sort}|${order}|${page}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.page);

  try {
    const data = await fetchInventoryPage(username, page, sort, order);
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), page: data });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof DiscogsError && err.status === 404) {
      return NextResponse.json({ error: `No Discogs seller called "${username}"` }, { status: 404 });
    }
    if (err instanceof DiscogsError && err.status === 403) {
      return NextResponse.json({ error: `${username}'s inventory isn't public` }, { status: 403 });
    }
    return errorResponse(err, "inventory");
  }
}
