export interface AchievementDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  type: "milestone" | "repeatable";
  /** Period type for repeatable achievements: daily (default), weekly, or monthly */
  period?: "daily" | "weekly" | "monthly";
  evaluate: (context: AchievementContext) => boolean;
}

export interface AchievementContext {
  /** Events for the current day */
  todayEvents: { kind: string; occurred_at: string }[];
  /** Current coding streak in days */
  currentStreak: number;
  /** All-time total event count */
  totalEvents: number;
  /** Hours of all new events (0-23) in user timezone */
  newEventHours: number[];
  /** Days of week of all new events (0=Sun, 6=Sat) */
  newEventDays: number[];
  /** Events for the current week */
  weekEvents: { kind: string; occurred_on: string }[];
  /** Events for the current month with dates */
  monthEvents: { kind: string; occurred_on: string }[];
  /** PR count for the current month */
  monthPRCount: number;
  /** Longest commit message length today */
  longestCommitMessage: number;
  /** Weekly streak (consecutive weeks with activity) */
  weeklyStreak: number;
  /** Monthly streak (consecutive months with activity) */
  monthlyStreak: number;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // === Repeatable — Daily ===
  {
    id: "night_owl",
    name: "Night Owl",
    emoji: "\u{1F989}",
    description: "Coded between midnight and 5 AM",
    type: "repeatable",
    evaluate: (ctx) =>
      ctx.newEventHours.some((h) => h >= 0 && h < 5),
  },
  {
    id: "early_bird",
    name: "Early Bird",
    emoji: "\u{1F426}",
    description: "Coded between 5 AM and 7 AM",
    type: "repeatable",
    evaluate: (ctx) =>
      ctx.newEventHours.some((h) => h >= 5 && h < 7),
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
      ctx.newEventDays.some((d) => d === 0 || d === 6),
  },
  {
    id: "century_month",
    name: "Century Month",
    emoji: "\u{1F4AF}",
    description: "100+ events in a calendar month",
    type: "repeatable",
    period: "monthly",
    // Evaluated separately in engine via monthly count
    evaluate: () => false,
  },
  {
    id: "streak_keeper",
    name: "Streak Keeper",
    emoji: "\u{1F4AA}",
    description: "Maintained an active daily commit streak",
    type: "repeatable",
    evaluate: (ctx) =>
      ctx.todayEvents.some((e) => e.kind === "commit_pushed") && ctx.currentStreak >= 2,
  },
  {
    id: "commit_poet",
    name: "Commit Poet",
    emoji: "\u{1F4DD}",
    description: "Wrote a commit message over 100 characters",
    type: "repeatable",
    evaluate: (ctx) => ctx.longestCommitMessage > 100,
  },

  // === Repeatable — Weekly ===
  {
    id: "weekday_grind",
    name: "Weekday Grind",
    emoji: "\u{1F4BC}",
    description: "Committed every weekday (Mon-Fri) this week",
    type: "repeatable",
    period: "weekly",
    evaluate: (ctx) => {
      const commitDays = new Set<number>();
      for (const e of ctx.weekEvents) {
        if (e.kind === "commit_pushed") {
          // Use UTC noon to avoid timezone rollover issues
          const d = new Date(e.occurred_on + "T12:00:00Z");
          commitDays.add(d.getUTCDay());
        }
      }
      // Mon=1..Fri=5
      return [1, 2, 3, 4, 5].every((day) => commitDays.has(day));
    },
  },
  {
    id: "productive_week",
    name: "Productive Week",
    emoji: "\u{1F680}",
    description: "25+ events in a single week",
    type: "repeatable",
    period: "weekly",
    evaluate: (ctx) => ctx.weekEvents.length >= 25,
  },

  // === Repeatable — Monthly ===
  {
    id: "pr_machine",
    name: "PR Machine",
    emoji: "\u{1F500}",
    description: "10+ PRs opened in a month",
    type: "repeatable",
    period: "monthly",
    evaluate: (ctx) => ctx.monthPRCount >= 10,
  },
  {
    id: "consistency_king",
    name: "Consistency King",
    emoji: "\u{1F451}",
    description: "Active on 20+ different days in a month",
    type: "repeatable",
    period: "monthly",
    evaluate: (ctx) => {
      const uniqueDays = new Set(ctx.monthEvents.map((e) => e.occurred_on));
      return uniqueDays.size >= 20;
    },
  },

  // === Milestone: daily streak-based ===
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

  // === Milestone: weekly streak-based ===
  {
    id: "weekly_consistent",
    name: "Weekly Consistent",
    emoji: "\u{1F4C5}",
    description: "4-week activity streak",
    type: "milestone",
    evaluate: (ctx) => ctx.weeklyStreak >= 4,
  },
  {
    id: "weekly_quarter",
    name: "Weekly Quarter",
    emoji: "\u{1F3C5}",
    description: "13-week activity streak",
    type: "milestone",
    evaluate: (ctx) => ctx.weeklyStreak >= 13,
  },

  // === Milestone: monthly streak-based ===
  {
    id: "monthly_tri",
    name: "Monthly Tri",
    emoji: "\u{1F31F}",
    description: "3-month activity streak",
    type: "milestone",
    evaluate: (ctx) => ctx.monthlyStreak >= 3,
  },
  {
    id: "monthly_half",
    name: "Monthly Half",
    emoji: "\u{1F3C6}",
    description: "6-month activity streak",
    type: "milestone",
    evaluate: (ctx) => ctx.monthlyStreak >= 6,
  },
  {
    id: "monthly_annual",
    name: "Monthly Annual",
    emoji: "\u{1F48E}",
    description: "12-month activity streak",
    type: "milestone",
    evaluate: (ctx) => ctx.monthlyStreak >= 12,
  },

  // === Milestone: total-based ===
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
