'use client';

import { useState } from 'react';
import YieldCalculator from './yield-calculator';
import type { WalletStats, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import { MIN_PEARL_PRICES } from '@/lib/pearls/config';
import { convertUsdTo, formatCurrency, formatPol, formatEth } from '@/lib/pearls/currencies';
import {
  calculateBreakEven,
  calculateMonthlyPayout,
  calculateMonthsToBreakEven,
  calculateCompoundMonthsToBreakEven,
  calculateCompoundMonthsToBreakEvenNative,
  calculateYearlyNoCompound,
  calculateYearlyMaxCompound,
  calculateYearlyMaxCompoundNative,
  findOptimalBoostersNative,
} from '@/lib/pearls/calculations';

interface WalletSummaryProps {
  stats: WalletStats;
  rates: CurrencyRates;
  polPrice: number;
  ethPrice: number;
  currency: SupportedCurrency;
  compoundedPol?: number;
  compoundedEth?: number;
  compoundedUsd?: number;
}

type EstimateTab = 'monthly' | 'yearly' | 'compound' | 'compound2' | 'compound3' | 'compound4' | 'compound5' | 'compound10' | 'compound20';
type BreakEvenMode = 'fiat' | 'pol' | 'eth';

export default function WalletSummary({ stats, rates, polPrice, ethPrice, currency, compoundedPol = 0, compoundedEth = 0, compoundedUsd = 0 }: WalletSummaryProps) {
  const [estTab, setEstTab] = useState<EstimateTab>('monthly');
  const [breakEvenMode, setBreakEvenMode] = useState<BreakEvenMode>('fiat');

  // Derive "excluding compounded" values from live state (updates instantly on toggle)
  const spentExclCompUsd = stats.total_spent_usd - compoundedUsd;
  const spentExclCompPol = stats.total_spent_pol - compoundedPol;
  const spentExclCompEth = stats.total_spent_eth - compoundedEth;
  const netUsd = stats.total_earned_usd - spentExclCompUsd;
  const netPol = stats.total_earned_pol - spentExclCompPol;
  const netEth = stats.total_earned_eth - spentExclCompEth;

  // Holdings intrinsic value in USD (for payout calculations)
  const holdingsPolUsd = stats.holdings_pol_value * polPrice;
  const holdingsEthUsd = stats.holdings_eth_value * ethPrice;
  const holdingsUsd = holdingsPolUsd + holdingsEthUsd;

  const monthlyPayoutUsd = calculateMonthlyPayout(holdingsUsd, stats.effective_apr);

  // Native token equivalents for break-even modes
  const ethToPol = polPrice > 0 ? ethPrice / polPrice : 0;
  const polToEth = ethPrice > 0 ? polPrice / ethPrice : 0;

  // POL EQ
  const combinedSpentPol = spentExclCompPol + (spentExclCompEth * ethToPol);
  const combinedEarnedPol = stats.total_earned_pol + (stats.total_earned_eth * ethToPol);
  const combinedHoldingsPol = stats.holdings_pol_value + (stats.holdings_eth_value * ethToPol);
  const minPearlCostPol = Math.min(MIN_PEARL_PRICES.polygon.amount, MIN_PEARL_PRICES.base.amount * ethToPol);

  // ETH EQ
  const combinedSpentEth = spentExclCompEth + (spentExclCompPol * polToEth);
  const combinedEarnedEth = stats.total_earned_eth + (stats.total_earned_pol * polToEth);
  const combinedHoldingsEth = stats.holdings_eth_value + (stats.holdings_pol_value * polToEth);
  const minPearlCostEth = Math.min(MIN_PEARL_PRICES.base.amount, MIN_PEARL_PRICES.polygon.amount * polToEth);

  // Break-even calculations (mode-dependent)
  let breakEven: number;
  let monthsAsIs: number | null;
  let monthsCompound: number | null;

  if (breakEvenMode === 'pol') {
    breakEven = calculateBreakEven(combinedSpentPol, combinedEarnedPol);
    const monthlyPayoutPol = (combinedHoldingsPol * (stats.effective_apr / 100)) / 12;
    monthsAsIs = calculateMonthsToBreakEven(combinedSpentPol, combinedEarnedPol, monthlyPayoutPol);
    monthsCompound = calculateCompoundMonthsToBreakEvenNative(
      combinedSpentPol, combinedEarnedPol, combinedHoldingsPol, stats.effective_apr, minPearlCostPol
    );
  } else if (breakEvenMode === 'eth') {
    breakEven = calculateBreakEven(combinedSpentEth, combinedEarnedEth);
    const monthlyPayoutEth = (combinedHoldingsEth * (stats.effective_apr / 100)) / 12;
    monthsAsIs = calculateMonthsToBreakEven(combinedSpentEth, combinedEarnedEth, monthlyPayoutEth);
    monthsCompound = calculateCompoundMonthsToBreakEvenNative(
      combinedSpentEth, combinedEarnedEth, combinedHoldingsEth, stats.effective_apr, minPearlCostEth
    );
  } else {
    breakEven = calculateBreakEven(spentExclCompUsd, stats.total_earned_usd);
    monthsAsIs = calculateMonthsToBreakEven(spentExclCompUsd, stats.total_earned_usd, monthlyPayoutUsd);
    monthsCompound = calculateCompoundMonthsToBreakEven(
      spentExclCompUsd, stats.total_earned_usd, holdingsUsd, stats.effective_apr, polPrice, ethPrice
    );
  }

  let compoundBreakEven = breakEven;
  if (monthsAsIs != null && monthsCompound != null && monthsCompound > 0 && monthsAsIs > 0) {
    compoundBreakEven = Math.min(100, breakEven * (monthsAsIs / monthsCompound));
  } else if (monthsCompound === 0) {
    compoundBreakEven = 100;
  }

  const estMonthlyPol = (stats.holdings_pol_value * (stats.effective_apr / 100)) / 12;
  const estMonthlyEth = (stats.holdings_eth_value * (stats.effective_apr / 100)) / 12;
  const estYearlyPol = estMonthlyPol * 12;
  const estYearlyEth = estMonthlyEth * 12;
  const estCompoundPol = calculateYearlyMaxCompoundNative(stats.holdings_pol_value, stats.effective_apr, 10);
  const estCompoundEth = calculateYearlyMaxCompoundNative(stats.holdings_eth_value, stats.effective_apr, 0.00075);

  const compound2Usd = calculateYearlyMaxCompound(monthlyPayoutUsd, holdingsUsd, stats.effective_apr, polPrice, ethPrice, 2);
  const compound2Pol = calculateYearlyMaxCompoundNative(stats.holdings_pol_value, stats.effective_apr, 10, 2);
  const compound2Eth = calculateYearlyMaxCompoundNative(stats.holdings_eth_value, stats.effective_apr, 0.00075, 2);

  const compound3Usd = calculateYearlyMaxCompound(monthlyPayoutUsd, holdingsUsd, stats.effective_apr, polPrice, ethPrice, 3);
  const compound3Pol = calculateYearlyMaxCompoundNative(stats.holdings_pol_value, stats.effective_apr, 10, 3);
  const compound3Eth = calculateYearlyMaxCompoundNative(stats.holdings_eth_value, stats.effective_apr, 0.00075, 3);

  const compound4Usd = calculateYearlyMaxCompound(monthlyPayoutUsd, holdingsUsd, stats.effective_apr, polPrice, ethPrice, 4);
  const compound4Pol = calculateYearlyMaxCompoundNative(stats.holdings_pol_value, stats.effective_apr, 10, 4);
  const compound4Eth = calculateYearlyMaxCompoundNative(stats.holdings_eth_value, stats.effective_apr, 0.00075, 4);

  const compound5Usd = calculateYearlyMaxCompound(monthlyPayoutUsd, holdingsUsd, stats.effective_apr, polPrice, ethPrice, 5);
  const compound5Pol = calculateYearlyMaxCompoundNative(stats.holdings_pol_value, stats.effective_apr, 10, 5);
  const compound5Eth = calculateYearlyMaxCompoundNative(stats.holdings_eth_value, stats.effective_apr, 0.00075, 5);

  const compound10Usd = calculateYearlyMaxCompound(monthlyPayoutUsd, holdingsUsd, stats.effective_apr, polPrice, ethPrice, 10);
  const compound10Pol = calculateYearlyMaxCompoundNative(stats.holdings_pol_value, stats.effective_apr, 10, 10);
  const compound10Eth = calculateYearlyMaxCompoundNative(stats.holdings_eth_value, stats.effective_apr, 0.00075, 10);

  const compound20Usd = calculateYearlyMaxCompound(monthlyPayoutUsd, holdingsUsd, stats.effective_apr, polPrice, ethPrice, 20);
  const compound20Pol = calculateYearlyMaxCompoundNative(stats.holdings_pol_value, stats.effective_apr, 10, 20);
  const compound20Eth = calculateYearlyMaxCompoundNative(stats.holdings_eth_value, stats.effective_apr, 0.00075, 20);

  const yearlyNoCompoundUsd = calculateYearlyNoCompound(monthlyPayoutUsd);
  const yearlyMaxCompoundUsd = calculateYearlyMaxCompound(
    monthlyPayoutUsd,
    holdingsUsd,
    stats.effective_apr,
    polPrice,
    ethPrice
  );

  function fmt(usd: number) {
    return formatCurrency(convertUsdTo(usd, currency, rates), currency);
  }

  function monthsLabel(months: number | null) {
    if (months === 0) return 'Broken even!';
    if (months == null) return 'N/A';
    if (months === 1) return '~1 month';
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years === 0) return `~${months} months`;
    if (rem === 0) return `~${years} year${years > 1 ? 's' : ''}`;
    return `~${years}y ${rem}m`;
  }

  // Projected values: actual + estimated earnings for selected period
  function getEstUsd(): number {
    if (estTab === 'monthly') return monthlyPayoutUsd;
    if (estTab === 'yearly') return yearlyNoCompoundUsd;
    if (estTab === 'compound') return yearlyMaxCompoundUsd;
    if (estTab === 'compound2') return compound2Usd;
    if (estTab === 'compound3') return compound3Usd;
    if (estTab === 'compound4') return compound4Usd;
    if (estTab === 'compound5') return compound5Usd;
    if (estTab === 'compound10') return compound10Usd;
    return compound20Usd;
  }
  function getEstPolNative(): number {
    if (estTab === 'monthly') return estMonthlyPol;
    if (estTab === 'yearly') return estYearlyPol;
    if (estTab === 'compound') return estCompoundPol;
    if (estTab === 'compound2') return compound2Pol;
    if (estTab === 'compound3') return compound3Pol;
    if (estTab === 'compound4') return compound4Pol;
    if (estTab === 'compound5') return compound5Pol;
    if (estTab === 'compound10') return compound10Pol;
    return compound20Pol;
  }
  function getEstEthNative(): number {
    if (estTab === 'monthly') return estMonthlyEth;
    if (estTab === 'yearly') return estYearlyEth;
    if (estTab === 'compound') return estCompoundEth;
    if (estTab === 'compound2') return compound2Eth;
    if (estTab === 'compound3') return compound3Eth;
    if (estTab === 'compound4') return compound4Eth;
    if (estTab === 'compound5') return compound5Eth;
    if (estTab === 'compound10') return compound10Eth;
    return compound20Eth;
  }

  const isCompound = estTab.startsWith('compound');

  const projectedNetUsd = netUsd + getEstUsd();
  const projectedNetPol = netPol + getEstPolNative();
  const projectedNetEth = netEth + getEstEthNative();

  // Estimate values based on selected tab
  function getEstTotal(): string {
    return fmt(getEstUsd());
  }
  function getEstPol(): string {
    return formatPol(getEstPolNative());
  }
  function getEstEth(): string {
    return formatEth(getEstEthNative());
  }
  function getEstMonths(): number {
    if (estTab === 'monthly') return 1;
    if (estTab === 'yearly') return 12;
    if (estTab === 'compound') return 12;
    if (estTab === 'compound2') return 24;
    if (estTab === 'compound3') return 36;
    if (estTab === 'compound4') return 48;
    if (estTab === 'compound5') return 60;
    if (estTab === 'compound10') return 120;
    return 240;
  }
  function getAvgMonthlyUsd(): number {
    return getEstUsd() / getEstMonths();
  }
  function getAvgMonthlyPol(): string {
    return formatPol(getEstPolNative() / getEstMonths());
  }
  function getAvgMonthlyEth(): string {
    return formatEth(getEstEthNative() / getEstMonths());
  }
  function getEstLabel(): string {
    if (estTab === 'monthly') return 'Monthly';
    if (estTab === 'yearly') return 'Yearly';
    if (estTab === 'compound') return 'Yearly Compound';
    if (estTab === 'compound2') return '2 Year Compound';
    if (estTab === 'compound3') return '3 Year Compound';
    if (estTab === 'compound4') return '4 Year Compound';
    if (estTab === 'compound5') return '5 Year Compound';
    if (estTab === 'compound10') return '10 Year Compound';
    return '20 Year Compound';
  }

  return (
    <div className="pearls-summary">
      {/* Hero stats */}
      <div className="pearls-hero-row">
        <div className="pearls-hero-stat">
          <span className="pearls-hero-label">Current Total Value</span>
          <span className="pearls-hero-value">{fmt(holdingsUsd)}</span>
        </div>
        <div className="pearls-hero-stat">
          <span className="pearls-hero-label">Total Spent</span>
          <span className="pearls-hero-value">{fmt(spentExclCompUsd)}</span>
        </div>
        <div className="pearls-hero-stat">
          <span className="pearls-hero-label">Total Compounded</span>
          <span className="pearls-hero-value">{fmt(compoundedUsd)}</span>
        </div>
        <div className="pearls-hero-stat">
          <span className="pearls-hero-label">Net P/L</span>
          <span className={`pearls-hero-value ${projectedNetUsd >= 0 ? 'pearls-positive' : 'pearls-negative'}`}>
            {fmt(projectedNetUsd)}
          </span>
        </div>
        <div className="pearls-hero-stat">
          <span className="pearls-hero-label">Earned</span>
          <span className="pearls-hero-value pearls-positive">{fmt(stats.total_earned_usd)}</span>
        </div>
        <div className="pearls-hero-stat">
          <span className="pearls-hero-label">Effective APR</span>
          <span className="pearls-hero-value">{stats.effective_apr.toFixed(1)}%</span>
        </div>
        <div className="pearls-hero-right">
          <div className="pearls-hero-stat">
            <span className="pearls-hero-label">{getEstLabel()}</span>
            <span className="pearls-hero-value pearls-stat-value-gradient">{getEstTotal()}</span>
          </div>
          {isCompound && (
            <div className="pearls-hero-stat">
              <span className="pearls-hero-label">Avg. Monthly</span>
              <span className="pearls-hero-value pearls-stat-value-gradient">{fmt(getAvgMonthlyUsd())}</span>
            </div>
          )}
        </div>
      </div>

      {/* Asset table */}
      <div className="pearls-asset-section">
        <div className="pearls-asset-header">
          <span className="pearls-asset-title">Assets</span>
          <div className="pearls-est-tabs">
            <button type="button" className={`pearls-est-tab ${estTab === 'monthly' ? 'active' : ''}`} onClick={() => setEstTab('monthly')}>Monthly</button>
            <button type="button" className={`pearls-est-tab ${estTab === 'yearly' ? 'active' : ''}`} onClick={() => setEstTab('yearly')}>Yearly</button>
          </div>
        </div>
        <div className="pearls-table-wrap">
          <table className="pearls-table pearls-asset-table" role="table">
            <colgroup>
              <col style={{ width: isCompound ? '10%' : '11%' }} />
              <col style={{ width: isCompound ? '6%' : '7%' }} />
              <col style={{ width: isCompound ? '12%' : '14%' }} />
              <col style={{ width: isCompound ? '11%' : '12%' }} />
              <col style={{ width: isCompound ? '11%' : '12%' }} />
              <col style={{ width: isCompound ? '11%' : '12%' }} />
              <col style={{ width: isCompound ? '11%' : '12%' }} />
              <col style={{ width: isCompound ? '11%' : '12%' }} />
              {isCompound && <col style={{ width: '11%' }} />}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Owned</th>
                <th scope="col">Current Value</th>
                <th scope="col">Spent</th>
                <th scope="col">Compounded</th>
                <th scope="col">Earned</th>
                <th scope="col">Net</th>
                <th scope="col">{getEstLabel()}</th>
                {isCompound && <th scope="col">Avg. Monthly</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>POL</td>
                <td>{stats.pol_pearls}</td>
                <td>{fmt(holdingsPolUsd)}</td>
                <td>{formatPol(spentExclCompPol)}</td>
                <td>{formatPol(compoundedPol)}</td>
                <td className="pearls-positive">+{formatPol(stats.total_earned_pol)}</td>
                <td className={projectedNetPol >= 0 ? 'pearls-positive' : 'pearls-negative'}>
                  {formatPol(projectedNetPol)}
                </td>
                <td className="pearls-stat-value-gradient">{getEstPol()}</td>
                {isCompound && <td className="pearls-stat-value-gradient">{getAvgMonthlyPol()}</td>}
              </tr>
              <tr>
                <td>ETH</td>
                <td>{stats.eth_pearls}</td>
                <td>{fmt(holdingsEthUsd)}</td>
                <td>{formatEth(spentExclCompEth)}</td>
                <td>{formatEth(compoundedEth)}</td>
                <td className="pearls-positive">+{formatEth(stats.total_earned_eth)}</td>
                <td className={projectedNetEth >= 0 ? 'pearls-positive' : 'pearls-negative'}>
                  {formatEth(projectedNetEth)}
                </td>
                <td className="pearls-stat-value-gradient">{getEstEth()}</td>
                {isCompound && <td className="pearls-stat-value-gradient">{getAvgMonthlyEth()}</td>}
              </tr>
              {stats.total_boosters > 0 && (
                <tr>
                  <td>Boosters</td>
                  <td>{stats.total_boosters}</td>
                  <td>{formatPol(stats.holdings_booster_value)}</td>
                  <td>{formatPol(stats.total_booster_spent_pol)}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  {isCompound && <td></td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estimated Compounding */}
      <div className="pearls-compound-section" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span className="pearls-compound-label">
          Available to Compound: {formatPol(stats.total_earned_pol - compoundedPol)} | {formatEth(stats.total_earned_eth - compoundedEth)} | {formatCurrency(convertUsdTo(stats.total_earned_usd - compoundedUsd, currency, rates), currency)}
        </span>
        <span style={{ marginLeft: 'auto' }} />
        <span className="pearls-compound-label">Estimated Compounding</span>
        <div className="pearls-est-tabs">
          <button type="button" className={`pearls-est-tab ${estTab === 'compound' ? 'active' : ''}`} onClick={() => setEstTab('compound')}>1Y</button>
          <button type="button" className={`pearls-est-tab ${estTab === 'compound2' ? 'active' : ''}`} onClick={() => setEstTab('compound2')}>2Y</button>
          <button type="button" className={`pearls-est-tab ${estTab === 'compound3' ? 'active' : ''}`} onClick={() => setEstTab('compound3')}>3Y</button>
          <button type="button" className={`pearls-est-tab ${estTab === 'compound4' ? 'active' : ''}`} onClick={() => setEstTab('compound4')}>4Y</button>
          <button type="button" className={`pearls-est-tab ${estTab === 'compound5' ? 'active' : ''}`} onClick={() => setEstTab('compound5')}>5Y</button>
          <button type="button" className={`pearls-est-tab ${estTab === 'compound10' ? 'active' : ''}`} onClick={() => setEstTab('compound10')}>10Y</button>
          <button type="button" className={`pearls-est-tab ${estTab === 'compound20' ? 'active' : ''}`} onClick={() => setEstTab('compound20')}>20Y</button>
        </div>
      </div>
      <p className="pearls-compound-disclaimer">Compounding estimates based on current owned assets assuming no more are purchased. (But never not buy more pearls...)</p>
      <p className="pearls-compound-disclaimer">Compounding is set manually by the wallet holder and may not be accurate if they have not marked compounded purchases.</p>

      {/* Break-even */}
      <div className="pearls-break-even">
        <div className="pearls-be-mode-tabs" style={{ marginBottom: '0.35rem' }}>
          <span className="pearls-stat-label" style={{ marginRight: '0.5rem' }}>Calculate Break-Even:</span>
          <button type="button" className={`pearls-est-tab${breakEvenMode === 'fiat' ? ' active' : ''}`} onClick={() => setBreakEvenMode('fiat')}>Fiat</button>
          <button type="button" className={`pearls-est-tab${breakEvenMode === 'pol' ? ' active' : ''}`} onClick={() => setBreakEvenMode('pol')}>POL EQ</button>
          <button type="button" className={`pearls-est-tab${breakEvenMode === 'eth' ? ' active' : ''}`} onClick={() => setBreakEvenMode('eth')}>ETH EQ</button>
        </div>
        <div className="pearls-break-even-header">
          <span className="pearls-stat-label">
            Current Break-even Progress{breakEvenMode !== 'fiat' ? ` (${breakEvenMode === 'pol' ? 'POL EQ' : 'ETH EQ'})` : ''}
          </span>
          <div className="pearls-break-even-right">
            <span className="pearls-break-even-est">
              <span className="pearls-label-current">Linear</span>: {breakEven.toFixed(1)}% &middot; {monthsLabel(monthsAsIs)}
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
      <YieldCalculator
        currentBoosters={stats.total_boosters}
        effectiveApr={stats.effective_apr}
        holdingsUsd={holdingsUsd}
        totalSpentUsd={spentExclCompUsd}
        totalEarnedUsd={stats.total_earned_usd}
        polPrice={polPrice}
        ethPrice={ethPrice}
        breakEvenMode={breakEvenMode}
        holdingsNativePol={combinedHoldingsPol}
        totalSpentNativePol={combinedSpentPol}
        totalEarnedNativePol={combinedEarnedPol}
        holdingsNativeEth={combinedHoldingsEth}
        totalSpentNativeEth={combinedSpentEth}
        totalEarnedNativeEth={combinedEarnedEth}
      />
    </div>
  );
}
