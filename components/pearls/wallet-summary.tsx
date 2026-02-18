'use client';

import type { WalletStats, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import { convertUsdTo, formatCurrency, formatPol, formatEth } from '@/lib/pearls/currencies';
import {
  calculateBreakEven,
  calculateMonthlyPayout,
  calculateMonthsToBreakEven,
  calculateCompoundMonthsToBreakEven,
  calculateYearlyNoCompound,
  calculateYearlyMaxCompound,
} from '@/lib/pearls/calculations';

interface WalletSummaryProps {
  stats: WalletStats;
  rates: CurrencyRates;
  polPrice: number;
  ethPrice: number;
  currency: SupportedCurrency;
}

export default function WalletSummary({ stats, rates, polPrice, ethPrice, currency }: WalletSummaryProps) {
  const breakEven = calculateBreakEven(
    stats.total_spent_excluding_compounded_usd,
    stats.total_earned_usd
  );

  // Holdings intrinsic value in USD (for payout calculations)
  const holdingsPolUsd = stats.holdings_pol_value * polPrice;
  const holdingsEthUsd = stats.holdings_eth_value * ethPrice;
  const holdingsUsd = holdingsPolUsd + holdingsEthUsd;

  const monthlyPayoutUsd = calculateMonthlyPayout(holdingsUsd, stats.effective_apr);
  const monthsAsIs = calculateMonthsToBreakEven(
    stats.total_spent_excluding_compounded_usd,
    stats.total_earned_usd,
    monthlyPayoutUsd
  );
  const monthsCompound = calculateCompoundMonthsToBreakEven(
    stats.total_spent_excluding_compounded_usd,
    stats.total_earned_usd,
    holdingsUsd,
    stats.effective_apr,
    polPrice,
    ethPrice
  );

  // Compound break-even %: projects how far along you'd be if compounding accelerated your progress
  let compoundBreakEven = breakEven;
  if (monthsAsIs != null && monthsCompound != null && monthsCompound > 0 && monthsAsIs > 0) {
    compoundBreakEven = Math.min(100, breakEven * (monthsAsIs / monthsCompound));
  } else if (monthsCompound === 0) {
    compoundBreakEven = 100;
  }

  const estMonthlyPol = (stats.holdings_pol_value * (stats.effective_apr / 100)) / 12;
  const estMonthlyEth = (stats.holdings_eth_value * (stats.effective_apr / 100)) / 12;

  const yearlyNoCompoundUsd = calculateYearlyNoCompound(monthlyPayoutUsd);
  const yearlyMaxCompoundUsd = calculateYearlyMaxCompound(
    monthlyPayoutUsd,
    holdingsUsd,
    stats.effective_apr,
    polPrice,
    ethPrice
  );

  // Current values at today's prices (based on intrinsic holdings value)
  const currentPolValueUsd = holdingsPolUsd;
  const currentEthValueUsd = holdingsEthUsd;
  const currentTotalValueUsd = holdingsUsd;

  function fmt(usd: number) {
    return formatCurrency(convertUsdTo(usd, currency, rates), currency);
  }

  function monthsLabel(months: number | null) {
    if (months === 0) return 'Broken even!';
    if (months == null) return 'N/A';
    if (months === 1) return '~1 month';
    return `~${months} months`;
  }

  const hasBoosters = stats.total_boosters > 0;

  return (
    <div className="pearls-summary">
      {/* Fiat + Total Pearls */}
      <div className="pearls-stat-row-cards">
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Total Pearls</span>
          <span className="pearls-stat-value">{stats.total_pearls}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Current Fiat Value</span>
          <span className="pearls-stat-value">{fmt(currentTotalValueUsd)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Fiat Spent</span>
          <span className="pearls-stat-value">{fmt(stats.total_spent_usd)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Fiat Earned</span>
          <span className="pearls-stat-value pearls-positive">{fmt(stats.total_earned_usd)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Fiat Net</span>
          <span className={`pearls-stat-value ${stats.net_position_usd >= 0 ? 'pearls-positive' : 'pearls-negative'}`}>
            {fmt(stats.net_position_usd)}
          </span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Est. Monthly</span>
          <span className="pearls-stat-value pearls-stat-value-gradient">{fmt(monthlyPayoutUsd)}</span>
        </div>
      </div>

      {/* POL */}
      <div className="pearls-stat-row-cards">
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">POL Pearls</span>
          <span className="pearls-stat-value">{stats.pol_pearls}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Current POL Value</span>
          <span className="pearls-stat-value">{fmt(currentPolValueUsd)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">POL Spent</span>
          <span className="pearls-stat-value">{formatPol(stats.total_spent_pol)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">POL Earned</span>
          <span className="pearls-stat-value pearls-positive">{formatPol(stats.total_earned_pol)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Net POL</span>
          <span className={`pearls-stat-value ${stats.net_pol >= 0 ? 'pearls-positive' : 'pearls-negative'}`}>
            {formatPol(stats.net_pol)}
          </span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Est. Monthly POL</span>
          <span className="pearls-stat-value pearls-stat-value-gradient">{formatPol(estMonthlyPol)}</span>
        </div>
      </div>

      {/* ETH */}
      <div className="pearls-stat-row-cards">
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">ETH Pearls</span>
          <span className="pearls-stat-value">{stats.eth_pearls}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Current ETH Value</span>
          <span className="pearls-stat-value">{fmt(currentEthValueUsd)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">ETH Spent</span>
          <span className="pearls-stat-value">{formatEth(stats.total_spent_eth)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">ETH Earned</span>
          <span className="pearls-stat-value pearls-positive">{formatEth(stats.total_earned_eth)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Net ETH</span>
          <span className={`pearls-stat-value ${stats.net_eth >= 0 ? 'pearls-positive' : 'pearls-negative'}`}>
            {formatEth(stats.net_eth)}
          </span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Est. Monthly ETH</span>
          <span className="pearls-stat-value pearls-stat-value-gradient">{formatEth(estMonthlyEth)}</span>
        </div>
      </div>

      {/* Boosters + APR + Yearly Estimates */}
      <div className="pearls-stat-row-cards pearls-stat-row-flex">
        {hasBoosters && (
          <>
            <div className="pearls-stat-card">
              <span className="pearls-stat-label">Boosters Held</span>
              <span className="pearls-stat-value">{stats.total_boosters}</span>
            </div>
            <div className="pearls-stat-card">
              <span className="pearls-stat-label">Booster Spend</span>
              <span className="pearls-stat-value">{formatPol(stats.total_booster_spent_pol)}</span>
            </div>
            <div className="pearls-stat-card">
              <span className="pearls-stat-label">Effective APR</span>
              <span className="pearls-stat-value">{stats.effective_apr.toFixed(1)}%</span>
            </div>
          </>
        )}
        <div className="pearls-stat-spacer" />
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Est. Yearly</span>
          <span className="pearls-stat-value pearls-stat-value-gradient">{fmt(yearlyNoCompoundUsd)}</span>
        </div>
        <div className="pearls-stat-card">
          <span className="pearls-stat-label">Est. Yearly (Comp.)</span>
          <span className="pearls-stat-value pearls-stat-value-gradient">{fmt(yearlyMaxCompoundUsd)}</span>
        </div>
      </div>

      {/* Break-even */}
      <div className="pearls-break-even">
        <div className="pearls-break-even-header">
          <span className="pearls-stat-label">Break-even Progress</span>
          <div className="pearls-break-even-right">
            <span className="pearls-break-even-est">
              <span className="pearls-label-current">Current</span>: {breakEven.toFixed(1)}% &middot; {monthsLabel(monthsAsIs)}
            </span>
            <span className="pearls-break-even-est">
              <span className="pearls-label-compound">Compound</span>: {compoundBreakEven.toFixed(1)}% &middot; {monthsLabel(monthsCompound)}
            </span>
          </div>
        </div>
        <div className="pearls-meter-track">
          <div
            className="pearls-meter-fill-compound"
            style={{ width: `${Math.min(compoundBreakEven, 100)}%` }}
            aria-hidden="true"
          />
          <div
            className="pearls-meter-fill-current"
            style={{ width: `${breakEven}%` }}
            role="progressbar"
            aria-valuenow={Math.round(breakEven)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Break-even progress: ${Math.round(breakEven)}%`}
          />
        </div>
      </div>
    </div>
  );
}
