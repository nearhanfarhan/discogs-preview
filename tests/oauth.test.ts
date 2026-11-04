import { describe, expect, it } from "vitest";
import { oauthHeader, rfc3986 } from "@/lib/discogs/oauth";

function parse(header: string) {
  expect(header.startsWith("OAuth ")).toBe(true);
  return Object.fromEntries(
    header
      .slice(6)
      .split(", ")
      .map((kv) => {
        const [k, v] = kv.split("=");
        return [k, decodeURIComponent(v.slice(1, -1))];
      }),
  );
}

describe("oauthHeader (PLAINTEXT)", () => {
  it("builds a request-token header with callback", () => {
    const h = parse(
      oauthHeader({ consumerKey: "ck", consumerSecret: "cs", callback: "http://localhost:3000/cb", nonce: "n", timestamp: 1 }),
    );
    expect(h).toEqual({
      oauth_consumer_key: "ck",
      oauth_nonce: "n",
      oauth_signature_method: "PLAINTEXT",
      oauth_timestamp: "1",
      oauth_version: "1.0",
      oauth_signature: "cs&",
      oauth_callback: "http://localhost:3000/cb",
    });
  });

  it("signs with consumer and token secrets and includes token + verifier", () => {
    const h = parse(
      oauthHeader({ consumerKey: "ck", consumerSecret: "c s", token: "t", tokenSecret: "t&s", verifier: "v" }),
    );
    expect(h.oauth_signature).toBe(`${rfc3986("c s")}&${rfc3986("t&s")}`);
    expect(h.oauth_token).toBe("t");
    expect(h.oauth_verifier).toBe("v");
  });

  it("percent-encodes reserved characters per RFC 3986", () => {
    expect(rfc3986("a b!*'()")).toBe("a%20b%21%2A%27%28%29");
  });
});
