const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract an 11-character YouTube video ID from any common YouTube URL form. */
export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:embed|v|shorts|live)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && ID_RE.test(id) ? id : null;
}
