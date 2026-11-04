import { NextResponse } from "next/server";
import { appUrl, getSession, safeReturnTo } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  session.destroy();
  const returnTo = safeReturnTo(new URL(req.url).searchParams.get("returnTo"));
  return NextResponse.redirect(new URL(returnTo, appUrl(req)), 303);
}
