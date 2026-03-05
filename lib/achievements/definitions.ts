export interface AchievementDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  type: "milestone" | "repeatable";
  evaluate: (context: AchievementContext) => boolean;
}

export interface AchievementContext {
  /** Events for the current day */
  todayEvents: { kind: string; occurred_at: string }[];
  /** Current coding streak in days */
  currentStreak: number;
  /** All-time total event count */
  totalEvents: number;
  /** Hour of latest event (0-23) in user timezone */
  latestEventHour: number | null;
  /** Day of week of latest event (0=Sun, 6=Sat) */
  latestEventDay: number | null;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // --- Repeatable achievements ---
  {
    id: "night_owl",
    name: "Night Owl",
    emoji: "\u{1F989}",
    description: "Coded between midnight and 5 AM",
    type: "repeatable",
    evaluate: (ctx) =>
      ctx.latestEventHour !== null && ctx.latestEventHour >= 0 && ctx.latestEventHour < 5,
  },
  {
    id: "early_bird",
    name: "Early Bird",
    emoji: "\u{1F426}",
    description: "Coded between 5 AM and 7 AM",
    type: "repeatable",
    evaluate: (ctx) =>
      ctx.latestEventHour !== null && ctx.latestEventHour >= 5 && ctx.latestEventHour < 7,
  },
  {
    id: "daily_dozen",
    name: "Daily Dozen",
    emoji: "\u{1F525}",
    description: "12 or more events in a single day",
    type: "repeatable",
    evaluate: (ctx) => ctx.todayEvents.length >= 12,
  },
  {
    id: "weekend_warrior",
    name: "Weekend Warrior",
    emoji: "\u2694\uFE0F",
    description: "Coded on a weekend",
    type: "repeatable",
    evaluate: (ctx) =>
      ctx.latestEventDay !== null && (ctx.latestEventDay === 0 || ctx.latestEventDay === 6),
  },
  {
    id: "century_month",
    name: "Century Month",
    emoji: "\u{1F4AF}",
    description: "100+ events in a calendar month",
    type: "repeatable",
    // Evaluated separately in engine via monthly count
    evaluate: () => false,
  },

  // --- Milestone: streak-based ---
  {
    id: "fire_starter",
    name: "Fire Starter",
    emoji: "\u{1F525}",
    description: "7-day coding streak",
    type: "milestone",
    evaluate: (ctx) => ctx.currentStreak >= 7,
  },
  {
    id: "lightning_bolt",
    name: "Lightning Bolt",
    emoji: "\u26A1",
    description: "30-day coding streak",
    type: "milestone",
    evaluate: (ctx) => ctx.currentStreak >= 30,
  },
  {
    id: "diamond",
    name: "Diamond",
    emoji: "\u{1F48E}",
    description: "100-day coding streak",
    type: "milestone",
    evaluate: (ctx) => ctx.currentStreak >= 100,
  },
  {
    id: "legendary",
    name: "Legendary",
    emoji: "\u{1F3C6}",
    description: "365-day coding streak",
    type: "milestone",
    evaluate: (ctx) => ctx.currentStreak >= 365,
  },

  // --- Milestone: total-based ---
  {
    id: "century_club",
    name: "Century Club",
    emoji: "\u{1F4AF}",
    description: "100 total events",
    type: "milestone",
    evaluate: (ctx) => ctx.totalEvents >= 100,
  },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    emoji: "\u{1F3AF}",
    description: "500 total events",
    type: "milestone",
    evaluate: (ctx) => ctx.totalEvents >= 500,
  },
  {
    id: "rocket_ship",
    name: "Rocket Ship",
    emoji: "\u{1F680}",
    description: "1000 total events",
    type: "milestone",
    evaluate: (ctx) => ctx.totalEvents >= 1000,
  },
];
