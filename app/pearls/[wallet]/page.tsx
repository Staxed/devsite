import { createClient } from '@/lib/supabase/server';
import { getFiatRates } from '@/lib/pearls/coingecko';
import type { WalletStats, NftTransfer, PayoutTransfer, CurrencyRates } from '@/lib/pearls/types';
import ConnectButton from '@/components/pearls/connect-button';
import WalletDetailView from '@/components/pearls/wallet-detail-view';

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function WalletPage({ params }: Props) {
  const { wallet } = await params;
  const address = wallet.toLowerCase();
  const supabase = await createClient();

  const [statsResult, purchasesResult, payoutsResult] = await Promise.all([
    supabase
      .from('wallet_stats')
      .select('*')
      .eq('wallet_address', address)
      .single(),
    supabase
      .from('nft_transfers')
      .select('*')
      .eq('to_address', address)
      .eq('is_purchase', true)
      .order('timestamp', { ascending: false }),
    supabase
      .from('payout_transfers')
      .select('*')
      .eq('to_address', address)
      .order('timestamp', { ascending: false }),
  ]);

  const stats = statsResult.data as WalletStats | null;
  const purchases = (purchasesResult.data as NftTransfer[]) ?? [];
  const payouts = (payoutsResult.data as PayoutTransfer[]) ?? [];

  let rates: CurrencyRates = { EUR: 0.92, GBP: 0.79, CAD: 1.36 };
  try {
    rates = await getFiatRates();
  } catch {
    // Use defaults
  }

  if (!stats) {
    return (
      <div className="pearls-page">
        <header className="pearls-header">
          <div>
            <h1><span className="gradient-text">Wallet</span> Not Found</h1>
            <p className="pearls-subtitle">No data found for this wallet address.</p>
          </div>
          <ConnectButton />
        </header>
        <div className="pearls-content">
          <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="pearls-page">
      <header className="pearls-header">
        <div>
          <h1><span className="gradient-text">Wallet</span> Details</h1>
          <p className="pearls-subtitle pearls-address">{address}</p>
        </div>
        <ConnectButton />
      </header>
      <WalletDetailView
        stats={stats}
        purchases={purchases}
        payouts={payouts}
        rates={rates}
      />
    </div>
  );
}
