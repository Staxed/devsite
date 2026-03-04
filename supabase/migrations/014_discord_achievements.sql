-- Achievements earned by the user
CREATE TABLE IF NOT EXISTS achievements (
  id BIGSERIAL PRIMARY KEY,
  achievement_id TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  description TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period TEXT,  -- e.g. '2024-01', '2024-W03', '2024-01-15' for context
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (achievement_id, period)
);

-- Tracks which webhook deliveries have been posted to Discord (dedup)
CREATE TABLE IF NOT EXISTS discord_posts (
  id BIGSERIAL PRIMARY KEY,
  delivery_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  events_count INTEGER NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks which scheduled summaries have been sent (dedup)
CREATE TABLE IF NOT EXISTS summary_posts (
  id BIGSERIAL PRIMARY KEY,
  summary_type TEXT NOT NULL,  -- 'daily', 'weekly', 'monthly'
  period TEXT NOT NULL,        -- e.g. '2024-01-15', '2024-W03', '2024-01'
  channel_id TEXT NOT NULL,
  message_id TEXT,
  events_count INTEGER NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (summary_type, period)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_achievements_achievement_id ON achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_discord_posts_delivery_id ON discord_posts(delivery_id);
CREATE INDEX IF NOT EXISTS idx_summary_posts_type_period ON summary_posts(summary_type, period);
