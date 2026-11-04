import { NextResponse } from "next/server";
import { getRequestToken } from "@/lib/discogs/client";
import { appUrl, getSession, safeReturnTo } from "@/lib/session";

export async function GET(req: Request) {
  const returnTo = safeReturnTo(new URL(req.url).searchParams.get("returnTo"));
  try {
    const { token, secret, authorizeUrl } = await getRequestToken(`${appUrl(req)}/api/auth/discogs/callback`);
    const session = await getSession();
    session.oauth = { token, secret, returnTo };
    await session.save();
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    console.error("oauth login", err);
    const url = new URL(returnTo, appUrl(req));
    url.searchParams.set("auth_error", "Couldn't start Discogs sign-in");
    return NextResponse.redirect(url);
  }
}
