export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/server";
import { getCodingStreak, getPeriodStats } from "@/lib/streaks/engine";
import { timelineRows } from "@/lib/activity/view";
import { getSettings } from "@/lib/settings";
import { todayInTimezone, getWeekStartFromTimezone, getMonthStartFromTimezone } from "@/lib/dates";
import Timeline from "@/components/activity/timeline";
import StreakCard from "@/components/activity/streak-card";
import PeriodStats from "@/components/activity/period-stats";
import type { ActivityEvent } from "@/lib/supabase/types";

export default async function ActivityPage() {
  const { timezone, excluded_repos } = await getSettings();
  const supabase = createAdminClient();
  const today = todayInTimezone(timezone);
  const weekStart = getWeekStartFromTimezone(timezone);
  const monthStart = getMonthStartFromTimezone(timezone);

  const [
    { data: events },
    codingStreak,
    todayStats,
    weekStats,
    monthStats,
  ] = await Promise.all([
    supabase
      .from("activity_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(50),
    getCodingStreak(),
    getPeriodStats(today, today),
    getPeriodStats(weekStart, today),
    getPeriodStats(monthStart, today),
  ]);

  const rows = timelineRows((events as ActivityEvent[]) || [], excluded_repos);

  return (
    <main id="main-content" tabIndex={-1} className="activity-main">
      <section className="activity-stats-section">
        <div className="activity-streaks">
          <StreakCard count={codingStreak} label="Day Coding Streak" />
        </div>
        <PeriodStats today={todayStats} week={weekStats} month={monthStats} />
      </section>

      <section className="activity-timeline-section">
        <h2 className="activity-section-title">Recent Activity</h2>
        <Timeline rows={rows} />
      </section>
    </main>
  );
}
