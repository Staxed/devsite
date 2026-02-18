import type { SupportedCurrency, Chain, ContractType } from './config';

export interface Contract {
  id: string;
  chain: Chain;
  address: string;
  name: string;
  type: ContractType;
  created_at: string;
}

export interface SellerWallet {
  id: string;
  address: string;
  label: string;
  created_at: string;
}

export interface PayoutWallet {
  id: string;
  address: string;
  label: string;
  created_at: string;
}

export interface NftTransfer {
  id: string;
  contract_id: string;
  tx_hash: string;
  log_index: number;
  block_number: number;
  from_address: string;
  to_address: string;
  token_id: string;
  quantity: number;
  is_purchase: boolean;
  native_value: number | null;
  native_currency: string | null;
  usd_value: number | null;
  is_compounded: boolean;
  timestamp: string;
  created_at: string;
}

export interface PayoutTransfer {
  id: string;
  payout_wallet_id: string;
  to_address: string;
  amount: number;
  native_currency: string;
  usd_value: number | null;
  tx_hash: string;
  block_number: number;
  timestamp: string;
  created_at: string;
}

export interface TokenMetadata {
  id: string;
  contract_id: string;
  token_id: string;
  name: string;
  intrinsic_value: number;
  currency: string;
  created_at: string;
}

export interface PriceCache {
  id: string;
  token: string;
  date: string;
  usd_price: number;
  created_at: string;
}

export interface SyncCursor {
  id: string;
  contract_id: string;
  cursor: string | null;
  last_block: number;
  completed: boolean;
  updated_at: string;
}

export interface WalletStats {
  wallet_address: string;
  total_pearls: number;
  total_boosters: number;
  pol_pearls: number;
  eth_pearls: number;
  total_spent_usd: number;
  total_spent_excluding_compounded_usd: number;
  total_spent_pol: number;
  total_spent_eth: number;
  total_booster_spent_pol: number;
  holdings_pol_value: number;
  holdings_eth_value: number;
  total_earned_usd: number;
  total_earned_pol: number;
  total_earned_eth: number;
  effective_apr: number;
  net_position_usd: number;
  net_pol: number;
  net_eth: number;
}

export interface SessionPayload {
  address: string;
  chainId: number;
  iat: number;
  exp: number;
}

export interface PearlsAuthSession {
  address: string;
  chainId: number;
}

export interface MoralisErc1155Transfer {
  transaction_hash: string;
  log_index: number;
  block_number: string;
  block_timestamp: string;
  from_address: string;
  to_address: string;
  token_id: string;
  amount: string;
  value: string;
  contract_address: string;
}

export interface MoralisNativeTransfer {
  transaction_hash: string;
  block_number: string;
  block_timestamp: string;
  from_address: string;
  to_address: string;
  value: string;
}

export interface MoralisWebhookBody {
  confirmed: boolean;
  chainId: string;
  tag: string;
  erc1155Transfers?: MoralisErc1155Transfer[];
  nativeTransfers?: MoralisNativeTransfer[];
  block: {
    number: string;
    timestamp: string;
  };
}

export interface BackfillStatus {
  contract: string;
  chain: string;
  completed: boolean;
  lastBlock: number;
  hasMore: boolean;
}

export interface CurrencyRates {
  EUR: number;
  GBP: number;
  CAD: number;
}

export interface WalletHoldings {
  pearls: { chain: Chain; contractName: string; tokenId: string; quantity: number }[];
  boosters: { tokenId: string; quantity: number }[];
  totalPearlCount: number;
  totalBoosterCount: number;
}

export interface PayoutEstimate {
  monthlyUsd: number;
  yearlyNoCompoundUsd: number;
  yearlyMaxCompoundUsd: number;
}
