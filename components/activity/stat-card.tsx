export default function StatCard({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
