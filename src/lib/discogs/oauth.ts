import { randomBytes } from "crypto";

/** RFC 3986 percent-encoding, as OAuth 1.0a requires. */
export function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface OAuthParams {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  callback?: string;
  verifier?: string;
  nonce?: string;
  timestamp?: number;
}

/**
 * Build an OAuth 1.0a Authorization header using the PLAINTEXT signature method,
 * which Discogs supports over HTTPS (https://www.discogs.com/developers#page:authentication).
 */
export function oauthHeader(p: OAuthParams): string {
  const fields: Record<string, string> = {
    oauth_consumer_key: p.consumerKey,
    oauth_nonce: p.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "PLAINTEXT",
    oauth_timestamp: String(p.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    oauth_signature: `${rfc3986(p.consumerSecret)}&${rfc3986(p.tokenSecret ?? "")}`,
  };
  if (p.token) fields.oauth_token = p.token;
  if (p.callback) fields.oauth_callback = p.callback;
  if (p.verifier) fields.oauth_verifier = p.verifier;
  return (
    "OAuth " +
    Object.entries(fields)
      .map(([k, v]) => `${k}="${rfc3986(v)}"`)
      .join(", ")
  );
}
