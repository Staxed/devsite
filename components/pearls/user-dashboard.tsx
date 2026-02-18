'use client';

import { useState } from 'react';
import type { WalletStats, NftTransfer, PayoutTransfer, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import { convertUsdTo, formatCurrency, formatNative } from '@/lib/pearls/currencies';
import CurrencySelector from './currency-selector';
import BoosterTracker from './booster-tracker';
import BreakEvenMeter from './break-even-meter';
import PayoutEstimator from './payout-estimator';

interface UserDashboardProps {
  stats: WalletStats;
  purchases: NftTransfer[];
  payouts: PayoutTransfer[];
  rates: CurrencyRates;
  polPrice: number;
  ethPrice: number;
}

export default function UserDashboard({
  stats,
  purchases,
  payouts,
  rates,
  polPrice,
  ethPrice,
}: UserDashboardProps) {
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');

  // Calculate native totals
  const totalSpentPol = purchases
    .filter((p) => p.native_currency === 'POL' && p.native_value != null)
    .reduce((sum, p) => sum + (p.native_value ?? 0), 0);
  const totalSpentEth = purchases
    .filter((p) => p.native_currency === 'ETH' && p.native_value != null)
    .reduce((sum, p) => sum + (p.native_value ?? 0), 0);

  const compoundedPurchases = purchases.filter((p) => p.is_compounded);
  const compoundedPol = compoundedPurchases
    .filter((p) => p.native_currency === 'POL')
    .reduce((sum, p) => sum + (p.native_value ?? 0), 0);
  const compoundedEth = compoundedPurchases
    .filter((p) => p.native_currency === 'ETH')
    .reduce((sum, p) => sum + (p.native_value ?? 0), 0);
  const compoundedUsd = compoundedPurchases.reduce((sum, p) => sum + (p.usd_value ?? 0), 0);

  const totalPayoutsPol = payouts
    .filter((p) => p.native_currency === 'POL')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPayoutsEth = payouts
    .filter((p) => p.native_currency === 'ETH')
    .reduce((sum, p) => sum + p.amount, 0);

  const payoutBalanceUsd = stats.total_earned_usd - compoundedUsd;

  return (
    <div className="pearls-dashboard">
      <div className="pearls-toolbar">
        <h2>Your Dashboard</h2>
        <CurrencySelector value={currency} onChange={setCurrency} />
      </div>

      <div className="pearls-stat-grid">
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Total Spent</span>
          <span className="pearls-stat-value">
            {formatCurrency(convertUsdTo(stats.total_spent_usd, currency, rates), currency)}
          </span>
          <span className="pearls-stat-sub">
            {formatNative(totalSpentPol, 'POL')} + {formatNative(totalSpentEth, 'ETH')}
          </span>
        </div>

        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Total Compounded</span>
          <span className="pearls-stat-value">
            {formatCurrency(convertUsdTo(compoundedUsd, currency, rates), currency)}
          </span>
          <span className="pearls-stat-sub">
            {formatNative(compoundedPol, 'POL')} + {formatNative(compoundedEth, 'ETH')}
          </span>
        </div>

        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Total Payouts</span>
          <span className="pearls-stat-value">
            {formatCurrency(convertUsdTo(stats.total_earned_usd, currency, rates), currency)}
          </span>
          <span className="pearls-stat-sub">
            {formatNative(totalPayoutsPol, 'POL')} + {formatNative(totalPayoutsEth, 'ETH')}
          </span>
        </div>

        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Payout Balance</span>
          <span className={`pearls-stat-value ${payoutBalanceUsd >= 0 ? 'pearls-positive' : 'pearls-negative'}`}>
            {formatCurrency(convertUsdTo(payoutBalanceUsd, currency, rates), currency)}
          </span>
          <span className="pearls-stat-sub">Payouts minus compounded</span>
        </div>
      </div>

      <BoosterTracker
        boosterCount={stats.total_boosters}
        apr={stats.effective_apr}
      />

      <BreakEvenMeter
        totalSpent={stats.total_spent_excluding_compounded_usd}
        totalEarned={stats.total_earned_usd}
      />

      <PayoutEstimator
        holdingsValueUsd={stats.holdings_pol_value * polPrice + stats.holdings_eth_value * ethPrice}
        apr={stats.effective_apr}
        polPrice={polPrice}
        ethPrice={ethPrice}
        currency={currency}
        rates={rates}
      />
    </div>
  );
}
