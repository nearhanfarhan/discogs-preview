import { NextResponse } from "next/server";
import { fetchWantIds, setWant } from "@/lib/discogs/client";
import { errorResponse } from "@/lib/http";
import { getSession } from "@/lib/session";

async function requireUser() {
  const session = await getSession();
  return session.user ?? null;
}

const unauthorized = () => NextResponse.json({ error: "Connect your Discogs account first" }, { status: 401 });

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  try {
    return NextResponse.json({ ids: await fetchWantIds(user) });
  } catch (err) {
    return errorResponse(err, "wantlist");
  }
}

async function releaseIdFrom(req: Request) {
  try {
    const id = Number((await req.json())?.releaseId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

async function mutate(req: Request, want: boolean) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const releaseId = await releaseIdFrom(req);
  if (!releaseId) return NextResponse.json({ error: "releaseId required" }, { status: 400 });
  try {
    await setWant(user, releaseId, want);
    return NextResponse.json({ releaseId, wanted: want });
  } catch (err) {
    return errorResponse(err, "wantlist");
  }
}

export const POST = (req: Request) => mutate(req, true);
export const DELETE = (req: Request) => mutate(req, false);
