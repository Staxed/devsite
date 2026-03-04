import { createAdminClient } from "@/lib/supabase/server";
import { getCodingStreak, getPeriodStats } from "@/lib/streaks/engine";
import { TIMEZONE } from "@/lib/constants";
import Timeline from "@/components/activity/timeline";
import StreakCard from "@/components/activity/streak-card";
import PeriodStats from "@/components/activity/period-stats";
import type { ActivityEvent } from "@/lib/supabase/types";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function weekStartStr(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const day = tz.getDay();
  tz.setDate(tz.getDate() - (day === 0 ? 6 : day - 1));
  return tz.toISOString().split("T")[0];
}

function monthStartStr(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: TIMEZONE }));
  return `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ActivityPage() {
  const supabase = createAdminClient();
  const today = todayStr();

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
    getPeriodStats(weekStartStr(), today),
    getPeriodStats(monthStartStr(), today),
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
