'use client';

import { useState, useMemo } from 'react';
import {
  calculateAPR,
  calculateMonthsToBreakEven,
  calculateCompoundMonthsToBreakEven,
  calculateMonthlyPayout,
  findOptimalBoosters,
} from '@/lib/pearls/calculations';

interface YieldCalculatorProps {
  currentBoosters: number;
  effectiveApr: number;
  holdingsUsd: number;
  totalSpentUsd: number;
  totalEarnedUsd: number;
  polPrice: number;
  ethPrice: number;
}

function formatMonths(months: number | null): string {
  if (months === null) return 'N/A';
  if (months === 0) return 'Broken even!';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `~${months} months`;
  if (rem === 0) return `~${years} year${years > 1 ? 's' : ''}`;
  return `~${years}y ${rem}m`;
}

export default function YieldCalculator({
  currentBoosters,
  effectiveApr,
  holdingsUsd,
  totalSpentUsd,
  totalEarnedUsd,
  polPrice,
  ethPrice,
}: YieldCalculatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [boosterCount, setBoosterCount] = useState(currentBoosters);
  const [targetMultiplier, setTargetMultiplier] = useState(1);
  const [boosterCostPol, setBoosterCostPol] = useState(256);
  const [additionalPol, setAdditionalPol] = useState(0);
  const [additionalEth, setAdditionalEth] = useState(0);

  const results = useMemo(() => {
    const tm = targetMultiplier;
    const newApr = calculateAPR(boosterCount);
    const boosterCost = Math.max(0, boosterCount - currentBoosters) * boosterCostPol * polPrice;
    const additionalPolUsd = additionalPol * polPrice;
    const additionalEthUsd = additionalEth * ethPrice;
    const additionalInvestmentUsd = additionalPolUsd + additionalEthUsd;
    const effectiveHoldings = holdingsUsd + additionalInvestmentUsd;
    const effectiveSpent = totalSpentUsd + additionalInvestmentUsd;
    const adjustedSpent = effectiveSpent * tm + boosterCost;

    const newMonthlyPayout = calculateMonthlyPayout(effectiveHoldings, newApr);
    const linearMonths = calculateMonthsToBreakEven(adjustedSpent, totalEarnedUsd, newMonthlyPayout);
    const compoundMonths = calculateCompoundMonthsToBreakEven(
      adjustedSpent,
      totalEarnedUsd,
      effectiveHoldings,
      newApr,
      polPrice,
      ethPrice,
    );

    const { optimal, minRange, maxRange } = findOptimalBoosters(
      effectiveSpent,
      totalEarnedUsd,
      effectiveHoldings,
      polPrice,
      ethPrice,
      currentBoosters,
      boosterCostPol,
      tm,
    );

    const totalAdditionalCost = boosterCost + additionalInvestmentUsd;

    // Projected break-even percentages
    const currentPct = adjustedSpent > 0 ? Math.min((totalEarnedUsd / adjustedSpent) * 100, 100) : 100;
    let compoundPct = currentPct;
    if (linearMonths != null && compoundMonths != null && compoundMonths > 0 && linearMonths > 0) {
      compoundPct = Math.min(100, currentPct * (linearMonths / compoundMonths));
    } else if (compoundMonths === 0) {
      compoundPct = 100;
    }

    return { newApr, boosterCost, additionalInvestmentUsd, totalAdditionalCost, linearMonths, compoundMonths, optimal, currentPct, compoundPct };
  }, [boosterCount, boosterCostPol, targetMultiplier, additionalPol, additionalEth, currentBoosters, holdingsUsd, totalSpentUsd, totalEarnedUsd, polPrice, ethPrice]);

  const { newApr, boosterCost, additionalInvestmentUsd, totalAdditionalCost, linearMonths, compoundMonths, optimal, currentPct, compoundPct } = results;
  const aprChanged = newApr !== effectiveApr;

  return (
    <div>
      {expanded && (
        <div className="pearls-break-even" style={{ marginBottom: '0.5rem' }}>
          <div className="pearls-break-even-header">
            <span className="pearls-stat-label">Projected Break-even (based on Yield Calculator)</span>
            <div className="pearls-break-even-right">
              <span className="pearls-break-even-est">
                <span className="pearls-label-current">Linear</span>: {currentPct.toFixed(1)}% &middot; {formatMonths(linearMonths)}
              </span>
              <span className="pearls-break-even-est">
                <span className="pearls-label-compound">Compound</span>: {compoundPct.toFixed(1)}% &middot; {formatMonths(compoundMonths)}
              </span>
            </div>
          </div>
          <div className="pearls-meter-track">
            <div
              className="pearls-meter-fill-compound"
              style={{ width: `${Math.min(compoundPct, 100)}%` }}
              aria-hidden="true"
            />
            <div
              className="pearls-meter-fill-current"
              style={{ width: `${Math.min(currentPct, 100)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(currentPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Projected break-even progress: ${Math.round(currentPct)}%`}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        className="pearls-calc-toggle"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className="pearls-calc-chevron">{expanded ? '▾' : '▸'}</span>
        Yield Calculator
      </button>

      {expanded && (
        <div className="pearls-calc-body">
          <div className="pearls-calc-inputs">
            <label className="pearls-calc-field">
              Add POL:
              <input
                type="number"
                min={0}
                value={additionalPol || ''}
                placeholder="0"
                onChange={e => setAdditionalPol(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <label className="pearls-calc-field">
              Add ETH:
              <input
                type="number"
                min={0}
                step={0.001}
                value={additionalEth || ''}
                placeholder="0"
                onChange={e => setAdditionalEth(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <label className="pearls-calc-field">
              Boosters:
              <input
                type="number"
                min={0}
                max={16}
                value={boosterCount}
                onChange={e => setBoosterCount(Math.max(0, Math.min(16, Number(e.target.value))))}
              />
            </label>
            <label className="pearls-calc-field">
              Cost per Booster:
              <input
                type="number"
                min={0}
                value={boosterCostPol}
                onChange={e => setBoosterCostPol(Math.max(0, Number(e.target.value)))}
              />
              <span>POL</span>
            </label>
            <label className="pearls-calc-field">
              <input
                type="checkbox"
                checked={targetMultiplier === 2}
                onChange={e => setTargetMultiplier(e.target.checked ? 2 : 1)}
              />
              Double My Money
            </label>
            <label className="pearls-calc-field">
              <input
                type="checkbox"
                checked={targetMultiplier === 3}
                onChange={e => setTargetMultiplier(e.target.checked ? 3 : 1)}
              />
              Triple My Money
            </label>
          </div>

          <div className="pearls-calc-results">
            <div className="pearls-calc-stat">
              <span className="pearls-calc-stat-label">Effective APR</span>
              <span className={`pearls-calc-stat-value${aprChanged ? ' highlight' : ''}`}>
                {newApr.toFixed(1)}%
              </span>
            </div>
            <div className="pearls-calc-stat">
              <span className="pearls-calc-stat-label">Additional Cost</span>
              <span className="pearls-calc-stat-value">
                {totalAdditionalCost > 0 ? `${Math.round(totalAdditionalCost / polPrice).toLocaleString()} POL` : '—'}
              </span>
              {totalAdditionalCost > 0 && (
                <span className="pearls-calc-stat-sub">
                  {additionalPol > 0 && `${additionalPol.toLocaleString()} POL`}
                  {additionalPol > 0 && additionalEth > 0 && ' + '}
                  {additionalEth > 0 && `${additionalEth} ETH`}
                  {(additionalPol > 0 || additionalEth > 0) && boosterCost > 0 && ' + '}
                  {boosterCost > 0 && `${Math.round(boosterCost / polPrice).toLocaleString()} Boosters`}
                </span>
              )}
            </div>
            <div className="pearls-calc-stat">
              <span className="pearls-calc-stat-label">Linear</span>
              <span className="pearls-calc-stat-value">{formatMonths(linearMonths)}</span>
            </div>
            <div className="pearls-calc-stat">
              <span className="pearls-calc-stat-label">Compound</span>
              <span className="pearls-calc-stat-value">{formatMonths(compoundMonths)}</span>
            </div>
            <div className="pearls-calc-stat">
              <span className="pearls-calc-stat-label">Optimal Boosters</span>
              <span className="pearls-calc-stat-value">{optimal}</span>
            </div>
            <div className="pearls-calc-stat">
              <span className="pearls-calc-stat-label">Target</span>
              <span className="pearls-calc-stat-value">
                {targetMultiplier}× investment{boosterCost > 0 ? ' + Boosters' : ''}
              </span>
            </div>
          </div>
          <p className="pearls-compound-disclaimer">Boosters mint has completed. Boosters are only available on the secondary market. Adjust the cost per Booster to reflect current market prices.</p>
          <p className="pearls-compound-disclaimer"><strong>Linear</strong> assumes steady monthly payouts with no reinvestment. <strong>Compound</strong> assumes all payouts are reinvested into new Pearls each month, increasing holdings and future yield.</p>
        </div>
      )}
    </div>
  );
}
