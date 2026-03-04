import { createAdminClient } from "@/lib/supabase/server";
import { getCodingStreak, getPeriodStats } from "@/lib/streaks/engine";
import { getSettings } from "@/lib/settings";
import Timeline from "@/components/activity/timeline";
import StreakCard from "@/components/activity/streak-card";
import PeriodStats from "@/components/activity/period-stats";
import type { ActivityEvent } from "@/lib/supabase/types";

export default async function ActivityPage() {
  const { timezone } = await getSettings();
  const supabase = createAdminClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

  const weekD = new Date();
  const weekTz = new Date(weekD.toLocaleString("en-US", { timeZone: timezone }));
  const day = weekTz.getDay();
  weekTz.setDate(weekTz.getDate() - (day === 0 ? 6 : day - 1));
  const weekStart = weekTz.toISOString().split("T")[0];

  const monthD = new Date();
  const monthTz = new Date(monthD.toLocaleString("en-US", { timeZone: timezone }));
  const monthStart = `${monthTz.getFullYear()}-${String(monthTz.getMonth() + 1).padStart(2, "0")}-01`;

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

  // Scrub private details for public display
  const publicEvents: ActivityEvent[] = ((events as ActivityEvent[]) || []).map((e) => {
    if (e.visibility === "private") {
      return {
        ...e,
        url: null,
        metadata: {},
        title: e.public_summary || "Activity in a private repository",
      };
    }
    return e;
  });

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
        <Timeline events={publicEvents} />
      </section>
    </main>
  );
}
