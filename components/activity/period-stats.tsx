import StatCard from "./stat-card";

interface PeriodStatsProps {
  today: Record<string, number>;
  week: Record<string, number>;
  month: Record<string, number>;
}

function totalEvents(stats: Record<string, number>): number {
  return Object.values(stats).reduce((a, b) => a + b, 0);
}

export default function PeriodStats({ today, week, month }: PeriodStatsProps) {
  return (
    <div className="period-stats">
      <StatCard value={totalEvents(today)} label="Today" />
      <StatCard value={totalEvents(week)} label="This Week" />
      <StatCard value={totalEvents(month)} label="This Month" />
      <StatCard value={today.commit_pushed || 0} label="Commits Today" />
    </div>
  );
}
