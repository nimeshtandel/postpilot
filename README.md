# PostPilot

A social media scheduler for solo creators. Write a post once, tailor it per platform (by hand or with AI), and schedule it to Instagram, Facebook, LinkedIn, X, Threads, YouTube and TikTok.

Runs on **Cloudflare's free plan, no card needed**: Workers (app + scheduler), D1 (database), Workers KV (photos and videos).

**Stack:** Next.js 16.3 · TypeScript · Tailwind CSS 4 · Drizzle ORM · OpenNext for Cloudflare · Claude API for captions

## What's included

- Email/password accounts with signed session cookies (PBKDF2 password hashing, strength set by `PASSWORD_HASH_ITERATIONS`)
- OAuth connections for 7 platforms, with tokens encrypted at rest (AES-256-GCM) and refreshed automatically
- Composer with per-platform captions, live previews, character meters and media checks
- AI captions: write from an idea, polish, or tailor one caption to every platform, plus hashtags
- Photo and video uploads (up to 25 MB each) stored in Workers KV
- Month calendar, post lists (scheduled, published, failed, drafts), retry for failed posts
- A Cron Trigger that publishes due posts every minute, claiming each post atomically so nothing double-posts

## Deploy to Cloudflare (free)

Requires Node.js 20+ and a free Cloudflare account. Already created in your account, with their ids in `wrangler.jsonc`:
- D1 database `postpilot`, with all tables
- KV namespace `postpilot-media`, for uploads

Steps:

1. **Install and log in:**
   ```bash
   npm install
   npx wrangler login
   ```
2. **App secrets are automatic.** `AUTH_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET` are generated on first use and stored in the D1 table `app_secrets`. You can still set them as Worker secrets (`npm run setup:secrets`); a Worker secret always wins. Never delete that table: it holds the key that decrypts saved social connections.
3. **First deploy:**
   ```bash
   npm run deploy
   ```
   Wrangler prints your live URL, like `https://postpilot.<you>.workers.dev`.
4. **Set your URL:** put that URL in `wrangler.jsonc` → `vars.APP_URL`, then run `npm run deploy` again. OAuth logins and media links are built from it.
5. **Open the URL and sign up.** Platforms show "Not set up yet" until you add their keys.
6. **Add AI and platform keys** as secrets, one at a time:
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put META_APP_ID
   # …see the table below
   ```
   Secrets take effect immediately; no redeploy needed.

### Free plan limits

| | Free plan | What it means |
|---|---|---|
| Upload size | 25 MB per file, 1 GB total | Photos and short videos are fine |
| Uploads | 1,000 per day | |
| CPU per request | 10 ms | Passwords use 20,000 PBKDF2 rounds to fit |
| Outside requests per run | 50 | Text and photo posts are fine; long Instagram/Threads video processing may time out |
| Requests | 100,000 per day | |

**When you upgrade to Workers Paid ($5/month):** set `PASSWORD_HASH_ITERATIONS` to `100000` in `wrangler.jsonc` and redeploy. Each user's password is strengthened automatically at their next login. For files over 25 MB, switch media storage to R2 (`src/lib/media.ts` is the only file to change).

## Platform setup

Each platform needs a developer app. The redirect URI is always `{APP_URL}/api/connect/<platform>/callback`.

| Platform | Where | Secrets | Permissions / products | Notes |
|---|---|---|---|---|
| Facebook + Instagram | developers.facebook.com → create app (Business) | `META_APP_ID`, `META_APP_SECRET` | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `business_management`, `instagram_basic`, `instagram_content_publish` | Redirect: `/api/connect/facebook/callback`. Instagram must be a Business/Creator account linked to a Facebook Page. Other users need App Review. |
| Threads | Same Meta app → add the "Threads API" use case | `THREADS_APP_ID`, `THREADS_APP_SECRET` | `threads_basic`, `threads_content_publish` | Tokens last 60 days, refreshed automatically. |
| LinkedIn | linkedin.com/developers | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Products: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" | Tokens last 60 days; users reconnect when prompted. Bump `LINKEDIN_API_VERSION` in `wrangler.jsonc` yearly. |
| X | developer.x.com → app → User authentication: OAuth 2.0, Web App, Read and write | `X_CLIENT_ID`, `X_CLIENT_SECRET` | `tweet.read tweet.write users.read media.write offline.access` | Posting requires a paid X API tier. Text + up to 4 images. |
| YouTube | console.cloud.google.com → enable YouTube Data API v3 → OAuth client (Web) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `youtube.upload`, `youtube.readonly` | Uploads cost 1,600 quota units each (default 10,000/day). Unverified apps' uploads stay private until Google audits the app. |
| TikTok | developers.tiktok.com → app → Login Kit + Content Posting API (Direct Post) | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `user.info.basic`, `video.publish` | Posts are private (`SELF_ONLY`) until TikTok audits your app. |

AI captions need `ANTHROPIC_API_KEY` from console.anthropic.com.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars      # fill in AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET
npm run db:migrate:local            # creates the local D1 database
npm run dev                         # http://localhost:3000, with local D1 and KV
npm run cron:local                  # second terminal: publishes due posts every 30s
```

To test in the real Workers runtime instead of Node.js: `npm run preview`.

Platforms download media from your public URL, so to test publishing locally, run a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and set `APP_URL` in `.dev.vars` to it.

## Changing the database

Edit `src/lib/schema.ts`, then:

```bash
npm run db:generate          # writes a new SQL migration into ./drizzle
npm run db:migrate:local
npm run db:migrate:remote    # applies it to your D1 database on Cloudflare
```

## Project layout

```
worker.ts            Cloudflare entry: Next.js handler + every-minute scheduled() publisher
wrangler.jsonc       Worker config: D1, KV, cron, non-secret settings
src/
  app/
    (app)/           dashboard, compose, calendar, posts, accounts, settings
    api/             auth, connect (OAuth), posts, media, ai/caption, cron
    media/[file]     public media URLs that platforms fetch (served from KV)
  components/        Composer, PostRow, Nav, …
  lib/
    schema.ts        database tables
    publisher.ts     publishing engine
    platforms.ts     per-platform limits and validation
    social/          one adapter per platform: OAuth + publish + token refresh
drizzle/             SQL migrations
```

To add a platform, write an adapter in `src/lib/social/` that implements `ConnectAdapter` and `PublishAdapter`, then register it in `src/lib/social/index.ts` and `src/lib/platforms.ts`.

## Notes

- Next.js is pinned to 16.3.8 because the Cloudflare adapter doesn't support 16.4 yet. Upgrade both together later.
- Not built yet: video for LinkedIn and X, analytics pulled back from platforms, recurring posts, bulk CSV upload, billing.
