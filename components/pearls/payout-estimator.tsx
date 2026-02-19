import type { SupportedCurrency } from '@/lib/pearls/config';
import type { CurrencyRates } from '@/lib/pearls/types';
import { convertUsdTo, formatCurrency } from '@/lib/pearls/currencies';
import {
  calculateMonthlyPayout,
  calculateYearlyNoCompound,
  calculateYearlyMaxCompound,
} from '@/lib/pearls/calculations';

interface PayoutEstimatorProps {
  holdingsValueUsd: number;
  apr: number;
  polPrice: number;
  ethPrice: number;
  currency: SupportedCurrency;
  rates: CurrencyRates;
}

export default function PayoutEstimator({
  holdingsValueUsd,
  apr,
  polPrice,
  ethPrice,
  currency,
  rates,
}: PayoutEstimatorProps) {
  const monthly = calculateMonthlyPayout(holdingsValueUsd, apr);
  const yearlyNoCompound = calculateYearlyNoCompound(monthly);
  const yearlyMaxCompound = calculateYearlyMaxCompound(
    monthly,
    holdingsValueUsd,
    apr,
    polPrice,
    ethPrice
  );

  return (
    <div className="pearls-section">
      <h3>Payout Projections</h3>
      <div className="pearls-projections">
        <div className="pearls-projection-card">
          <span className="pearls-stat-label">Est. Monthly Payout</span>
          <span className="pearls-stat-value">
            {formatCurrency(convertUsdTo(monthly, currency, rates), currency)}
          </span>
        </div>
        <div className="pearls-projection-card">
          <span className="pearls-stat-label">Est. Yearly (No Compound)</span>
          <span className="pearls-stat-value">
            {formatCurrency(convertUsdTo(yearlyNoCompound, currency, rates), currency)}
          </span>
        </div>
        <div className="pearls-projection-card">
          <span className="pearls-stat-label">Est. Yearly (Max Compound)</span>
          <span className="pearls-stat-value pearls-positive">
            {formatCurrency(convertUsdTo(yearlyMaxCompound, currency, rates), currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
