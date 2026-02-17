import type { WalletStats } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import type { CurrencyRates } from '@/lib/pearls/types';
import { convertUsdTo, formatCurrency } from '@/lib/pearls/currencies';
import { calculateBreakEven } from '@/lib/pearls/calculations';

interface WalletSummaryProps {
  stats: WalletStats;
  currency: SupportedCurrency;
  rates: CurrencyRates;
}

export default function WalletSummary({ stats, currency, rates }: WalletSummaryProps) {
  const breakEven = calculateBreakEven(
    stats.total_spent_excluding_compounded_usd,
    stats.total_earned_usd
  );

  return (
    <div className="pearls-summary">
      <div className="pearls-stat-grid">
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Pearls Held</span>
          <span className="pearls-stat-value">{stats.total_pearls}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Boosters</span>
          <span className="pearls-stat-value">{stats.total_boosters}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Total Spent</span>
          <span className="pearls-stat-value">
            {formatCurrency(convertUsdTo(stats.total_spent_usd, currency, rates), currency)}
          </span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Total Earned</span>
          <span className="pearls-stat-value">
            {formatCurrency(convertUsdTo(stats.total_earned_usd, currency, rates), currency)}
          </span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Net Position</span>
          <span className={`pearls-stat-value ${stats.net_position_usd >= 0 ? 'pearls-positive' : 'pearls-negative'}`}>
            {formatCurrency(convertUsdTo(stats.net_position_usd, currency, rates), currency)}
          </span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Effective APR</span>
          <span className="pearls-stat-value">{stats.effective_apr.toFixed(1)}%</span>
        </div>
      </div>
      <div className="pearls-break-even">
        <span className="pearls-stat-label">Break-even Progress</span>
        <div className="pearls-meter-track">
          <div
            className="pearls-meter-fill"
            style={{ width: `${breakEven}%` }}
            role="progressbar"
            aria-valuenow={Math.round(breakEven)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Break-even progress: ${Math.round(breakEven)}%`}
          />
        </div>
        <span className="pearls-meter-label">{breakEven.toFixed(1)}%</span>
      </div>
    </div>
  );
}
