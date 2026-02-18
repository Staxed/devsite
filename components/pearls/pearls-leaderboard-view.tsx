import type { WalletStats, PeriodWalletStats, TimePeriod } from '@/lib/pearls/types';
import Leaderboard from './leaderboard';

interface Props {
  wallets: WalletStats[];
  polPrice: number;
  ethPrice: number;
  walletLabels: Record<string, string>;
  fcAddresses: string[];
  periodData: Record<Exclude<TimePeriod, 'all'>, PeriodWalletStats[]>;
}

export default function PearlsLeaderboardView({ wallets, polPrice, ethPrice, walletLabels, fcAddresses, periodData }: Props) {
  return (
    <section className="pearls-content">
      <Leaderboard wallets={wallets} polPrice={polPrice} ethPrice={ethPrice} walletLabels={walletLabels} fcAddresses={fcAddresses} periodData={periodData} />
    </section>
  );
}
