import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  conditionRank,
  matchesFormat,
  matchesListing,
  matchesRelease,
  parseFilters,
  serializeFilters,
  type Filters,
} from "@/lib/filters";
import type { Listing, Release } from "@/lib/discogs/types";

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 1,
  url: "https://www.discogs.com/sell/item/1",
  releaseId: 10,
  artist: "A",
  title: "T",
  format: "LP, Album",
  year: 1994,
  thumb: null,
  condition: "Very Good Plus (VG+)",
  sleeveCondition: "Very Good (VG)",
  price: { value: 15, currency: "GBP" },
  shipping: null,
  shipsFrom: null,
  comments: null,
  ...over,
});

const release = (over: Partial<Release> = {}): Release => ({
  id: 10,
  title: "T",
  artist: "A",
  year: 1994,
  url: "",
  image: null,
  genres: ["Electronic"],
  styles: ["Techno", "Ambient"],
  videos: [{ videoId: "dQw4w9WgXcQ", title: "x", duration: 100 }],
  ...over,
});

const f = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });

describe("conditionRank", () => {
  it("distinguishes VG+ from VG and NM from M", () => {
    expect(conditionRank("Very Good Plus (VG+)")).toBe(6);
    expect(conditionRank("Very Good (VG)")).toBe(5);
    expect(conditionRank("Near Mint (NM or M-)")).toBe(7);
    expect(conditionRank("Mint (M)")).toBe(8);
    expect(conditionRank("Good Plus (G+)")).toBe(4);
    expect(conditionRank("Generic")).toBe(0);
    expect(conditionRank(null)).toBe(0);
  });
});

describe("matchesFormat", () => {
  it("matches common Discogs format strings", () => {
    expect(matchesFormat("2xLP, Album", "LP")).toBe(true);
    expect(matchesFormat('12", EP', '12"')).toBe(true);
    expect(matchesFormat('7", Single, 45 RPM', '7"')).toBe(true);
    expect(matchesFormat('7", Single', '12"')).toBe(false);
    expect(matchesFormat("CD, Album", "CD")).toBe(true);
    expect(matchesFormat("2xCD, Comp", "CD")).toBe(true);
    expect(matchesFormat("Flexi-disc", "LP")).toBe(false);
    expect(matchesFormat("Cass, Album", "Cassette")).toBe(true);
    expect(matchesFormat("LP, Album", "CD")).toBe(false);
  });
});

describe("matchesListing", () => {
  it("applies price bounds inclusively", () => {
    expect(matchesListing(listing(), f({ priceMin: 15, priceMax: 15 }))).toBe(true);
    expect(matchesListing(listing(), f({ priceMax: 14.99 }))).toBe(false);
    expect(matchesListing(listing(), f({ priceMin: 20 }))).toBe(false);
  });

  it("applies year range and excludes unknown years when a range is set", () => {
    expect(matchesListing(listing(), f({ yearMin: 1990, yearMax: 1999 }))).toBe(true);
    expect(matchesListing(listing(), f({ yearMin: 1995 }))).toBe(false);
    expect(matchesListing(listing({ year: 0 }), f({ yearMax: 2000 }))).toBe(false);
    expect(matchesListing(listing({ year: 0 }), f())).toBe(true);
  });

  it("matches any selected format", () => {
    expect(matchesListing(listing(), f({ formats: ['7"', "LP"] }))).toBe(true);
    expect(matchesListing(listing(), f({ formats: ['7"'] }))).toBe(false);
  });

  it("requires at least the minimum media condition", () => {
    expect(matchesListing(listing(), f({ minCondition: "VG+" }))).toBe(true);
    expect(matchesListing(listing(), f({ minCondition: "NM" }))).toBe(false);
  });
});

describe("matchesRelease", () => {
  it("filters on genre and style (any of)", () => {
    expect(matchesRelease(release(), f({ genres: ["Rock", "Electronic"] }))).toBe(true);
    expect(matchesRelease(release(), f({ genres: ["Rock"] }))).toBe(false);
    expect(matchesRelease(release(), f({ styles: ["Ambient"] }))).toBe(true);
    expect(matchesRelease(release(), f({ genres: ["Electronic"], styles: ["House"] }))).toBe(false);
  });

  it("matches any selected style by default, or every one in all-mode", () => {
    const both = release({ styles: ["Techno", "Ambient"] });
    const one = release({ styles: ["Techno"] });
    const styles = ["Techno", "Ambient"];
    expect(matchesRelease(both, f({ styles }))).toBe(true);
    expect(matchesRelease(one, f({ styles }))).toBe(true);
    expect(matchesRelease(both, f({ styles, styleMode: "all" }))).toBe(true);
    expect(matchesRelease(one, f({ styles, styleMode: "all" }))).toBe(false);
  });

  it("treats a single style the same in both modes", () => {
    const r = release({ styles: ["Techno", "House"] });
    for (const styleMode of ["any", "all"] as const) {
      expect(matchesRelease(r, f({ styles: ["House"], styleMode }))).toBe(true);
      expect(matchesRelease(r, f({ styles: ["Disco"], styleMode }))).toBe(false);
    }
  });

  it("keeps genres as any-of", () => {
    const r = release({ genres: ["Electronic"] });
    expect(matchesRelease(r, f({ genres: ["Electronic", "Rock"] }))).toBe(true);
  });

  it("hides releases without audio only when audioOnly is on", () => {
    expect(matchesRelease(release({ videos: [] }), f({ audioOnly: true }))).toBe(false);
    expect(matchesRelease(release({ videos: [] }), f({ audioOnly: false }))).toBe(true);
  });
});

describe("URL round-trip", () => {
  it("serialises and parses back to the same filters", () => {
    const filters = f({
      priceMin: 5,
      priceMax: 20.5,
      yearMin: 1980,
      formats: ["LP", '12"'],
      minCondition: "VG+",
      genres: ["Funk / Soul", "Folk, World, & Country"],
      styles: ["Disco", "Boogie"],
      styleMode: "all",
      audioOnly: false,
      sort: "price",
      order: "asc",
    });
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });

  it("keeps the default URL empty and ignores junk", () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe("");
    expect(parseFilters(new URLSearchParams("pmin=abc&sort=bogus&cond=XX&smode=nope"))).toEqual(DEFAULT_FILTERS);
  });
});
