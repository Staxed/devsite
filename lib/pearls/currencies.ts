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

export function formatNative(amount: number, currency: string): string {
  if (currency === 'ETH') {
    return `${amount.toFixed(6)} ETH`;
  }
  return `${amount.toFixed(2)} ${currency}`;
}
