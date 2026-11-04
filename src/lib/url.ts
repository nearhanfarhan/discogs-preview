const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Public base URL of the app, used for the OAuth callback and redirects.
 * Behind Cloud Run (or any proxy) the container itself sees plain HTTP on an internal port,
 * so prefer APP_URL, then the Host header + X-Forwarded-Proto, then the request URL.
 */
export function appUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const fallback = new URL(req.url);
  const host = req.headers.get("host")?.trim();
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  if (host && HOST_RE.test(host)) {
    const scheme = proto === "https" || proto === "http" ? proto : fallback.protocol.replace(":", "");
    return `${scheme}://${host}`;
  }
  return fallback.origin;
}

/** Only allow same-site relative return paths. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
