import { createClient } from '@/lib/supabase/server';
import type { WalletStats } from '@/lib/pearls/types';
import ConnectButton from '@/components/pearls/connect-button';
import PearlsLeaderboardView from '@/components/pearls/pearls-leaderboard-view';

export default async function PearlsPage() {
  const supabase = await createClient();

  const { data: wallets } = await supabase
    .from('wallet_stats')
    .select('*')
    .order('total_spent_usd', { ascending: false });

  return (
    <div className="pearls-page">
      <header className="pearls-header">
        <div>
          <h1><span className="gradient-text">Pearls</span> Tracker</h1>
          <p className="pearls-subtitle">
            Track Pearl NFT holdings, payouts, and ROI across Polygon and Base.
          </p>
        </div>
        <ConnectButton />
      </header>
      <PearlsLeaderboardView
        wallets={(wallets as WalletStats[]) ?? []}
      />
    </div>
  );
}
