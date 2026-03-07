# ActivityOS Setup Guide

Everything you need to do to get ActivityOS running, from external service setup through deployment.

---

## 1. Supabase — Database Setup

You already have a Supabase project with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Get the Service Role Key

1. Go to your Supabase dashboard → **Settings** → **API**
2. Copy the **service_role** key (under "Project API keys")
3. Save it as `SUPABASE_SERVICE_ROLE_KEY`

### Run the Migrations

Apply all three ActivityOS migrations to create 12 tables:

```bash
# Option A: Using Supabase CLI (if linked)
supabase db push

# Option B: Copy-paste into Supabase SQL Editor
# Go to Supabase Dashboard → SQL Editor → New Query
# Paste the contents of: supabase/migrations/013_activityos_schema.sql
# Click "Run"
# Then paste: supabase/migrations/014_discord_achievements.sql
# Click "Run"
# Then paste: supabase/migrations/015_quotes_and_polling.sql
# Click "Run"
```

**Verify:** In the Table Editor, you should see these tables:
- `github_deliveries`
- `activity_events` (includes `posted_to_discord` column)
- `habits`
- `goals`
- `tracked_repos`
- `sync_state`
- `sync_runs`
- `achievements`
- `discord_posts`
- `summary_posts`
- `app_settings`
- `quotes`

### Migrate Quotes from Activity-Bot (Optional)

If migrating from the original activity-bot, you can import existing quotes:

```bash
# From old PostgreSQL database
OLD_DB_URL=postgresql://user:pass@host:5432/dbname npx tsx scripts/migrate-quotes.ts

# From CSV file (columns: text, author)
QUOTES_CSV=quotes.csv npx tsx scripts/migrate-quotes.ts
```

The migration script skips duplicates automatically. The 015 migration seeds 118 programming quotes by default.

---

## 2. Reown — Wallet Auth

### Create a Project

1. Go to [cloud.reown.com](https://cloud.reown.com)
2. Sign up / log in
3. Click **Create Project**
4. Name: `Staxed.dev ActivityOS`
5. Type: **App**
6. Copy the **Project ID**
7. Save it as `NEXT_PUBLIC_REOWN_PROJECT_ID`

### Configure Allowed Domains

In your Reown project settings:
- Add `staxed.dev` to the allowed domains
- Add `localhost` for local development

---

## 3. NextAuth — Session Secret

Generate a random secret for JWT signing:

```bash
# Run this in your terminal
openssl rand -base64 32
```

Save the output as `NEXTAUTH_SECRET`.

---

## 4. GitHub App — Webhooks & API Access

### Create the App

1. Go to [github.com/settings/apps](https://github.com/settings/apps)
2. Click **New GitHub App**
3. Fill in:
   - **App name:** `staxed-activityos` (must be globally unique)
   - **Homepage URL:** `https://staxed.dev`
   - **Webhook URL:** `https://staxed.dev/api/github/webhook`
   - **Webhook secret:** Generate one with `openssl rand -hex 20` — save as `GITHUB_WEBHOOK_SECRET`

### Set Permissions

Under **Repository permissions:**
| Permission | Access |
|---|---|
| Contents | Read-only |
| Discussions | Read-only |
| Issues | Read-only |
| Pull requests | Read-only |
| Metadata | Read-only |

No organization or account permissions needed.

### Subscribe to Events

Check these boxes under **Subscribe to events:**
- [x] Push
- [x] Pull request
- [x] Pull request review
- [x] Pull request review comment
- [x] Issues
- [x] Issue comment
- [x] Release
- [x] Create
- [x] Delete
- [x] Fork
- [x] Watch
- [x] Commit comment
- [x] Member
- [x] Gollum (Wiki)
- [x] Public
- [x] Discussion

### Where can this GitHub App be installed?

Select **Only on this account**.

### Save & Generate Keys

1. Click **Create GitHub App**
2. Note the **App ID** shown on the next page → save as `GITHUB_APP_ID`
3. Scroll down to **Private keys** → click **Generate a private key**
4. A `.pem` file will download
5. Base64-encode it:

```bash
# macOS/Linux
cat ~/Downloads/your-app-name.YYYY-MM-DD.private-key.pem | base64 | tr -d '\n'
```

6. Save the output as `GITHUB_APP_PRIVATE_KEY`

### Install the App

1. From the app settings page, click **Install App** in the left sidebar
2. Install on your **Staxed** account — grant access to **All repositories** (or select specific ones)
3. If you have access to the **AeonForge-io** org, install there too

---

## 5. Discord App — Bot & Slash Commands

### Create the App

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**
3. Name: `ActivityOS`
4. Go to **General Information:**
   - Copy **Application ID** → save as `DISCORD_APP_ID`
   - Copy **Public Key** → save as `DISCORD_PUBLIC_KEY`
   - Set **Interactions Endpoint URL** to: `https://staxed.dev/api/discord/interactions`
     - **Note:** Discord will ping this URL to verify it. The endpoint must be deployed first. You can set this after the first deploy, or temporarily leave it blank.

5. Go to **Bot** in the left sidebar:
   - Click **Reset Token** to generate a new bot token
   - Copy the token → save as `DISCORD_BOT_TOKEN`

### Get the Channel ID

1. In Discord, enable **Developer Mode** (Settings → Advanced → Developer Mode)
2. Right-click the channel where you want activity posts to appear
3. Click **Copy Channel ID** → save as `DISCORD_CHANNEL_ID`

### Register Slash Commands

After deploying (or with env vars set locally):

```bash
DISCORD_APP_ID=your_app_id DISCORD_BOT_TOKEN=your_token npx tsx scripts/register-discord-commands.ts
```

You should see:
```
Registered 4 commands:
  /log — Log a manual activity
  /habit — Track a habit
  /stats — View activity stats
  /activity — GitHub activity commands
    /activity stats — View detailed activity stats with breakdown
    /activity streak — View current and longest coding streak
    /activity repos — View per-repo activity breakdown
    /activity insights — View time-of-day and day-of-week patterns
    /activity badges — View earned achievements
```

### Add Bot to Your Server

1. Go to **OAuth2** → **URL Generator** in the Discord developer portal
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
4. Copy the generated URL, open it, and select your server

---

## 6. Cron — Scheduled Summaries

Generate a secret for the cron endpoint:

```bash
openssl rand -hex 20
```

Save the output as `CRON_SECRET`.

Set up a daily cron job (using cron-job.org, Upstash QStash, or GitHub Actions) to hit:

```
POST https://staxed.dev/api/cron/summaries
Header: x-cron-secret: YOUR_CRON_SECRET
```

**Schedule:** Daily at 09:00 ET (13:00 UTC)

This will automatically send:
- **Daily summary** — every day (for the previous day)
- **Weekly summary** — every Monday (for the previous week)
- **Monthly summary** — on the 1st of each month (for the previous month)

### GitHub Polling Cron

Set up a second cron job to poll GitHub for events every 30-60 minutes:

```
POST https://staxed.dev/api/cron/poll-github
Header: x-cron-secret: YOUR_CRON_SECRET
```

This is a complement to webhooks — it catches events that webhooks may miss and enables:
- **Event grouping** — batches events from each polling run into a single Discord message
- **Unposted event recovery** — finds events that were stored but not posted to Discord

### GitHub Actions Example

Create `.github/workflows/daily-summary.yml`:

```yaml
name: Daily Summary
on:
  schedule:
    - cron: '0 13 * * *'  # 09:00 ET (13:00 UTC)
  workflow_dispatch:       # Allow manual trigger

jobs:
  summary:
    runs-on: ubuntu-latest
    steps:
      - name: Send summary
        run: |
          curl -sf -X POST https://staxed.dev/api/cron/summaries \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

Create `.github/workflows/poll-github.yml`:

```yaml
name: Poll GitHub
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:

jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - name: Poll GitHub events
        run: |
          curl -sf -X POST https://staxed.dev/api/cron/poll-github \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

---

## 7. Environment Variables

Create `.env.local` in the project root with all values:

```env
# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Supabase (new)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth
NEXT_PUBLIC_REOWN_PROJECT_ID=your_reown_project_id
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=https://staxed.dev
ADMIN_WALLET_ADDRESS=0x189e78Ed23EdBDDD2E2B302c1B9111465fB87795

# GitHub App
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY=LS0tLS1CRUdJTi...  (base64-encoded PEM, no newlines)
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Discord
DISCORD_APP_ID=your_discord_app_id
DISCORD_PUBLIC_KEY=your_discord_public_key
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_channel_id

# Cron
CRON_SECRET=your_cron_secret
```

### Cloudflare Environment Variables

For production on Cloudflare, set these as secrets:

```bash
# Set each secret (you'll be prompted to paste the value)
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put NEXTAUTH_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put DISCORD_APP_ID
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_CHANNEL_ID
npx wrangler secret put CRON_SECRET
```

For non-secret public vars, add them to `wrangler.jsonc` under `vars`:

```jsonc
{
  // ...existing config
  "vars": {
    "NEXT_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "eyJ...",
    "NEXT_PUBLIC_REOWN_PROJECT_ID": "your_reown_project_id",
    "NEXTAUTH_URL": "https://staxed.dev",
    "ADMIN_WALLET_ADDRESS": "0x189e78Ed23EdBDDD2E2B302c1B9111465fB87795"
  }
}
```

---

## 8. Local Development

```bash
# Install dependencies (already done)
npm install

# Start dev server
npm run dev
```

Visit:
- `http://localhost:3000/activity` — Public dashboard (will be empty until data flows in)
- `http://localhost:3000/activity/admin` — Admin panel (requires wallet connection)
  - `/activity/admin/activities` — View/manage activity events
  - `/activity/admin/habits` — Manage habits
  - `/activity/admin/goals` — Manage goals
  - `/activity/admin/quotes` — Manage programming quotes
  - `/activity/admin/backfill` — Backfill historical data from GitHub

### Testing Without Wallet Auth

The middleware redirects non-admin wallets to `/activity`. To test admin pages locally, you need:
1. MetaMask or another wallet with the admin address (`0x189e...`)
2. Connect via the wallet button in the admin nav

---

## 9. Deploy

```bash
# Build & deploy to Cloudflare
npm run deploy
```

---

## 10. Post-Deploy Checklist

Do these in order after the first deploy:

### A. Verify Discord Interactions Endpoint
1. Go to your Discord app settings → **General Information**
2. Set **Interactions Endpoint URL** to `https://staxed.dev/api/discord/interactions`
3. Discord will send a PING — if it shows a green checkmark, you're good

### B. Register Discord Commands
```bash
DISCORD_APP_ID=your_id DISCORD_BOT_TOKEN=your_token npx tsx scripts/register-discord-commands.ts
```

### C. Test GitHub Webhook
1. Go to your GitHub App settings → **Advanced** → **Recent Deliveries**
2. You should see a `ping` event. If the response is 200, webhooks are working
3. Make a commit to any repo the app is installed on
4. Check Supabase: `github_deliveries` should have a new row, `activity_events` should have a commit

### D. Verify Proactive Discord Posting
1. Push a commit to any repo where the GitHub App is installed
2. Within seconds, a rich embed should appear in your configured Discord channel
3. The embed should show commit details with clickable links (for public repos) or `[Private Repo]` labels

### E. Test Deduplication
1. Go to your GitHub App settings → **Advanced** → **Recent Deliveries**
2. Re-deliver a webhook that was already processed
3. Verify: no duplicate Discord post appears, no duplicate events in `activity_events`

### F. Backfill Historical Data
1. Visit `https://staxed.dev/activity/admin/backfill`
2. Click **Discover Repos** — your personal and org repos will appear
3. Click **Backfill All Commits** to import the last 6 months of commits
4. Click **Backfill PRs** to import PRs
5. Visit `/activity` — your timeline should now be populated

### G. Create Your First Habit
1. Visit `https://staxed.dev/activity/admin/habits`
2. Click **+ New Habit**
3. Example: Name="Daily Coding", Rule=Daily, Target=1, Unit=count, Filter Kind=commit_pushed
4. This will track your coding streak automatically

### H. Test Discord Commands
In your Discord server where the bot was added:
```
/log category:reading value:30 unit:minutes note:Finished chapter 5
/stats period:week
/habit done name:Daily Coding
/activity stats timeframe:week
/activity streak
/activity repos timeframe:month
/activity insights
/activity badges
```

### I. Test Scheduled Summaries
```bash
curl -X POST https://staxed.dev/api/cron/summaries \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

Verify a daily summary embed appears in your Discord channel. If it's a Monday, you'll also get a weekly summary. If it's the 1st, a monthly summary.

### J. Test Achievements
Push 12+ commits in a single day to trigger the "Daily Dozen" achievement. An achievement embed should post to Discord automatically.

### K. Test GitHub Polling
```bash
curl -X POST https://staxed.dev/api/cron/poll-github \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

Verify: recent GitHub events appear in `activity_events` and get posted as a grouped batch to Discord. Any previously unposted events will also be recovered.

### L. Manage Quotes
1. Visit `https://staxed.dev/activity/admin/quotes`
2. The 015 migration seeds 118 quotes — you can add, edit, disable, or delete quotes
3. Quotes appear as footer text on activity summary embeds and daily/weekly/monthly summaries
4. To import quotes from the old activity-bot database, see "Migrate Quotes from Activity-Bot" in section 1

---

## 11. Ongoing Operations

### Reconciliation (Catch Missed Webhooks)

If you suspect missed events, hit the reconcile endpoint:

```bash
curl -X POST https://staxed.dev/api/admin/reconcile \
  -H "Cookie: your-session-cookie"
```

Or add a cron job / scheduled trigger to call it periodically. The reconciliation checks the last 7 days against the GitHub API and fills any gaps without creating duplicates.

### Updating Discord Commands

If you modify `lib/discord/commands.ts`, re-register:

```bash
DISCORD_APP_ID=your_id DISCORD_BOT_TOKEN=your_token npx tsx scripts/register-discord-commands.ts
```

### Event Filtering

Event type posting to Discord is controlled in `lib/constants.ts` via `EVENT_FILTERS`. All events are always stored in the database regardless of filter settings — filters only control which types get posted to Discord.

To disable posting for a specific event type, set the corresponding filter to `false`:
```typescript
// Example: stop posting star events to Discord
EVENT_FILTERS.POST_STARS = false;
```

Additional filters available:
- `PR_ACTION_FILTER` — which PR actions to process (`opened`, `closed`, `merged`)
- `ISSUE_ACTION_FILTER` — which issue actions to process (`opened`, `closed`)
- `REVIEW_STATE_FILTER` — which review states to process (`approved`, `changes_requested`)
- `BRANCH_IGNORE_PATTERNS` — branch name prefixes to ignore (`dependabot/`, `renovate/`)

---

## Architecture Quick Reference

```
Public Visitor → /activity (server-rendered, no auth)
                  ↓
              Supabase (activity_events, habits, goals, achievements, quotes)
                  ↑
GitHub Webhooks → /api/github/webhook → normalize → upsert → Discord post + achievements
GitHub Polling  → /api/cron/poll-github → Events API → normalize → upsert → grouped Discord post + recovery
Discord Bot     → /api/discord/interactions → handle → upsert/respond with embeds
Admin (SIWE)    → /activity/admin/* → /api/admin/* → upsert
Cron            → /api/cron/summaries → daily/weekly/monthly embeds (with quotes) → Discord

Backfill: Admin → /api/admin/backfill → GitHub API → upsert
Reconcile: Admin → /api/admin/reconcile → GitHub API → upsert (gap-fill)
```

### Supported GitHub Event Types (16)

| Webhook Event | Kinds Produced |
|---|---|
| push | `commit_pushed` |
| pull_request | `pr_opened`, `pr_closed`, `pr_merged` |
| issues | `issue_opened`, `issue_closed` |
| release | `release_published` |
| pull_request_review | `review_submitted` |
| create | `branch_created`, `tag_created` |
| delete | `branch_deleted`, `tag_deleted` |
| fork | `repo_forked` |
| watch | `repo_starred` |
| issue_comment | `issue_comment_created` |
| pull_request_review_comment | `pr_comment_created` |
| commit_comment | `commit_comment_created` |
| member | `member_added`, `member_removed` |
| gollum | `wiki_updated` |
| public | `repo_made_public` |
| discussion | `discussion_created`, `discussion_answered` |

### Discord Commands (8)

| Command | Description |
|---|---|
| `/log` | Log a manual activity |
| `/habit done` | Mark a habit as done |
| `/stats` | View period stats (plain text) |
| `/activity stats` | Detailed stats with rich embed |
| `/activity streak` | Daily, weekly, monthly, yearly + longest streak |
| `/activity repos` | Per-repo activity breakdown |
| `/activity insights` | Time-of-day and day-of-week patterns |
| `/activity badges` | List earned achievements |

### Achievements (30)

**Repeatable — Daily:**
- Night Owl, Early Bird, Daily Dozen, Weekend Warrior, Streak Keeper, Commit Poet

**Repeatable — Weekly:**
- Weekday Grind (commits Mon-Fri), Productive Week (25+ events)

**Repeatable — Monthly:**
- Century Month (100+ events), PR Machine (10+ PRs), Consistency King (20+ active days)

**Milestone — Daily Streak:**
- Fire Starter (7d), Lightning Bolt (30d), Diamond (100d), Legendary (365d)

**Milestone — Weekly Streak:**
- Weekly Consistent (4wk), Weekly Quarter (13wk)

**Milestone — Monthly Streak:**
- Monthly Tri (3mo), Monthly Half (6mo), Monthly Annual (12mo)

**Milestone — Totals:**
- Century Club (100), Sharpshooter (500), Rocket Ship (1000)

### Key Design Decisions
- **All writes go through Supabase service role** — no client-side DB access
- **Dedupe keys on every event** — safe to re-run backfills, re-deliver webhooks
- **Discord posting is deduped** — `discord_posts` table prevents double-posting on webhook redelivery
- **Summary posting is deduped** — `summary_posts` table prevents duplicate daily/weekly/monthly summaries
- **Private repos are scrubbed** — no repo names or URLs leak to public views or Discord embeds
- **Streaks computed on-the-fly** — no rollup tables needed at single-user scale
- **All dates in America/New_York** — consistent streak/stat calculations
- **Event filtering is post-storage** — all events stored in DB regardless of Discord posting filters
- **Discord posting is best-effort** — webhook always returns 200 even if Discord API fails
- **Polling complements webhooks** — both sources dedupe via `dedupe_key`, polling catches missed events
- **Unposted event recovery** — `posted_to_discord` column tracks posting status; recovery runs each poll cycle
- **Quotes in embed footers** — random programming quote added to activity and summary embeds
- **Achievement periods** — daily (default), weekly (dedup by week start), monthly (dedup by YYYY-MM), milestone (all-time)
- **Four streak types** — daily (commit-based), weekly/monthly/yearly (any event)
