# ActivityOS (GitHub + Habits/Goals) — MVP + PRD

> **One-line:** A public “life + dev” dashboard that unifies GitHub activity and manual habits/goals into one timeline, streak engine, and stats rollups — with private repo details safely scrubbed for the public view.

---

## MVP (build this first)

### MVP v0.1 — Ship in small slices
**Goal:** Collect *all* GitHub webhook events (raw), normalize a useful subset, and ship a public dashboard + admin tools.

#### 1) Data foundation (Supabase)
- Create tables (see **Data Model** below):
  - `github_deliveries` (raw webhook capture; store everything)
  - `activity_events` (normalized timeline used for streaks/goals/stats)
  - `habits`, `goals`
  - `admin_settings`, `tracked_repos`
  - `sync_runs`, `sync_state` (for backfill + reconciliation)
- Create `public_activity_events` as either:
  - a view over `activity_events` filtered/scrubbed, or
  - a separate table written by a “sanitizer” step (safer, more explicit).

#### 2) GitHub webhook ingestion (Cloudflare Worker)
- One endpoint: `POST /api/github/webhook`
- Responsibilities:
  - Verify signature
  - Idempotent insert into `github_deliveries`
  - Enqueue/trigger processing to normalize into `activity_events`
  - Return quickly (no heavy work in the webhook request)

**Normalization subset for v0.1 (minimum useful):**
- Commits (from `push`): create `activity_events.kind = commit_pushed`
- Pull requests (from `pull_request`): `pr_opened`, `pr_closed`, `pr_merged`
- Issues (from `issues`): `issue_opened`, `issue_closed`
- Releases (from `release`): `release_published`
- (Optional) `workflow_run`: `ci_run_*` for visual-only stats

Everything else:
- stored raw in `github_deliveries` (searchable later)
- not necessarily shown yet

#### 3) Manual logging (admin UI + Discord slash commands)
- Admin UI page (web):
  - Add/edit/delete manual entries (`activity_events.source = manual`)
  - CRUD habits/goals
- Discord slash commands:
  - `/log category:<reading> value:<30> unit:<minutes> note:<...>`
  - `/habit done name:<Meditation> value:<optional>`
  - `/stats period:<week|month|year>`
- For MVP, commands can call a single Worker endpoint that writes to Supabase.

#### 4) Streaks + goals (MVP rules)
Support these rule types:
- **Daily target** (e.g., “Read 30 minutes per day”)
- **Weekly target** (e.g., “Workout 3 times per week”)
- **Rolling window** (“X times every Y days”; e.g., “2 workouts every 7 days”)

**Coding day definition (your requirement):**
- A day counts as “coding” **only if you have ≥1 commit event** on that day.

#### 5) Public dashboard page (read-only)
Public page (no login required):
- Timeline (last 30–90 days)
- Streaks (coding + selected habits)
- Period stats (daily/weekly/monthly quick summaries)

Admin pages (wallet-gated):
- Manage habits/goals
- Manage visibility defaults
- Run backfill + reconciliation
- Reprocess events (optional)

---

## PRD

### 1) Overview
You want a single application that:
- Captures **all GitHub activity events** (via webhooks going forward)
- Supports **historical backfill for ~6 months**
- Allows **manual habit/goal tracking** (web + Discord)
- Produces **daily/weekly/monthly/quarterly/yearly stats**
- Publishes a **public dashboard** while safely handling **private repo privacy**

### 2) Users and roles
- **Admin:** You only (wallet-gated by a single address).
- **Public viewers:** anyone on the internet; read-only.

### 3) Goals
- **Complete capture going forward:** store every webhook payload (“collect now, decide later”).
- **Useful, fast dashboard:** streaks + rollups should load quickly.
- **Privacy-by-design:** private repo activity is shown without leaking sensitive repo details.
- **Reliable ingestion:** dedupe, retries, and reconciliation.

### 4) Non-goals (initially)
- Multi-user support
- Passive Discord message monitoring (slash commands only)
- Complex analytics/ML forecasting

### 5) Functional requirements

#### 5.1 GitHub capture (webhooks)
**Must**
- Store every delivery payload in `github_deliveries` with:
  - delivery id
  - event name
  - received timestamp
  - raw JSON payload
  - processing status and errors
- Dedupe webhook redeliveries with unique `(delivery_id)` (idempotency).
- Normalize selected events into `activity_events`.

**Nice**
- Ability to subscribe to all webhook event types (store raw), even if not displayed yet.
- Admin “reprocess deliveries” tool to regenerate `activity_events` from raw.

#### 5.2 Backfill (6 months) + reconciliation
**Backfill (one-time / on-demand)**
- An admin action: “Backfill last 6 months”
- The backfill job should:
  - Discover repos you own/control (personal + your org)
  - Reconstruct *your activity* from GitHub APIs for that time range
  - Insert normalized `activity_events` in an idempotent way
  - Record job progress so it can be resumed

**Reconciliation (ongoing)**
- Nightly job: re-check the last N days (e.g., 7) to catch missed webhook deliveries.
- Same pipelines, same dedupe keys.

> Note: GitHub “Events API” has strict limits and cannot be used to backfill 6 months of “everything.” Backfill must be reconstructed from other endpoints (commits, PRs, issues, comments, etc.).

#### 5.3 Manual activity tracking
**Must**
- Manual entries via Admin UI:
  - Create/update/delete activities
  - Choose category/kind, value/unit, notes, timestamp
  - All manual entries are **public-only** (no private mode).
- Slash commands to create manual entries (and optionally to view stats)

#### 5.4 Habits + goals
**Habit types**
- Daily: 30 minutes/day; 1 time/day
- Weekly: 3x/week
- Rolling window: X per Y days

**Required habit fields**
- Name
- Rule type + parameters (daily/weekly/window_days)
- Target value + unit
- “What counts” filters (category/kind/source)
- Visibility (whether habit is public on the dashboard)

**Goals**
- Similar to habits, but with explicit date ranges and a target (e.g., “Read 20 hours in March”)

#### 5.5 Public dashboard
**Must**
- No auth required.
- Show:
  - activity timeline
  - streaks and “on track” indicators
  - period stats (daily/weekly/monthly/quarterly/yearly)
- Private repo privacy:
  - do not show repo name, repo URL, branch names, file paths
  - show generic “Commit” event + timestamp
  - optional: show commit title if you explicitly allow it

#### 5.6 Admin (wallet-gated)
**Must**
- Single wallet address is “admin.”
- Admin-only routes to:
  - Edit/delete activities
  - CRUD habits/goals
  - Trigger backfill/reconciliation
  - Configure privacy behavior defaults

**Recommended implementation**
- Keep Supabase tables locked down (no client writes).
- Admin UI signs a message (SIWE-style).
- Cloudflare Worker verifies signature and performs writes using Supabase service role.

---

## Architecture

## Configuration (fill later)
- **GitHub username:** `TBD`
- **Primary GitHub org you own:** `TBD`
- **Admin wallet address:** `TBD`
- **Timezone:** `America/New_York`
- **Backfill window:** `6 months`


### Components
- **Cloudflare Pages**: public dashboard + admin UI
- **Cloudflare Workers**:
  - `POST /api/github/webhook` (GitHub → Supabase)
  - `POST /api/discord/interactions` (Discord slash commands → Supabase)
  - `POST /api/admin/*` (wallet-gated admin operations)
- **GitHub integration:** use a **GitHub App** for webhook delivery + API access (preferred over PATs for scoped permissions and long-term maintainability).
- **Background processing**
  - Prefer **Queues or Workflows** to run:
    - webhook normalization
    - long-running backfill (chunked)
    - rollups and reconciliation
- **Supabase (Postgres)**: source-of-truth DB

### Why queues/workflows
- Webhook endpoints should stay fast.
- Backfill across many repos can’t reliably finish in one request.
- Durable job orchestration makes resume/retry/checkpoint easy.

---

## Data model (Supabase)

### `github_deliveries` (raw capture)
Stores every GitHub webhook delivery payload.
- `id` (uuid)
- `delivery_id` (text, unique)
- `event_name` (text)
- `received_at` (timestamptz)
- `payload` (jsonb) — or `payload_storage_key` if you offload to Storage
- `status` (text: `received|processed|failed`)
- `error` (text nullable)
- `processed_at` (timestamptz nullable)

### `activity_events` (normalized timeline)
This is what habits/goals/stats query.
- `id` (uuid)
- `occurred_at` (timestamptz)
- `occurred_on` (date) — derived in America/New_York
- `source` (enum: `github|manual|discord|backfill`)
- `category` (text: `coding|reading|fitness|learning|admin|...`)
- `kind` (text: `commit_pushed|pr_opened|...`)
- `value` (numeric nullable)
- `unit` (text nullable)
- `title` (text nullable) — **scrubbed for private repos**
- `public_summary` (text nullable) — safe line for public feed
- `visibility` (enum: `public|private`)
- `repo_visibility` (enum: `public_repo|private_repo|unknown`)
- `repo_hash` (text nullable) — stable anonymized id for grouping private repos without naming
- `url` (text nullable) — blank for private repos
- `metadata` (jsonb)

**Suggested uniqueness / idempotency**
- `dedupe_key` (text, unique)
  - commit: `commit:{repo_id}:{sha}`
  - PR action: `pr:{pr_id}:{action}:{timestamp}`
  - manual: `manual:{uuid}` (or just use `id`)

### `habits`
- `id` (uuid)
- `name` (text)
- `is_active` (bool)
- `visibility` (`public|private`)
- `rule_type` (`daily|weekly|rolling_window`)
- `target_value` (numeric)
- `target_unit` (text: `count|minutes|pages|...`)
- `window_days` (int nullable) — for rolling_window
- `filters` (jsonb) — e.g. `{ "source": ["github"], "category": ["coding"], "kind": ["commit_pushed"] }`

### `goals`
- `id` (uuid)
- `name`
- `visibility`
- `start_date`, `end_date`
- `target_value`, `target_unit`
- `filters` (jsonb)
- `status` (`active|completed|archived`)

### `tracked_repos`
- `id` (uuid)
- `provider_repo_id` (text)  (GitHub repo id)
- `owner` (text)
- `name` (text)
- `visibility` (`public|private`)
- `is_enabled` (bool)

### `sync_state`
- `id`
- `sync_type` (text: `backfill_commits|backfill_prs|reconcile|...`)
- `scope` (text: repo id / global)
- `cursor` (text/jsonb)
- `last_synced_at` (timestamptz)

### `sync_runs`
- `id`
- `sync_type`
- `started_at`, `finished_at`
- `status` (`running|success|failed|partial`)
- `stats` (jsonb)
- `error` (text)

### Rollups (optional but recommended)
- `rollups_day`, `rollups_week`, `rollups_month`, `rollups_quarter`, `rollups_year`
  - `period_start`, `period_end`
  - `category`, `kind`, `source`
  - `count_events`
  - `sum_value`

---

## GitHub privacy rules (public dashboard)
**Public repo events**
- show repo name + URL (optional)
- show title (commit subject / PR title / issue title)

**Private repo events**
- show generic summaries, e.g.:
  - “Commit pushed (private repo): <subject line>”
  - “PR merged (private repo)”
- do **not** show: repo name, URL, branch, file paths, full SHAs
- **do show:** commit **subject line only** (first line of the commit message), per your requirement

Implementation suggestion:
- Write a “sanitizer” that produces `public_summary` + clears unsafe fields based on repo visibility.

---

## Backfill design (6 months)

### Reality check (important)
You can’t reliably backfill six months of “all events” from the GitHub Events timeline feed because it’s limited and recent-only. The solution is **reconstruction** from source-of-truth endpoints.

### Backfill pipeline (recommended)
Run as a workflow/queue-driven job:

1) **Discover repos**
- Pull repo list from:
  - your personal repos (public + private)
  - your owned org repos (public + private)
  - plus **public external repos you contributed to** (best-effort)
- **Explicitly exclude private external repos** (anything you don’t own/control).

2) **Backfill commits (the “coding day” backbone)**
For each repo, fetch commits since `now - 6 months` where you are **author OR committer**:
- Insert as `activity_events.kind = commit_pushed`
- Dedupe on `commit:{repo_id}:{sha}`

3) **Backfill PRs and issues authored by you**
- Use search to find PRs and issues authored by you within the date window
- For each result, fetch details and map into `activity_events`

4) **Backfill comments (optional in v0.2)**
- Identify issues/PRs where you commented (search or by walking items)
- Fetch comments and insert events for your own comments only

5) **Backfill releases + workflows (optional)**
- Per repo:
  - list releases and record those authored by you
  - list workflow runs and record those where `actor` is you (if you want these)

6) **Finalize**
- Run rollups for the window
- Mark sync run as complete

### Performance controls (and retention)
- **Retention:** keep normalized events forever; keep raw deliveries forever (may offload payload bodies to Supabase Storage to avoid Postgres bloat).
- Chunk by repo, then by “entity type” (commits/prs/issues/comments)
- Store progress in `sync_state`
- Rate-limit and retry
- Resume where you left off

---

## Streaks, goals, and stats logic

### Coding streak
- A day is a “coding day” if `count(activity_events where kind=commit_pushed and occurred_on=day) >= 1`.
- Streak = consecutive coding days ending today (or yesterday depending on local time cutoff).

### Daily habit with minutes
- Completion on day D if `sum(value where unit=minutes and filters match and occurred_on=D) >= target_value`.

### Rolling window “X per Y days”
- For each day D:
  - compute window start = D - (Y-1)
  - completion if `count/sum over [window_start..D] >= target_value`.

### Rollups
- Nightly compute:
  - day rollups for yesterday
  - refresh current week/month/quarter/year aggregates

---

## Admin + auth (wallet-only)
Because you’re the only admin (single wallet address; **TBD** in configuration):
- Don’t rely on client-side DB writes.
- Do **all writes through Worker endpoints**.
- Wallet login pattern:
  1) Admin signs a nonce message
  2) Worker verifies signature and address
  3) Worker issues a short-lived session cookie/token for admin routes

---

## Acceptance criteria (MVP)
- Webhooks:
  - All GitHub deliveries are stored in `github_deliveries` and deduped.
  - Selected event types are normalized into `activity_events`.
- Privacy:
  - Private repo events are visible publicly without leaking repo name/URL.
- Habits:
  - Daily habit completion works and streaks are correct in America/New_York.
- Admin:
  - Wallet-gated admin can create/edit/delete manual activity and habits/goals.
- Backfill:
  - “Backfill last 6 months” can run to completion (or resume) without duplicating events.
- Dashboard:
  - Public page loads fast and shows timeline, streaks, and basic stats.

---

## Decisions locked in (from you)
- **Private repo display:** show **commit subject line only** on the public dashboard (no repo name/URL/branch/paths/SHAs).
- **Backfill scope:** past **6 months** across:
  - **All repos in your personal account** (public + private)
  - **All repos in your owned org** (public + private)
  - **Public external repos you contributed to** (best-effort discovery)
  - **Exclude private external repos** (anything not in your personal/org).
- **Commit attribution:** count commits where you are **author OR committer**.
- **Bot/noise handling:** include activity that is attributed to you (even if assisted). **Exclude** purely bot-authored actions (e.g., a bot review on your PR) unless you are the actor.
- **Retention:** keep **all normalized data forever**; keep **raw webhook deliveries forever** (DB or object storage) to enable reprocessing later.

