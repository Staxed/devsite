export const PEARL_CONTRACTS = [
  { chain: 'polygon', address: '0x_PLACEHOLDER', name: 'Pearls Collection 1', type: 'pearl' as const },
  { chain: 'polygon', address: '0x_PLACEHOLDER', name: 'Pearls Collection 2', type: 'pearl' as const },
  { chain: 'base', address: '0x_PLACEHOLDER', name: 'Pearls Base', type: 'pearl' as const },
  { chain: 'polygon', address: '0x_PLACEHOLDER', name: 'Boosters', type: 'booster' as const },
] as const;

export const SELLER_WALLETS = [
  { address: '0x_PLACEHOLDER', label: 'Main Seller Wallet' },
] as const;

export const PAYOUT_WALLETS = [
  { address: '0x_PLACEHOLDER', label: 'Main Payout Wallet' },
] as const;

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
