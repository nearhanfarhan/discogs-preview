import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  user?: { id: number; username: string; token: string; secret: string };
  oauth?: { token: string; secret: string; returnTo: string };
}

function options(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return {
    password,
    cookieName: "discogs_preview",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

export function appUrl(req: Request): string {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
}

/** Only allow same-site relative return paths. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
