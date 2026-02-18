import type { WalletStats } from '@/lib/pearls/types';
import Leaderboard from './leaderboard';

interface Props {
  wallets: WalletStats[];
}

export default function PearlsLeaderboardView({ wallets }: Props) {
  return (
    <section className="pearls-content">
      <div className="pearls-toolbar">
        <h2>Leaderboard</h2>
      </div>
      <Leaderboard wallets={wallets} />
    </section>
  );
}
