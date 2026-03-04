export default function StreakCard({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  return (
    <div className="streak-card">
      <span className="streak-count">{count}</span>
      <span className="streak-label">{label}</span>
    </div>
  );
}
