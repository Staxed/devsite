export type CronCall = "poll" | "digest" | "summaries";

const NEW_YORK_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/**
 * Which endpoints a cron tick must call. Cron triggers are UTC-only, so the
 * digest and the 09:00 New York summaries run on the ticks that land in the first half of
 * the hour (and, for summaries, in 09:00-09:29 local time), which stays correct across
 * daylight-saving changes. Each digest runs after the poll that stored what it posts.
 */
export function decideTick(now: Date, cronEnabled: string | undefined): CronCall[] {
  if (cronEnabled !== "true") return [];
  const parts = NEW_YORK_TIME.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`Could not read New York time from ${now.toISOString()}`);
  }
  if (minute >= 30) return ["poll"];
  return hour === 9 ? ["poll", "digest", "summaries"] : ["poll", "digest"];
}
