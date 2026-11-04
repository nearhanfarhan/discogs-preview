# Discogs Preview

Paste a Discogs seller link, filter their stock by genre, style, price, year, format and condition, then play through the matching records as a playlist. The YouTube player keeps going in a background tab. Every record shows its price, and you can add it to your Discogs wantlist or open the listing to buy.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # http://localhost:3000
```

### 1. Register a Discogs app

1. Go to <https://www.discogs.com/settings/developers> and choose **Create an Application**.
2. Set the **Callback URL** to `http://localhost:3000/api/auth/discogs/callback`. In production, use `${APP_URL}/api/auth/discogs/callback`.
3. Copy the **Consumer Key** and **Consumer Secret** into `DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET`.

The key and secret do two jobs:
- They raise the API rate limit from 25 to 60 requests a minute for browsing.
- They power "Connect Discogs" (OAuth 1.0a) for the wantlist.

Browsing works without them, just more slowly. Wantlist actions don't.

### 2. Other settings

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public base URL, used to build the OAuth callback |
| `SESSION_SECRET` | 32+ random characters for the encrypted session cookie (`openssl rand -base64 32`) |
| `DATABASE_URL` | Release cache. Defaults to `file:./data/cache.db`. In production, use a [Turso](https://turso.tech) `libsql://…` URL. |
| `DATABASE_AUTH_TOKEN` | Turso auth token (production only) |

## How it works

```
browser                                   Next.js server                     Discogs
───────                                   ──────────────                     ───────
useSellerScan ── GET /api/seller/:u/inventory?page=N ──► 15-min memory cache ──► /users/:u/inventory (100/page)
   │  apply price/year/format/condition filters
   └── POST /api/releases {ids} ──► SQLite/libSQL cache ──► (misses) /releases/:id  ◄─ rate-limited queue
          apply genre/style/"has audio" filters
          → results grid → player queue (zustand) → YouTube IFrame player
AccountMenu / WantlistButton ── /api/wantlist ──► OAuth-signed PUT/DELETE /users/:me/wants/:id
```

- **Two-stage filtering.** Inventory listings carry price, condition, format and year, but not genres or audio. Those come from `/releases/:id`, one request per record. The app applies the cheap filters first and looks up release details only for records that pass.
- **Rate limiting.** `src/lib/discogs/rateLimit.ts` queues requests per rate-limit bucket: one for the app, plus one per signed-in user. It runs at full speed while `X-Discogs-Ratelimit-Remaining` shows budget, then slows to about one call a second. A 429 is retried with backoff.
- **Release cache.** Release details are stored for 30 days. Repeat scans of a seller, and of any other seller stocking the same releases, come back almost instantly.
- **Progressive results.** Records appear as their details arrive. Changing a filter re-filters what's already loaded and doesn't restart the scan, but changing the sort does. Each scan step covers 1,000 listings, and **Scan 1,000 more** continues from there.
- **Player.** "1 per record" (the default) plays each record's first video, which suits crate-digging. "All tracks" plays every video. When a track ends, the next one starts; dead or non-embeddable videos are skipped. Shortcuts: <kbd>Space</kbd> play/pause, <kbd>→</kbd> next track, <kbd>Shift</kbd>+<kbd>→</kbd> next record, <kbd>←</kbd> previous.
- **Shareable filters.** All filters live in the URL, for example `/seller/NAME?genre=Electronic&pmax=20&fmt=LP`.

## Project layout

```
src/app/                        pages + API routes
  api/seller/[username]/inventory   paged inventory proxy
  api/releases                      batched release details (cached)
  api/wantlist                      GET ids / POST add / DELETE remove
  api/auth/discogs/*                OAuth login, callback, logout
  seller/[username]/SellerView.tsx  filters + results + "play all"
src/components/                 FilterPanel, RecordCard, PlayerBar, YouTubePlayer, …
src/lib/discogs/                API client, OAuth signing, rate limiter, URL parsers
src/lib/filters.ts              filter logic + URL (de)serialisation
src/lib/useSellerScan.ts        client-side scan/enrich loop
src/store/                      zustand stores: player queue, account/wantlist
Dockerfile                      production image (standalone Next.js server, port 8080)
.github/workflows/deploy.yml    test → build → deploy to Cloud Run on push to main
deploy/setup-gcp.sh             one-time Google Cloud setup (run in Cloud Shell)
```

## Scripts

```bash
npm test            # unit + route tests (Vitest, Discogs mocked)
npm run build && npm start   # production server locally (reads .env / .env.local)
npm run test:e2e    # Playwright tests against the production server (run `npm run build` first)
npm run lint
npm run typecheck
```

## Deploying (Google Cloud Run)

Every push to `main` runs the tests, builds the `Dockerfile`, pushes the image to Artifact Registry and deploys it to Cloud Run (`.github/workflows/deploy.yml`). It's served over HTTPS at a `https://discogs-preview-….run.app` address.

### One-time setup

1. **Google Cloud project with billing enabled.** Personal use fits in Cloud Run's free monthly allowance. The service scales to zero when nobody is using it.
2. **Register a Discogs app for the hosted copy** at <https://www.discogs.com/settings/developers>. Keep the local one for development. Leave the callback URL for now.
3. **Run the setup script in [Cloud Shell](https://shell.cloud.google.com)**, which runs in the browser and is already signed in as you:

   ```bash
   git clone https://github.com/nearhanfarhan/discogs-preview.git && cd discogs-preview
   bash deploy/setup-gcp.sh
   ```

   It asks for your project ID, the deploy service account's email (`client_email` in `credentials.json`), a region (default `europe-west2`, London) and the Discogs key and secret. Then it:
   - enables the Cloud Run, Artifact Registry and Secret Manager APIs;
   - creates an image repository that keeps only the 3 latest images;
   - stores the Discogs key and secret plus a generated session secret in Secret Manager;
   - creates a runtime service account that can read only those secrets;
   - gives your deploy service account just `run.admin`, `artifactregistry.writer`, and permission to act as the runtime account.

   It's safe to re-run, for example to change the Discogs keys.
4. **In GitHub**, go to the repo → Settings → Secrets and variables → Actions:
   - add a repository secret `GCP_SA_KEY` containing the full contents of `credentials.json`;
   - if you chose a region other than `europe-west2`, add a variable `GCP_REGION`.
5. **Deploy** by merging to `main`, or from Actions → Deploy to Cloud Run → Run workflow. The run summary shows the app URL.
6. **Finish the Discogs app setup.** Set its callback URL to `<app URL>/api/auth/discogs/callback`.

### Using it on your phone

Open the app URL, then **Share → Add to Home Screen** (iOS) or **⋮ → Install app** (Android). It opens full-screen with its own icon.

### Notes

- **The public URL is worked out from each request.** Cloud Run's `Host` and `X-Forwarded-Proto` headers give the address, so no `APP_URL` is needed. Set `APP_URL` only if you add a custom domain and want to pin it.
- **The release cache lives in the instance's memory** (`/tmp`), so it empties when the service scales to zero after a quiet spell. To keep it, point `DATABASE_URL` and `DATABASE_AUTH_TOKEN` at a free [Turso](https://turso.tech) database: add both as secrets and to `--set-secrets` in the workflow.
- **The service runs as a single instance** (`--max-instances 1`), so the Discogs rate limiter and caches stay consistent. That's plenty for personal use.
- **Logs:** Cloud Console → Cloud Run → `discogs-preview` → Logs.

## Known limits

- **First scans of big shops are slow.** At 60 release lookups a minute, 1,000 matching records take about 17 minutes to fill in completely. Results stream in as they load, and narrower price, year or format filters cut the number of lookups.
- **The rate limit is shared by everyone using one deployment**, since all browsing uses the app's key.
- **Not every release has audio.** Some have no videos on Discogs, or videos whose owners block embedding. These are hidden by default or skipped by the player.
- **Mobile background playback is unreliable.** Mobile browsers usually pause embedded YouTube when the screen locks.
- **The video stays on screen.** YouTube's embed terms require a visible player of at least 200×200 px, so it can be shrunk but not hidden.
- **Prices are in the seller's listing currency.** "Buy" opens the Discogs listing, because the API can't add items to a cart.
