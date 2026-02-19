import { APR_CONFIG } from '@/lib/pearls/config';

interface BoosterTrackerProps {
  boosterCount: number;
  apr: number;
}

export default function BoosterTracker({ boosterCount, apr }: BoosterTrackerProps) {
  const maxBoosters = APR_CONFIG.maxBoosters;
  const progress = Math.min((boosterCount / maxBoosters) * 100, 100);

  return (
    <div className="pearls-section">
      <h3>Boosters</h3>
      <div className="pearls-stat-grid">
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Boosters Owned</span>
          <span className="pearls-stat-value">{boosterCount} / {maxBoosters}</span>
          <div className="pearls-meter-track">
            <div
              className="pearls-meter-fill"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={boosterCount}
              aria-valuemin={0}
              aria-valuemax={maxBoosters}
              aria-label={`${boosterCount} of ${maxBoosters} boosters`}
            />
          </div>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Effective APR</span>
          <span className="pearls-stat-value pearls-positive">{apr.toFixed(1)}%</span>
          <span className="pearls-stat-sub">
            Base {APR_CONFIG.baseApr}% + {(apr - APR_CONFIG.baseApr).toFixed(1)}% boost
          </span>
        </div>
      </div>
    </div>
  );
}
