import type { CurrencyRates } from './types';
import type { SupportedCurrency } from './config';

export function convertUsdTo(
  usdAmount: number,
  currency: SupportedCurrency,
  rates: CurrencyRates
): number {
  if (currency === 'USD') return usdAmount;
  const rate = rates[currency as keyof CurrencyRates];
  if (!rate) return usdAmount;
  return usdAmount * rate;
}

export function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    USD: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
    CAD: 'C$',
  };

  const symbol = symbols[currency] || currency;
  const absAmount = Math.abs(amount);
  const formatted = absAmount >= 1000
    ? absAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : absAmount.toFixed(2);

  return amount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, '');
}

export function formatNative(amount: number, currency: string): string {
  if (currency === 'ETH') {
    return `${trimTrailingZeros(amount.toFixed(10))} ETH`;
  }
  return `${trimTrailingZeros(amount.toFixed(5))} ${currency}`;
}

export function formatPol(n: number): string {
  return `${trimTrailingZeros(n.toFixed(5))} POL`;
}

export function formatEth(n: number): string {
  return `${trimTrailingZeros(n.toFixed(10))} ETH`;
}

export function formatMonths(months: number | null): string {
  if (months === null) return 'N/A';
  if (months === 0) return 'Broken even!';
  if (months === 1) return '~1 month';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `~${months} months`;
  if (rem === 0) return `~${years} year${years > 1 ? 's' : ''}`;
  return `~${years}y ${rem}m`;
}
