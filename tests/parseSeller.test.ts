import { describe, expect, it } from "vitest";
import { parseSeller } from "@/lib/discogs/parseSeller";

describe("parseSeller", () => {
  it.each([
    ["https://www.discogs.com/seller/RecordShop/profile", "RecordShop"],
    ["https://www.discogs.com/seller/RecordShop", "RecordShop"],
    ["www.discogs.com/seller/record.shop-uk/profile?genre=Rock&format=Vinyl", "record.shop-uk"],
    ["discogs.com/user/some_user", "some_user"],
    ["https://www.discogs.com/de/seller/Berlin_Records/profile", "Berlin_Records"],
    ["https://www.discogs.com/shop/foo", "foo"],
    ["  bare_username  ", "bare_username"],
    ["http://discogs.com/seller/a%2Eb/profile", "a.b"],
  ])("%s → %s", (input, expected) => {
    expect(parseSeller(input)).toBe(expected);
  });

  it.each(["", "https://example.com/seller/foo", "https://www.discogs.com/release/123", "not a url with spaces"])(
    "rejects %j",
    (input) => {
      expect(parseSeller(input)).toBeNull();
    },
  );
});
