-- ============================================================
-- 016: discord_repos (Discord digest include list) + line counts on events
-- ============================================================

CREATE TABLE IF NOT EXISTS discord_repos (
  repo_full_name TEXT PRIMARY KEY,
  display_name TEXT,
  included BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS lines_added INTEGER;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS lines_removed INTEGER;
