'use client';

import type { WalletStats, PeriodWalletStats, TimePeriod, CollectionStat, ContractInfo } from '@/lib/pearls/types';
import Leaderboard from './leaderboard';

interface Props {
  wallets: WalletStats[];
  polPrice: number;
  ethPrice: number;
  walletLabels: Record<string, string>;
  fcAddresses: string[];
  periodData: Record<Exclude<TimePeriod, 'all'>, PeriodWalletStats[]>;
  collectionData: CollectionStat[];
  contracts: ContractInfo[];
}

export default function PearlsLeaderboardView({ wallets, polPrice, ethPrice, walletLabels, fcAddresses, periodData, collectionData, contracts }: Props) {
  return (
    <section className="pearls-content">
      <Leaderboard wallets={wallets} polPrice={polPrice} ethPrice={ethPrice} walletLabels={walletLabels} fcAddresses={fcAddresses} periodData={periodData} collectionData={collectionData} contracts={contracts} />
    </section>
  );
}
