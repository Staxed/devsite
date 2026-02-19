/**
 * Period boundary helpers for leaderboard time filters.
 * All return ISO 8601 strings in UTC.
 */

export function getWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  // Monday = 1, so shift: if Sunday (0) treat as 7
  const diff = (day === 0 ? 6 : day - 1);
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return monday.toISOString();
}

export function getMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function getQuarterStart(): string {
  const now = new Date();
  const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1)).toISOString();
}

export function getYearStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}
