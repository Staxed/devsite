import type { WalletStats } from '@/lib/pearls/types';
import Leaderboard from './leaderboard';

interface Props {
  wallets: WalletStats[];
  polPrice: number;
  ethPrice: number;
  walletLabels: Record<string, string>;
  fcAddresses: string[];
}

export default function PearlsLeaderboardView({ wallets, polPrice, ethPrice, walletLabels, fcAddresses }: Props) {
  return (
    <section className="pearls-content">
      <Leaderboard wallets={wallets} polPrice={polPrice} ethPrice={ethPrice} walletLabels={walletLabels} fcAddresses={fcAddresses} />
    </section>
  );
}
