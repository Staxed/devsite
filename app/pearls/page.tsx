import { createClient } from '@/lib/supabase/server';
import type { WalletStats } from '@/lib/pearls/types';
import ConnectButton from '@/components/pearls/connect-button';
import PearlsLeaderboardView from '@/components/pearls/pearls-leaderboard-view';
import { getCurrentPrice } from '@/lib/pearls/coingecko';

export default async function PearlsPage() {
  const supabase = await createClient();

  const [{ data: wallets }, { data: labelRows }, polPrice, ethPrice] = await Promise.all([
    supabase
      .from('wallet_stats')
      .select('*')
      .order('total_spent_excluding_compounded_usd', { ascending: false }),
    supabase.from('wallet_labels').select('address, label, is_fc'),
    getCurrentPrice('POL').catch(() => 0.25),
    getCurrentPrice('ETH').catch(() => 2500),
  ]);

  const walletLabels: Record<string, string> = {};
  const fcAddresses: string[] = [];
  for (const row of labelRows ?? []) {
    walletLabels[row.address.toLowerCase()] = row.label;
    if (row.is_fc) fcAddresses.push(row.address.toLowerCase());
  }

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
        polPrice={polPrice}
        ethPrice={ethPrice}
        walletLabels={walletLabels}
        fcAddresses={fcAddresses}
      />
    </div>
  );
}
