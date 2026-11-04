import { NextResponse } from "next/server";
import { DiscogsError } from "./discogs/client";

export function errorResponse(err: unknown, context = "Discogs request") {
  if (err instanceof DiscogsError) {
    const status = err.status === 429 ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json({ error: err.message }, { status });
  }
  console.error(context, err);
  return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
}
