import { createClient } from '@/lib/supabase/server';
import { getFiatRates } from '@/lib/pearls/coingecko';
import type { WalletStats, CurrencyRates } from '@/lib/pearls/types';
import ConnectButton from '@/components/pearls/connect-button';
import PearlsLeaderboardView from '@/components/pearls/pearls-leaderboard-view';

export default async function PearlsPage() {
  const supabase = await createClient();

  const { data: wallets } = await supabase
    .from('wallet_stats')
    .select('*')
    .order('total_spent_usd', { ascending: false });

  let rates: CurrencyRates = { EUR: 0.92, GBP: 0.79, CAD: 1.36 };
  try {
    rates = await getFiatRates();
  } catch {
    // Use defaults
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
        rates={rates}
      />
    </div>
  );
}
