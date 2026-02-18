export const APR_CONFIG = {
  baseApr: 12,
  boostPerNft: 0.5,
  maxBoosters: 16,
  maxApr: 20,
} as const;

export const MIN_PEARL_PRICES = {
  polygon: { amount: 10, currency: 'POL' },
  base: { amount: 0.00075, currency: 'ETH' },
} as const;

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export type ContractType = 'pearl' | 'booster';
export type Chain = 'polygon' | 'base';

export type BreakEvenMode = 'fiat' | 'pol' | 'eth';

export const ESTIMATE_CONFIGS = [
  { key: 'monthly', label: 'Monthly', months: 1, compound: false },
  { key: 'yearly', label: 'Yearly', months: 12, compound: false },
  { key: 'compound', label: 'Yearly Compound', months: 12, compound: true, years: 1 },
  { key: 'compound2', label: '2 Year Compound', months: 24, compound: true, years: 2 },
  { key: 'compound3', label: '3 Year Compound', months: 36, compound: true, years: 3 },
  { key: 'compound4', label: '4 Year Compound', months: 48, compound: true, years: 4 },
  { key: 'compound5', label: '5 Year Compound', months: 60, compound: true, years: 5 },
  { key: 'compound10', label: '10 Year Compound', months: 120, compound: true, years: 10 },
  { key: 'compound20', label: '20 Year Compound', months: 240, compound: true, years: 20 },
] as const;

export type EstimateTab = (typeof ESTIMATE_CONFIGS)[number]['key'];
