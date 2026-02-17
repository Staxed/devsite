'use client';

import { useState } from 'react';
import type { WalletStats, NftTransfer, PayoutTransfer, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import WalletSummary from './wallet-summary';
import PurchaseTable from './purchase-table';
import PayoutTable from './payout-table';
import CurrencySelector from './currency-selector';

interface Props {
  stats: WalletStats;
  purchases: NftTransfer[];
  payouts: PayoutTransfer[];
  rates: CurrencyRates;
}

export default function WalletDetailView({ stats, purchases, payouts, rates }: Props) {
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');

  return (
    <section className="pearls-content">
      <div className="pearls-toolbar">
        <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        <CurrencySelector value={currency} onChange={setCurrency} />
      </div>
      <WalletSummary stats={stats} currency={currency} rates={rates} />
      <div className="pearls-section">
        <h2>Purchases</h2>
        <PurchaseTable purchases={purchases} currency={currency} rates={rates} />
      </div>
      <div className="pearls-section">
        <h2>Payouts</h2>
        <PayoutTable payouts={payouts} currency={currency} rates={rates} />
      </div>
    </section>
  );
}
