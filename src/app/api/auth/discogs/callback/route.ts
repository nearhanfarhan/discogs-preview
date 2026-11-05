import { NextResponse } from "next/server";
import { getAccessToken, getIdentity } from "@/lib/discogs/client";
import { appUrl, getSession } from "@/lib/session";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const session = await getSession();
  const pending = session.oauth;
  const returnTo = pending?.returnTo ?? "/";
  const fail = (msg: string) => {
    const url = new URL(returnTo, appUrl(req));
    url.searchParams.set("auth_error", msg);
    return NextResponse.redirect(url);
  };

  const token = sp.get("oauth_token");
  const verifier = sp.get("oauth_verifier");
  if (sp.get("denied")) return fail("Discogs sign-in was cancelled");
  if (!pending || !token || !verifier || token !== pending.token) return fail("Sign-in expired, please try again");

  try {
    const access = await getAccessToken(pending.token, pending.secret, verifier);
    const me = await getIdentity(access);
    session.user = { id: me.id, username: me.username, ...access };
    session.oauth = undefined;
    await session.save();
    return NextResponse.redirect(new URL(returnTo, appUrl(req)));
  } catch (err) {
    console.error("oauth callback", err);
    return fail("Discogs sign-in failed");
  }
}
