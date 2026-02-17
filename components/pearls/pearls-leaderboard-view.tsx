'use client';

import { useState } from 'react';
import type { WalletStats, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import Leaderboard from './leaderboard';
import CurrencySelector from './currency-selector';

interface Props {
  wallets: WalletStats[];
  rates: CurrencyRates;
}

export default function PearlsLeaderboardView({ wallets, rates }: Props) {
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');

  return (
    <section className="pearls-content">
      <div className="pearls-toolbar">
        <h2>Leaderboard</h2>
        <CurrencySelector value={currency} onChange={setCurrency} />
      </div>
      <Leaderboard wallets={wallets} currency={currency} rates={rates} />
    </section>
  );
}
