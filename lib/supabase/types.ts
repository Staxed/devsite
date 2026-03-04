export interface GitHubDelivery {
  id: number;
  delivery_id: string;
  event_name: string;
  payload: Record<string, unknown>;
  status: "pending" | "processed" | "skipped" | "error";
  error: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface ActivityEvent {
  id: number;
  occurred_at: string;
  occurred_on: string;
  source: "github" | "manual" | "discord";
  category: string;
  kind: string;
  value: number;
  unit: string;
  title: string | null;
  public_summary: string | null;
  visibility: "public" | "private";
  repo_visibility: "public" | "private" | null;
  repo_hash: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  dedupe_key: string | null;
  created_at: string;
}

export interface Habit {
  id: number;
  name: string;
  is_active: boolean;
  visibility: "public" | "private";
  rule_type: "daily" | "weekly" | "rolling";
  target_value: number;
  target_unit: string;
  window_days: number | null;
  filters: HabitFilters;
  created_at: string;
  updated_at: string;
}

export interface HabitFilters {
  source?: string;
  category?: string;
  kind?: string;
}

export interface Goal {
  id: number;
  name: string;
  visibility: "public" | "private";
  start_date: string;
  end_date: string;
  target_value: number;
  target_unit: string;
  filters: HabitFilters;
  status: "active" | "completed" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface TrackedRepo {
  id: number;
  provider_repo_id: string;
  owner: string;
  name: string;
  visibility: "public" | "private";
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncState {
  id: number;
  sync_type: string;
  scope: string;
  cursor: Record<string, unknown>;
  last_synced_at: string | null;
}

export interface SyncRun {
  id: number;
  sync_type: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  stats: Record<string, unknown>;
  error: string | null;
}

export interface Achievement {
  id: number;
  achievement_id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  earned_at: string;
  period: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DiscordPost {
  id: number;
  delivery_id: string;
  channel_id: string;
  message_id: string | null;
  events_count: number;
  posted_at: string;
}

export interface SummaryPost {
  id: number;
  summary_type: "daily" | "weekly" | "monthly";
  period: string;
  channel_id: string;
  message_id: string | null;
  events_count: number;
  posted_at: string;
}
