export type CronCall = "poll" | "summaries";

const NEW_YORK_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/**
 * Which endpoints a cron tick must call. Cron triggers are UTC-only, so the
 * 09:00 New York summary is the tick that lands in 09:00-09:29 local time,
 * which stays correct across daylight-saving changes.
 */
export function decideTick(now: Date, cronEnabled: string | undefined): CronCall[] {
  if (cronEnabled !== "true") return [];
  const parts = NEW_YORK_TIME.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`Could not read New York time from ${now.toISOString()}`);
  }
  return hour === 9 && minute < 30 ? ["poll", "summaries"] : ["poll"];
}
