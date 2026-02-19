import { calculateBreakEven } from '@/lib/pearls/calculations';

interface BreakEvenMeterProps {
  totalSpent: number;
  totalEarned: number;
}

export default function BreakEvenMeter({ totalSpent, totalEarned }: BreakEvenMeterProps) {
  const pct = calculateBreakEven(totalSpent, totalEarned);

  return (
    <div className="pearls-section">
      <h3>Break-even Progress</h3>
      <div className="pearls-break-even">
        <span className="pearls-stat-label">{pct.toFixed(1)}%</span>
        <div className="pearls-meter-track">
          <div
            className="pearls-meter-fill"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Break-even progress: ${Math.round(pct)}%`}
          />
        </div>
      </div>
    </div>
  );
}
