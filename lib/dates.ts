/**
 * Shared date/timezone utilities.
 */

export function todayInTimezone(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

export function yesterdayInTimezone(tz: string): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

export function toDateInTimezone(isoDate: string, tz: string): string {
  return new Date(isoDate).toLocaleDateString("en-CA", { timeZone: tz });
}

export function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export function getWeekStartFromDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export function getWeekStartFromTimezone(tz: string): string {
  const d = new Date();
  const tzDate = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const day = tzDate.getDay();
  tzDate.setDate(tzDate.getDate() - (day === 0 ? 6 : day - 1));
  return tzDate.toISOString().split("T")[0];
}

export function getMonthStartFromTimezone(tz: string): string {
  const d = new Date();
  const tzDate = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  return `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getYearStartFromTimezone(tz: string): string {
  const d = new Date();
  const tzDate = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  return `${tzDate.getFullYear()}-01-01`;
}
