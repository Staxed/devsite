import { createAdminClient } from "@/lib/supabase/server";

export interface AppSettings {
  github_username: string;
  github_org: string;
  timezone: string;
}

let cached: AppSettings | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load app settings from the database with a 1-minute in-memory cache.
 * Throws if required settings (github_username, timezone) are not configured.
 */
export async function getSettings(): Promise<AppSettings> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("app_settings").select("key, value");

  if (error || !data) {
    if (cached) return cached;
    throw new Error("Failed to load app settings from database.");
  }

  const map: Record<string, string> = {};
  for (const row of data) {
    map[row.key] = row.value;
  }

  if (!map.github_username) {
    throw new Error('Missing required setting: "github_username". Configure it in admin settings.');
  }
  if (!map.timezone) {
    throw new Error('Missing required setting: "timezone". Configure it in admin settings.');
  }

  const settings: AppSettings = {
    github_username: map.github_username,
    github_org: map.github_org || "",
    timezone: map.timezone,
  };

  cached = settings;
  cachedAt = Date.now();
  return settings;
}

/** Bust the in-memory cache (call after updating settings). */
export function invalidateSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}
