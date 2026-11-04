import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test with every /api route mocked in the browser and a fake YouTube IFrame API,
 * so it runs without Discogs credentials or network access.
 */

const listing = (id: number, price: number, title: string) => ({
  id,
  url: `https://www.discogs.com/sell/item/${id}`,
  releaseId: id * 10,
  artist: `Artist ${id}`,
  title,
  format: "LP, Album",
  year: 1990 + id,
  thumb: null,
  condition: "Very Good Plus (VG+)",
  sleeveCondition: "Very Good (VG)",
  price: { value: price, currency: "GBP" },
  shipping: null,
  shipsFrom: "UK",
  comments: null,
});

const release = (id: number, genres: string[], videos: string[]) => ({
  id: id * 10,
  title: `Release ${id}`,
  artist: `Artist ${id}`,
  year: 1990 + id,
  url: "",
  image: null,
  genres,
  styles: [],
  videos: videos.map((t, i) => ({ videoId: `v${id}${i}`.padEnd(11, "0"), title: t, duration: 120 })),
});

const RELEASES = [
  release(1, ["Electronic"], ["Acid Track"]),
  release(2, ["Rock"], ["Rock Song", "Rock Song B-side"]),
  release(3, ["Jazz"], []), // no audio: hidden by default
];

const FAKE_YT = `
  window.__yt = { players: [] };
  window.YT = {
    Player: function (el, opts) {
      const p = {
        videoId: opts.videoId,
        state: -1,
        loadVideoById(id) { p.videoId = id; p.setState(1); },
        playVideo() { p.setState(1); },
        pauseVideo() { p.setState(2); },
        getPlayerState() { return p.state; },
        destroy() {},
        setState(s) { p.state = s; opts.events.onStateChange && opts.events.onStateChange({ data: s, target: p }); },
      };
      el.setAttribute("data-video", "fake");
      window.__yt.players.push(p);
      setTimeout(() => opts.events.onReady && opts.events.onReady({ target: p }), 0);
      return p;
    },
  };
  setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
`;

async function mockApi(page: Page, opts: { username: string | null }) {
  const wanted: number[] = [];
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ contentType: "application/javascript", body: FAKE_YT }),
  );
  await page.route("**/api/me", (r) => r.fulfill({ json: { username: opts.username } }));
  await page.route("**/api/wantlist", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: { ids: [] } });
    wanted.push(r.request().postDataJSON().releaseId);
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/seller/*/inventory*", (r) =>
    r.fulfill({
      json: {
        page: 1,
        pages: 1,
        items: 3,
        listings: [listing(1, 9.5, "Acid Album"), listing(2, 24, "Rock Album"), listing(3, 5, "Jazz Album")],
      },
    }),
  );
  await page.route("**/api/releases", (r) => {
    const ids: number[] = r.request().postDataJSON().ids;
    r.fulfill({ json: { releases: RELEASES.filter((x) => ids.includes(x.id)), failed: [], retry: [] } });
  });
  return { wanted };
}

const endCurrentVideo = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __yt: { players: { setState(s: number): void }[] } };
    w.__yt.players[0].setState(0);
  });

test("seller link → filtered records → playlist autoplay", async ({ page }) => {
  await mockApi(page, { username: null });
  await page.goto("/");
  const hero = page.getByRole("main");
  await hero.getByLabel("Discogs seller link or username").fill("https://www.discogs.com/seller/testshop/profile");
  await hero.getByRole("button", { name: "Dig the crates" }).click();
  await expect(page).toHaveURL(/\/seller\/testshop$/);

  const cards = page.getByTestId("record-card");
  await expect(cards).toHaveCount(2); // jazz record has no audio
  await expect(cards.first().getByTestId("price")).toHaveText("£9.50");

  await page.getByRole("button", { name: /Play all/ }).click();
  await expect(page.getByTestId("now-playing")).toBeVisible();
  await expect(page.getByTestId("now-playing")).toHaveText("Acid Track");
  await expect(page.getByTestId("now-playing-price")).toHaveText("£9.50");

  // Video ends → next record autoplays.
  await endCurrentVideo(page);
  await expect(page.getByTestId("now-playing")).toHaveText("Rock Song");
  await expect(page.getByTestId("now-playing-price")).toHaveText("£24.00");

  // Genre filter narrows the list and the URL.
  await page.getByRole("button", { name: /^Electronic/ }).click();
  await expect(page).toHaveURL(/genre=Electronic/);
  await expect(cards).toHaveCount(1);

  // Price filter (debounced) applies too.
  await page.getByRole("button", { name: /^Electronic/ }).click();
  await page.getByLabel("Max").first().fill("10");
  await expect(cards).toHaveCount(1);
  await expect(page).toHaveURL(/pmax=10/);
});

test("signed-in user can add a record to their wantlist", async ({ page }) => {
  const { wanted } = await mockApi(page, { username: "digger" });
  await page.goto("/seller/testshop");
  await expect(page.getByText("@digger")).toBeVisible();
  const first = page.getByTestId("record-card").first();
  await first.getByRole("button", { name: /Want/ }).click();
  await expect(first.getByRole("button", { name: /In wantlist/ })).toBeVisible();
  expect(wanted).toEqual([10]);
});

test("signed-out wantlist button links to Discogs sign-in", async ({ page }) => {
  await mockApi(page, { username: null });
  await page.goto("/seller/testshop");
  const link = page.getByTestId("record-card").first().getByRole("link", { name: /Want/ });
  await expect(link).toHaveAttribute("href", /\/api\/auth\/discogs\/login\?returnTo=%2Fseller%2Ftestshop/);
});

test("filter sidebar and results scroll independently on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, { username: null });
  // Lots of records with lots of styles: both columns taller than the window.
  const styles = Array.from({ length: 40 }, (_, i) => `Style ${i + 1}`);
  const many = Array.from({ length: 30 }, (_, i) => i + 1);
  await page.route("**/api/seller/*/inventory*", (r) =>
    r.fulfill({ json: { page: 1, pages: 1, items: many.length, listings: many.map((i) => listing(i, i, `Album ${i}`)) } }),
  );
  await page.route("**/api/releases", (r) => {
    const ids: number[] = r.request().postDataJSON().ids;
    r.fulfill({
      json: {
        releases: ids.map((id) => ({ ...release(id / 10, ["Electronic"], ["Track"]), styles })),
        failed: [],
        retry: [],
      },
    });
  });

  await page.goto("/seller/testshop");
  await expect(page.getByTestId("record-card")).toHaveCount(30);
  const sidebar = page.getByTestId("filters-sidebar");
  const sidebarScroll = () => sidebar.evaluate((el) => el.scrollTop);
  const pageScroll = () => page.evaluate(() => window.scrollY);
  expect(await sidebar.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // Wheel over the sidebar: only the sidebar moves.
  await sidebar.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(sidebarScroll).toBeGreaterThan(0);
  expect(await pageScroll()).toBe(0);

  // Wheel over the results: only the page moves.
  const before = await sidebarScroll();
  await page.getByTestId("record-card").nth(3).hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(pageScroll).toBeGreaterThan(0);
  expect(await sidebarScroll()).toBe(before);

  // With the player open, the bottom of the filters can still be reached above the player bar.
  await page.getByRole("button", { name: /Play all/ }).click();
  await expect(page.getByTestId("now-playing")).toBeVisible();
  await sidebar.hover();
  await page.mouse.wheel(0, 5000);
  const clear = page.getByRole("button", { name: "Clear filters" });
  await expect(clear).toBeInViewport();
  const clearBox = (await clear.boundingBox())!;
  const barTop = await page.evaluate(() => window.innerHeight - parseFloat(getComputedStyle(document.documentElement).fontSize) * 4.5);
  expect(clearBox.y + clearBox.height).toBeLessThanOrEqual(barTop);
});
