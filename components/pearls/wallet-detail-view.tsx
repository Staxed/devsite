'use client';

import { useState } from 'react';
import type { WalletStats, NftTransfer, PayoutTransfer, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import WalletSummary from './wallet-summary';
import PurchaseTable, { type TokenNameMap } from './purchase-table';
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
}

export default function WalletDetailView({ stats, purchases, sales, payouts, inventory, rates, polPrice, ethPrice, tokenNames }: Props) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'purchases' | 'sales' | 'payouts'>('inventory');
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');

  return (
    <section className="pearls-content">
      <div className="pearls-toolbar">
        <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        <CurrencySelector value={currency} onChange={setCurrency} />
      </div>
      <WalletSummary stats={stats} rates={rates} polPrice={polPrice} ethPrice={ethPrice} currency={currency} />
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
          <PurchaseTable purchases={purchases} tokenNames={tokenNames} />
        ) : activeTab === 'sales' ? (
          <SalesTable sales={sales} tokenNames={tokenNames} />
        ) : (
          <PayoutTable payouts={payouts} currency={currency} rates={rates} />
        )}
      </div>
    </section>
  );
}
