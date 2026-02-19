import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/pearls/supabase-admin';
import { verifySession } from '@/lib/pearls/auth';
import { getFiatRates, getCurrentPrice, getLatestCachedPrice, getLatestCachedRates } from '@/lib/pearls/coingecko';
import type { WalletStats, NftTransfer, PayoutTransfer, CurrencyRates } from '@/lib/pearls/types';
import ConnectButton from '@/components/pearls/connect-button';
import UserDashboard from '@/components/pearls/user-dashboard';
import DashboardPurchases from '@/components/pearls/dashboard-purchases';

export const runtime = 'edge';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('pearls-session')?.value;

  if (!token) {
    redirect('/pearls');
  }

  const session = await verifySession(token);
  if (!session) {
    redirect('/pearls');
  }

  const address = session.address.toLowerCase();
  const supabase = await createClient();
  const serviceDb = getServiceClient();

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

  const queryErrors = [purchasesResult, payoutsResult]
    .map(r => r.error)
    .filter(Boolean);
  if (statsResult.error && statsResult.error.code !== 'PGRST116') {
    queryErrors.push(statsResult.error);
  }
  if (queryErrors.length > 0) {
    console.error('Dashboard query errors:', queryErrors.map(e => e!.message));
  }

  const statsDbError = !!(statsResult.error && statsResult.error.code !== 'PGRST116');

  const stats = statsResult.data as WalletStats | null;
  const purchases = (purchasesResult.data as NftTransfer[]) ?? [];
  const payouts = (payoutsResult.data as PayoutTransfer[]) ?? [];

  let rates: CurrencyRates;
  let polPrice: number;
  let ethPrice: number;
  try {
    [rates, polPrice, ethPrice] = await Promise.all([
      getFiatRates(serviceDb),
      getCurrentPrice('POL', serviceDb),
      getCurrentPrice('ETH', serviceDb),
    ]);
  } catch {
    [rates, polPrice, ethPrice] = await Promise.all([
      getLatestCachedRates(serviceDb),
      getLatestCachedPrice('POL', serviceDb),
      getLatestCachedPrice('ETH', serviceDb),
    ]);
  }

  if (statsDbError) {
    return (
      <div className="pearls-page">
        <header className="pearls-header">
          <div>
            <h1><span className="gradient-text">Dashboard</span></h1>
            <p className="pearls-subtitle">Something went wrong.</p>
          </div>
          <ConnectButton />
        </header>
        <div className="pearls-content">
          <p className="pearls-empty">
            We encountered an error loading your dashboard. Please try again later.
          </p>
          <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="pearls-page">
        <header className="pearls-header">
          <div>
            <h1><span className="gradient-text">Dashboard</span></h1>
            <p className="pearls-subtitle">No data found for your wallet yet.</p>
          </div>
          <ConnectButton />
        </header>
        <div className="pearls-content">
          <p className="pearls-empty">
            Your wallet ({address}) has no Pearl purchases or payouts recorded yet.
            Data will appear after your first transaction is processed.
          </p>
          <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="pearls-page">
      <header className="pearls-header">
        <div>
          <h1><span className="gradient-text">Dashboard</span></h1>
          <p className="pearls-subtitle pearls-address">{address}</p>
        </div>
        <ConnectButton />
      </header>
      <div className="pearls-content">
        <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        <UserDashboard
          stats={stats}
          purchases={purchases}
          payouts={payouts}
          rates={rates}
          polPrice={polPrice}
          ethPrice={ethPrice}
        />
        <DashboardPurchases purchases={purchases} rates={rates} />
      </div>
    </div>
  );
}
