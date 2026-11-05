import { afterEach, describe, expect, it } from "vitest";
import { appUrl, safeReturnTo } from "@/lib/url";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

afterEach(() => {
  delete process.env.APP_URL;
});

describe("appUrl", () => {
  it("prefers APP_URL and strips a trailing slash", () => {
    process.env.APP_URL = "https://records.example.com/";
    expect(appUrl(req("http://0.0.0.0:8080/x", { host: "other.run.app" }))).toBe("https://records.example.com");
  });

  it("uses the Host header and X-Forwarded-Proto behind Cloud Run", () => {
    expect(
      appUrl(req("http://0.0.0.0:8080/api/auth/discogs/login", { host: "discogs-preview-123.europe-west2.run.app", "x-forwarded-proto": "https" })),
    ).toBe("https://discogs-preview-123.europe-west2.run.app");
  });

  it("takes the first protocol from a proxy chain", () => {
    expect(appUrl(req("http://internal/", { host: "a.run.app", "x-forwarded-proto": "https, http" }))).toBe("https://a.run.app");
  });

  it("keeps the request scheme when no proxy header is present (local dev)", () => {
    expect(appUrl(req("http://localhost:3000/x", { host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("ignores malformed Host headers and unknown protocols", () => {
    expect(appUrl(req("http://localhost:3000/x", { host: "evil.com/path" }))).toBe("http://localhost:3000");
    expect(appUrl(req("http://localhost:3000/x", { host: "a.run.app", "x-forwarded-proto": "javascript" }))).toBe("http://a.run.app");
  });
});

describe("safeReturnTo", () => {
  it.each([
    ["/seller/x?genre=Rock", "/seller/x?genre=Rock"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    [null, "/"],
  ])("%s → %s", (input, out) => expect(safeReturnTo(input)).toBe(out));
});
