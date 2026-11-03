-- ActivityOS fix (idempotent): creates whatever of migrations 013-015 is missing and seeds the settings.
-- Run in the Supabase SQL editor after activityos-check.sql. Safe to re-run: every statement is
-- IF NOT EXISTS or an upsert. Unlike migration 015 it does not mark existing events as posted and
-- does not seed quotes.

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

-- posted_to_discord is the only 015 column that may be absent on an older activity_events table.
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

-- Settings
INSERT INTO app_settings (key, value) VALUES
  ('github_username', 'Staxed'),
  ('github_org', 'AeonForge-io'),
  ('timezone', 'America/New_York')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Empty on first run only, so a re-run keeps an exclude list edited later.
INSERT INTO app_settings (key, value) VALUES ('excluded_repos', '')
ON CONFLICT (key) DO NOTHING;
