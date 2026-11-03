-- ActivityOS fix (idempotent): creates whatever of migrations 013-015 is missing and seeds the settings.
-- Run in the Supabase SQL editor after activityos-check.sql. Safe to re-run: every statement is
-- IF NOT EXISTS or an upsert. Like migration 015 it marks existing events as posted, but only when it
-- adds posted_to_discord. It does not seed quotes.

-- 013
CREATE TABLE IF NOT EXISTS github_deliveries (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id   TEXT NOT NULL UNIQUE,
  event_name    TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processed', 'skipped', 'error')),
  error         TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS activity_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurred_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  source          TEXT NOT NULL DEFAULT 'github'
                    CHECK (source IN ('github', 'manual', 'discord')),
  category        TEXT NOT NULL,
  kind            TEXT NOT NULL,
  value           NUMERIC DEFAULT 1,
  unit            TEXT DEFAULT 'count',
  title           TEXT,
  public_summary  TEXT,
  visibility      TEXT NOT NULL DEFAULT 'public'
                    CHECK (visibility IN ('public', 'private')),
  repo_visibility TEXT CHECK (repo_visibility IN ('public', 'private')),
  repo_hash       TEXT,
  url             TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  dedupe_key      TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habits (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  visibility    TEXT NOT NULL DEFAULT 'public'
                  CHECK (visibility IN ('public', 'private')),
  rule_type     TEXT NOT NULL DEFAULT 'daily'
                  CHECK (rule_type IN ('daily', 'weekly', 'rolling')),
  target_value  NUMERIC NOT NULL DEFAULT 1,
  target_unit   TEXT NOT NULL DEFAULT 'count',
  window_days   INTEGER DEFAULT 7,
  filters       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  visibility    TEXT NOT NULL DEFAULT 'public'
                  CHECK (visibility IN ('public', 'private')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  target_value  NUMERIC NOT NULL,
  target_unit   TEXT NOT NULL DEFAULT 'count',
  filters       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracked_repos (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_repo_id  TEXT NOT NULL UNIQUE,
  owner             TEXT NOT NULL,
  name              TEXT NOT NULL,
  visibility        TEXT NOT NULL DEFAULT 'public'
                      CHECK (visibility IN ('public', 'private')),
  is_enabled        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_state (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_type       TEXT NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'global',
  cursor          JSONB NOT NULL DEFAULT '{}',
  last_synced_at  TIMESTAMPTZ,
  UNIQUE (sync_type, scope)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_type    TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  stats        JSONB NOT NULL DEFAULT '{}',
  error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_events_occurred_on ON activity_events (occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_kind ON activity_events (kind);
CREATE INDEX IF NOT EXISTS idx_activity_events_source ON activity_events (source);

-- 014
CREATE TABLE IF NOT EXISTS achievements (
  id BIGSERIAL PRIMARY KEY,
  achievement_id TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  description TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (achievement_id, period)
);

CREATE TABLE IF NOT EXISTS discord_posts (
  id BIGSERIAL PRIMARY KEY,
  delivery_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  events_count INTEGER NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS summary_posts (
  id BIGSERIAL PRIMARY KEY,
  summary_type TEXT NOT NULL,
  period TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  events_count INTEGER NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (summary_type, period)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_achievements_achievement_id ON achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_discord_posts_delivery_id ON discord_posts(delivery_id);
CREATE INDEX IF NOT EXISTS idx_summary_posts_type_period ON summary_posts(summary_type, period);

-- 015
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  author TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_is_active ON quotes (is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_text_unique ON quotes (text);

-- Columns: add any column missing from a table that already existed (type and default only;
-- constraints come with CREATE TABLE above).
ALTER TABLE github_deliveries ADD COLUMN IF NOT EXISTS delivery_id TEXT;
ALTER TABLE github_deliveries ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE github_deliveries ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';
ALTER TABLE github_deliveries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE github_deliveries ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE github_deliveries ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE github_deliveries ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS occurred_on DATE DEFAULT CURRENT_DATE;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'github';
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS value NUMERIC DEFAULT 1;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'count';
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS public_summary TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS repo_visibility TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS repo_hash TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE habits ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS rule_type TEXT DEFAULT 'daily';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS target_value NUMERIC DEFAULT 1;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS target_unit TEXT DEFAULT 'count';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS window_days INTEGER DEFAULT 7;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS filters JSONB DEFAULT '{}';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE habits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE goals ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_value NUMERIC;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_unit TEXT DEFAULT 'count';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS filters JSONB DEFAULT '{}';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE tracked_repos ADD COLUMN IF NOT EXISTS provider_repo_id TEXT;
ALTER TABLE tracked_repos ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE tracked_repos ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE tracked_repos ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE tracked_repos ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true;
ALTER TABLE tracked_repos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE tracked_repos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS sync_type TEXT;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'global';
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS cursor JSONB DEFAULT '{}';
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS sync_type TEXT;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running';
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}';
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS achievement_id TEXT;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS emoji TEXT;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS earned_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE discord_posts ADD COLUMN IF NOT EXISTS delivery_id TEXT;
ALTER TABLE discord_posts ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE discord_posts ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE discord_posts ADD COLUMN IF NOT EXISTS events_count INTEGER DEFAULT 0;
ALTER TABLE discord_posts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE summary_posts ADD COLUMN IF NOT EXISTS summary_type TEXT;
ALTER TABLE summary_posts ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE summary_posts ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE summary_posts ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE summary_posts ADD COLUMN IF NOT EXISTS events_count INTEGER DEFAULT 0;
ALTER TABLE summary_posts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_dedupe_key_unique ON activity_events (dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_achievements_id_period_unique ON achievements (achievement_id, period);
CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_posts_type_period_unique ON summary_posts (summary_type, period);

-- posted_to_discord: when this column is newly added, existing events are marked posted.
-- Existing rows are marked posted so the first poll does not repost them (as 015 does).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_events' AND column_name = 'posted_to_discord'
  ) THEN
    ALTER TABLE activity_events ADD COLUMN posted_to_discord BOOLEAN DEFAULT FALSE;
    UPDATE activity_events SET posted_to_discord = TRUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_events_unposted
  ON activity_events (posted_to_discord) WHERE posted_to_discord = FALSE;

-- Settings (only missing rows are inserted, so values edited later in the admin page are kept)
INSERT INTO app_settings (key, value) VALUES
  ('github_username', 'Staxed'),
  ('github_org', 'AeonForge-io'),
  ('timezone', 'America/New_York')
ON CONFLICT (key) DO NOTHING;

-- Empty on first run only, so a re-run keeps an exclude list edited later.
INSERT INTO app_settings (key, value) VALUES ('excluded_repos', '')
ON CONFLICT (key) DO NOTHING;
