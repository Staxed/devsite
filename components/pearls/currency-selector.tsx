'use client';

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/pearls/config';

interface CurrencySelectorProps {
  value: SupportedCurrency;
  onChange: (currency: SupportedCurrency) => void;
}

export default function CurrencySelector({ value, onChange }: CurrencySelectorProps) {
  return (
    <select
      className="pearls-currency-select"
      value={value}
      onChange={(e) => onChange(e.target.value as SupportedCurrency)}
      aria-label="Select display currency"
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}
