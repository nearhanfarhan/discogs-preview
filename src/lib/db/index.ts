import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "fs";
import type { Release } from "../discogs/types";

/** Release details change rarely; refresh after 30 days. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let client: Client | null = null;
let ready: Promise<void> | null = null;

function db(): Client {
  if (!client) {
    const url = process.env.DATABASE_URL || "file:./data/cache.db";
    if (url.startsWith("file:./data/")) mkdirSync("./data", { recursive: true });
    client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  }
  return client;
}

function init() {
  ready ??= db()
    .execute(
      "CREATE TABLE IF NOT EXISTS releases (id INTEGER PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL)",
    )
    .then(() => undefined);
  return ready;
}

export async function getCachedReleases(ids: number[], now = Date.now()): Promise<Map<number, Release>> {
  const out = new Map<number, Release>();
  if (!ids.length) return out;
  await init();
  const rs = await db().execute({
    sql: `SELECT id, data FROM releases WHERE fetched_at > ? AND id IN (${ids.map(() => "?").join(",")})`,
    args: [now - MAX_AGE_MS, ...ids],
  });
  for (const row of rs.rows) out.set(Number(row.id), JSON.parse(String(row.data)));
  return out;
}

export async function putCachedRelease(r: Release, now = Date.now()): Promise<void> {
  await init();
  await db().execute({
    sql: "INSERT INTO releases (id, data, fetched_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at",
    args: [r.id, JSON.stringify(r), now],
  });
}
