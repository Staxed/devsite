import { APR_CONFIG, MIN_PEARL_PRICES } from './config';

export function calculateAPR(boosterCount: number): number {
  const boost = Math.min(boosterCount * APR_CONFIG.boostPerNft, APR_CONFIG.maxApr - APR_CONFIG.baseApr);
  return APR_CONFIG.baseApr + boost;
}

export function calculateBreakEven(totalNewMoneySpent: number, totalEarned: number): number {
  if (totalNewMoneySpent <= 0) return 100;
  const pct = (totalEarned / totalNewMoneySpent) * 100;
  return Math.min(pct, 100);
}

export function calculateMonthsToBreakEven(
  totalNewMoneySpentUsd: number,
  totalEarnedUsd: number,
  monthlyPayoutUsd: number
): number | null {
  if (totalNewMoneySpentUsd <= 0) return 0;
  const remaining = totalNewMoneySpentUsd - totalEarnedUsd;
  if (remaining <= 0) return 0;
  if (monthlyPayoutUsd <= 0) return null; // can't break even with no income
  return Math.ceil(remaining / monthlyPayoutUsd);
}

export function calculateCompoundMonthsToBreakEven(
  totalSpentUsd: number,
  totalEarnedUsd: number,
  holdingsValueUsd: number,
  apr: number,
  polPriceUsd: number,
  ethPriceUsd: number
): number | null {
  if (totalSpentUsd <= 0) return 0;
  let remaining = totalSpentUsd - totalEarnedUsd;
  if (remaining <= 0) return 0;
  if (apr <= 0) return null;

  const minPearlCostPolygonUsd = MIN_PEARL_PRICES.polygon.amount * polPriceUsd;
  const minPearlCostBaseUsd = MIN_PEARL_PRICES.base.amount * ethPriceUsd;
  const minPearlCostUsd = Math.min(minPearlCostPolygonUsd, minPearlCostBaseUsd);
  if (minPearlCostUsd <= 0) return null;

  let holdingsValue = holdingsValueUsd;
  let cumEarned = totalEarnedUsd;
  let carryover = 0;
  const maxMonths = 240; // 20 year cap

  for (let month = 0; month < maxMonths; month++) {
    const monthPayout = (holdingsValue * (apr / 100)) / 12;
    cumEarned += monthPayout;
    remaining = totalSpentUsd - cumEarned;
    if (remaining <= 0) return month + 1;

    // Compound: buy pearls with payout
    const available = monthPayout + carryover;
    const pearlsToBuy = Math.floor(available / minPearlCostUsd);
    const spent = pearlsToBuy * minPearlCostUsd;
    carryover = available - spent;
    holdingsValue += spent;
  }

  return null; // won't break even within 20 years
}

export function calculateMonthlyPayout(holdingsValueUsd: number, apr: number): number {
  return (holdingsValueUsd * (apr / 100)) / 12;
}

export function calculateYearlyNoCompound(monthlyPayout: number): number {
  return monthlyPayout * 12;
}

export function calculateYearlyMaxCompound(
  monthlyPayoutUsd: number,
  currentHoldingsValueUsd: number,
  apr: number,
  polPriceUsd: number,
  ethPriceUsd: number,
  years: number = 1
): number {
  const minPearlCostPolygonUsd = MIN_PEARL_PRICES.polygon.amount * polPriceUsd;
  const minPearlCostBaseUsd = MIN_PEARL_PRICES.base.amount * ethPriceUsd;
  const minPearlCostUsd = Math.min(minPearlCostPolygonUsd, minPearlCostBaseUsd);

  if (minPearlCostUsd <= 0) return monthlyPayoutUsd * 12 * years;

  let totalEarned = 0;
  let holdingsValue = currentHoldingsValueUsd;
  let carryover = 0;
  const totalMonths = 12 * years;

  for (let month = 0; month < totalMonths; month++) {
    const monthPayout = (holdingsValue * (apr / 100)) / 12;
    totalEarned += monthPayout;

    const available = monthPayout + carryover;
    const pearlsToBuy = Math.floor(available / minPearlCostUsd);
    const spent = pearlsToBuy * minPearlCostUsd;
    carryover = available - spent;
    holdingsValue += spent;
  }

  return totalEarned;
}

export function calculateYearlyMaxCompoundNative(
  holdingsNative: number,
  apr: number,
  minPearlCostNative: number,
  years: number = 1
): number {
  if (minPearlCostNative <= 0) return (holdingsNative * (apr / 100)) * years;

  let totalEarned = 0;
  let holdings = holdingsNative;
  let carryover = 0;
  const totalMonths = 12 * years;

  for (let month = 0; month < totalMonths; month++) {
    const monthPayout = (holdings * (apr / 100)) / 12;
    totalEarned += monthPayout;

    const available = monthPayout + carryover;
    const pearlsToBuy = Math.floor(available / minPearlCostNative);
    const spent = pearlsToBuy * minPearlCostNative;
    carryover = available - spent;
    holdings += spent;
  }

  return totalEarned;
}

export function calculateCompoundMonthsToBreakEvenNative(
  totalSpentNative: number,
  totalEarnedNative: number,
  holdingsNative: number,
  apr: number,
  minPearlCostNative: number
): number | null {
  if (totalSpentNative <= 0) return 0;
  let remaining = totalSpentNative - totalEarnedNative;
  if (remaining <= 0) return 0;
  if (apr <= 0) return null;
  if (minPearlCostNative <= 0) return null;

  let holdings = holdingsNative;
  let cumEarned = totalEarnedNative;
  let carryover = 0;
  const maxMonths = 240;

  for (let month = 0; month < maxMonths; month++) {
    const monthPayout = (holdings * (apr / 100)) / 12;
    cumEarned += monthPayout;
    remaining = totalSpentNative - cumEarned;
    if (remaining <= 0) return month + 1;

    const available = monthPayout + carryover;
    const pearlsToBuy = Math.floor(available / minPearlCostNative);
    const spent = pearlsToBuy * minPearlCostNative;
    carryover = available - spent;
    holdings += spent;
  }

  return null;
}

export function findOptimalBoostersNative(
  totalSpentNative: number,
  totalEarnedNative: number,
  holdingsNative: number,
  minPearlCostNative: number,
  currentBoosters: number,
  boosterCostNative: number,
  targetMultiplier: number,
): { optimal: number; minRange: number; maxRange: number } {
  let bestMonths = Infinity;
  let optimal = currentBoosters;
  const results: { boosters: number; months: number | null }[] = [];

  for (let b = 0; b <= APR_CONFIG.maxBoosters; b++) {
    const apr = calculateAPR(b);
    const additionalCost = Math.max(0, b - currentBoosters) * boosterCostNative;
    const adjustedSpent = totalSpentNative * targetMultiplier + additionalCost;
    const months = calculateCompoundMonthsToBreakEvenNative(
      adjustedSpent,
      totalEarnedNative,
      holdingsNative,
      apr,
      minPearlCostNative,
    );
    results.push({ boosters: b, months });
    if (months !== null && months < bestMonths) {
      bestMonths = months;
      optimal = b;
    }
  }

  const validRange = results
    .filter((r) => r.months !== null && r.months <= bestMonths * 1.02)
    .map((r) => r.boosters);

  return {
    optimal,
    minRange: validRange.length > 0 ? Math.min(...validRange) : optimal,
    maxRange: validRange.length > 0 ? Math.max(...validRange) : optimal,
  };
}

/**
 * Brute-force 0–16 boosters to find the count that minimises months-to-target
 * using the compound model. Returns optimal count and a near-optimal range.
 */
export function findOptimalBoosters(
  totalSpentUsd: number,
  totalEarnedUsd: number,
  holdingsValueUsd: number,
  polPriceUsd: number,
  ethPriceUsd: number,
  currentBoosters: number,
  boosterCostPol: number,
  targetMultiplier: number,
): { optimal: number; minRange: number; maxRange: number } {
  let bestMonths = Infinity;
  let optimal = currentBoosters;
  const results: { boosters: number; months: number | null }[] = [];

  for (let b = 0; b <= APR_CONFIG.maxBoosters; b++) {
    const apr = calculateAPR(b);
    const additionalCost = Math.max(0, b - currentBoosters) * boosterCostPol * polPriceUsd;
    const adjustedSpent = totalSpentUsd * targetMultiplier + additionalCost;
    const months = calculateCompoundMonthsToBreakEven(
      adjustedSpent,
      totalEarnedUsd,
      holdingsValueUsd,
      apr,
      polPriceUsd,
      ethPriceUsd,
    );
    results.push({ boosters: b, months });
    if (months !== null && months < bestMonths) {
      bestMonths = months;
      optimal = b;
    }
  }

  // Near-optimal range: within 2% of best
  const validRange = results
    .filter((r) => r.months !== null && r.months <= bestMonths * 1.02)
    .map((r) => r.boosters);

  return {
    optimal,
    minRange: validRange.length > 0 ? Math.min(...validRange) : optimal,
    maxRange: validRange.length > 0 ? Math.max(...validRange) : optimal,
  };
}
