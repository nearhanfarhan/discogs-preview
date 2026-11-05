const USERNAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Turn whatever the user pasted into a Discogs username.
 * Accepts e.g. https://www.discogs.com/seller/NAME/profile, /user/NAME, /shop/NAME,
 * discogs.com/seller/NAME?genre=Rock, or just "NAME".
 */
export function parseSeller(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (USERNAME_RE.test(raw) && !raw.includes("discogs.")) return raw;

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)discogs\.com$/i.test(u.hostname)) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  // Skip an optional locale prefix such as /de/ or /fr/.
  if (parts[0] && /^[a-z]{2}$/.test(parts[0])) parts.shift();
  const idx = parts.findIndex((p) => ["seller", "user", "shop"].includes(p.toLowerCase()));
  if (idx === -1 || !parts[idx + 1]) return null;
  const name = decodeURIComponent(parts[idx + 1]);
  return USERNAME_RE.test(name) ? name : null;
}
