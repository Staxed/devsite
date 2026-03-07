-- ActivityOS Schema
-- Tables for GitHub activity tracking, habits, goals, and sync state

-- ============================================
-- github_deliveries: Raw webhook payloads
-- ============================================
CREATE TABLE github_deliveries (
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

-- ============================================
-- activity_events: Normalized activity records
-- ============================================
CREATE TABLE activity_events (
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

CREATE INDEX idx_activity_events_occurred_on ON activity_events (occurred_on DESC);
CREATE INDEX idx_activity_events_kind ON activity_events (kind);
CREATE INDEX idx_activity_events_source ON activity_events (source);

-- ============================================
-- habits: Recurring activity targets
-- ============================================
CREATE TABLE habits (
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

-- ============================================
-- goals: Time-bounded targets
-- ============================================
CREATE TABLE goals (
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

-- ============================================
-- tracked_repos: Known repositories
-- ============================================
CREATE TABLE tracked_repos (
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

-- ============================================
-- sync_state: Cursor tracking for resumable sync
-- ============================================
CREATE TABLE sync_state (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_type       TEXT NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'global',
  cursor          JSONB NOT NULL DEFAULT '{}',
  last_synced_at  TIMESTAMPTZ,
  UNIQUE (sync_type, scope)
);

-- ============================================
-- sync_runs: Audit trail for sync operations
-- ============================================
CREATE TABLE sync_runs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_type    TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  stats        JSONB NOT NULL DEFAULT '{}',
  error        TEXT
);
