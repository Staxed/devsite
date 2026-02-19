'use client';

import { useState } from 'react';
import type { WalletStats, NftTransfer, PayoutTransfer, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import WalletSummary from './wallet-summary';
import PurchaseTable from './purchase-table';
import type { TokenNameMap } from '@/lib/pearls/token-names';
import SalesTable from './sales-table';
import InventoryTable, { type InventoryItem } from './inventory-table';
import PayoutTable from './payout-table';
import CurrencySelector from './currency-selector';

interface Props {
  stats: WalletStats;
  purchases: NftTransfer[];
  sales: NftTransfer[];
  payouts: PayoutTransfer[];
  inventory: InventoryItem[];
  rates: CurrencyRates;
  polPrice: number;
  ethPrice: number;
  tokenNames: TokenNameMap;
  isOwner: boolean;
}

export default function WalletDetailView({ stats, purchases: initialPurchases, sales, payouts, inventory, rates, polPrice, ethPrice, tokenNames, isOwner }: Props) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'purchases' | 'sales' | 'payouts'>('inventory');
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [purchases, setPurchases] = useState(initialPurchases);

  // Compute compounded totals from current purchase state (live updates on toggle)
  let compoundedPol = 0;
  let compoundedEth = 0;
  let compoundedUsd = 0;
  for (const p of purchases) {
    if (p.is_compounded) {
      if (p.native_value != null) {
        if (p.native_currency === 'POL') compoundedPol += p.native_value;
        else if (p.native_currency === 'ETH') compoundedEth += p.native_value;
      }
      if (p.usd_value != null) compoundedUsd += p.usd_value;
    }
  }

  function onCompoundToggle(transferId: string) {
    setPurchases((prev) =>
      prev.map((p) =>
        p.id === transferId ? { ...p, is_compounded: !p.is_compounded } : p
      )
    );
  }

  return (
    <section className="pearls-content">
      <div className="pearls-toolbar">
        <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        <CurrencySelector value={currency} onChange={setCurrency} />
      </div>
      <WalletSummary stats={stats} rates={rates} polPrice={polPrice} ethPrice={ethPrice} currency={currency} compoundedPol={compoundedPol} compoundedEth={compoundedEth} compoundedUsd={compoundedUsd} />
      <div className="pearls-tabs">
        <button
          type="button"
          className={`pearls-tab ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          Inventory ({inventory.length})
        </button>
        <button
          type="button"
          className={`pearls-tab ${activeTab === 'purchases' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          Purchases ({purchases.length})
        </button>
        <button
          type="button"
          className={`pearls-tab ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          Sales ({sales.length})
        </button>
        <button
          type="button"
          className={`pearls-tab ${activeTab === 'payouts' ? 'active' : ''}`}
          onClick={() => setActiveTab('payouts')}
        >
          Payouts ({payouts.length})
        </button>
      </div>
      <div className="pearls-tab-content">
        {activeTab === 'inventory' ? (
          <InventoryTable inventory={inventory} polPrice={polPrice} ethPrice={ethPrice} currency={currency} rates={rates} />
        ) : activeTab === 'purchases' ? (
          <PurchaseTable purchases={purchases} tokenNames={tokenNames} isOwner={isOwner} onCompoundToggle={onCompoundToggle} />
        ) : activeTab === 'sales' ? (
          <SalesTable sales={sales} tokenNames={tokenNames} />
        ) : (
          <PayoutTable payouts={payouts} currency={currency} rates={rates} />
        )}
      </div>
    </section>
  );
}
