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
deploy/preflight.sh             Google Cloud access check run before each deploy
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

Every push to `main` runs the tests, then GitHub Actions (`.github/workflows/deploy.yml`) builds the `Dockerfile`, pushes the image to Artifact Registry and deploys it to Cloud Run. It's served over HTTPS at a `https://discogs-preview-….run.app` address.

The whole deploy is done by a Google Cloud **service account key** (`credentials.json`) stored as a GitHub secret. You don't need access to the Google Cloud console. If the key belongs to someone else's project, they'll only need to step in if the account is missing a permission. The workflow tells you exactly what to ask for.

### One-time setup

1. **Check with the project's owner** that it's OK to host this app in their project, since any usage is billed there. It runs as a single instance that scales to zero when nobody is using it, so personal use should stay within Cloud Run's free monthly allowance. Billing must be enabled on the project, which only the owner can do.
2. **Register a Discogs app for the hosted copy** at <https://www.discogs.com/settings/developers>, keeping your local one for development. Leave its callback URL for now.
3. **Make a session secret:** any random string of 32+ characters. On a Mac or Linux:

   ```bash
   openssl rand -base64 32
   ```

   A password manager's "generate password" (40+ characters) works too.
4. **Add the repository secrets** in GitHub: the repo → **Settings → Secrets and variables → Actions → New repository secret**.

   | Secret | Value |
   | --- | --- |
   | `GCP_SA_KEY` | the **entire** contents of `credentials.json`, braces included |
   | `DISCOGS_CONSUMER_KEY` | Consumer Key of the Discogs app from step 2 |
   | `DISCOGS_CONSUMER_SECRET` | Consumer Secret of that app |
   | `SESSION_SECRET` | the string from step 3 |

   Optionally, on the **Variables** tab, add `GCP_REGION` (default `europe-west2`, London).
5. **Deploy** by merging to `main`, or with **Actions → Deploy to Cloud Run → Run workflow**.
   - The run first does a **Google Cloud access check**. It turns on what the account is allowed to turn on, such as the Cloud Run and Artifact Registry APIs and the image repository.
   - If something is still missing, the run stops and its summary page shows a ✅/❌ table plus **a message to forward to the project owner**, with the exact commands filled in. Once they've run them, use **Re-run jobs**.
   - When it succeeds, the summary shows the app URL.
6. **Finish the Discogs app setup:** set its callback URL to `<app URL>/api/auth/discogs/callback`. The run summary prints the full URL.

### What the service account needs

If you'd rather ask the owner up front, these are what the access check looks for:

- **Billing** enabled on the project.
- **APIs** `run.googleapis.com` and `artifactregistry.googleapis.com` enabled.
- **Roles on the project:** `roles/run.admin` (deploy, and make the app public) and `roles/artifactregistry.admin`. `roles/artifactregistry.writer` is enough if they create a Docker repository called `discogs-preview` in your region themselves.
- **`roles/iam.serviceAccountUser` on the service account itself**, so the app can run as that account.

An account with the project-wide Owner role already has all of this. Editor isn't quite enough, because it can't make the service public.

### Using it on your phone

Open the app URL, then **Share → Add to Home Screen** (iOS) or **⋮ → Install app** (Android). It opens full-screen with its own icon.

### Notes

- **The app's secrets are stored as Cloud Run environment variables**, not in Secret Manager, to keep the permissions needed small. Anyone with view access to the project's Cloud Run settings, such as the project owner, can see them. To change one, update the GitHub secret and re-run the workflow.
- **The public URL is worked out from each request.** Cloud Run's `Host` and `X-Forwarded-Proto` headers give the address, so no `APP_URL` is needed. Set `APP_URL` only if you add a custom domain and want to pin it.
- **The release cache lives in the instance's memory** (`/tmp`), so it empties when the service scales to zero after a quiet spell. To keep it, point `DATABASE_URL` and `DATABASE_AUTH_TOKEN` at a free [Turso](https://turso.tech) database: add both as GitHub secrets and to the env file in the workflow's Deploy step.
- **The service runs as a single instance** (`--max-instances 1`), so the Discogs rate limiter and caches stay consistent. That's plenty for personal use.
- **Logs:** build and deploy logs are in the GitHub Actions run. The running app's logs are in the project's Cloud Logging, which only someone with console access, such as the owner, can open.

## Known limits

- **First scans of big shops are slow.** At 60 release lookups a minute, 1,000 matching records take about 17 minutes to fill in completely. Results stream in as they load, and narrower price, year or format filters cut the number of lookups.
- **The rate limit is shared by everyone using one deployment**, since all browsing uses the app's key.
- **Not every release has audio.** Some have no videos on Discogs, or videos whose owners block embedding. These are hidden by default or skipped by the player.
- **Mobile background playback is unreliable.** Mobile browsers usually pause embedded YouTube when the screen locks.
- **The video stays on screen.** YouTube's embed terms require a visible player of at least 200×200 px, so it can be shrunk but not hidden.
- **Prices are in the seller's listing currency.** "Buy" opens the Discogs listing, because the API can't add items to a cart.
