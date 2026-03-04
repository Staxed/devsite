import { createAdminClient } from "@/lib/supabase/server";

export interface AppSettings {
  github_username: string;
  github_org: string;
  timezone: string;
}

const DEFAULTS: AppSettings = {
  github_username: "",
  github_org: "",
  timezone: "America/New_York",
};

let cached: AppSettings | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load app settings from the database with a 1-minute in-memory cache.
 * Serverless: cache lives for the duration of the worker invocation
 * (typically one request), so the TTL mostly helps within long-running
 * local dev servers.
 */
export async function getSettings(): Promise<AppSettings> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("app_settings").select("key, value");

  if (error || !data) {
    // If DB is unreachable, return cached or defaults
    return cached || DEFAULTS;
  }

  const settings = { ...DEFAULTS };
  for (const row of data) {
    if (row.key in settings) {
      (settings as Record<string, string>)[row.key] = row.value;
    }
  }

  cached = settings;
  cachedAt = Date.now();
  return settings;
}

/** Bust the in-memory cache (call after updating settings). */
export function invalidateSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}
