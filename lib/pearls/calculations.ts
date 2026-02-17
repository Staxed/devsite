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
  ethPriceUsd: number
): number {
  // 12-month forward projection where each month:
  // 1. Take payout amount
  // 2. Buy max cheapest Pearls possible (10 POL on Polygon or 0.00075 ETH on Base)
  // 3. Remainder carries to next month
  // 4. New Pearls increase next month's payout base

  const minPearlCostPolygonUsd = MIN_PEARL_PRICES.polygon.amount * polPriceUsd;
  const minPearlCostBaseUsd = MIN_PEARL_PRICES.base.amount * ethPriceUsd;

  // Use cheapest option
  const minPearlCostUsd = Math.min(minPearlCostPolygonUsd, minPearlCostBaseUsd);

  if (minPearlCostUsd <= 0) return monthlyPayoutUsd * 12;

  let totalEarned = 0;
  let holdingsValue = currentHoldingsValueUsd;
  let carryover = 0;

  for (let month = 0; month < 12; month++) {
    const monthPayout = (holdingsValue * (apr / 100)) / 12;
    totalEarned += monthPayout;

    // Try to buy Pearls with payout + carryover
    const available = monthPayout + carryover;
    const pearlsToBuy = Math.floor(available / minPearlCostUsd);
    const spent = pearlsToBuy * minPearlCostUsd;
    carryover = available - spent;

    // New Pearls increase holdings value
    holdingsValue += spent;
  }

  return totalEarned;
}
