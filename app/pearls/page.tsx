import { createClient } from '@/lib/supabase/server';
import type { WalletStats, PeriodWalletStats, CollectionStat, ContractInfo } from '@/lib/pearls/types';
import ConnectButton from '@/components/pearls/connect-button';
import PearlsLeaderboardView from '@/components/pearls/pearls-leaderboard-view';
import { getCurrentPrice, getLatestCachedPrice } from '@/lib/pearls/coingecko';
import { getWeekStart, getMonthStart, getQuarterStart, getYearStart } from '@/lib/pearls/periods';

export default async function PearlsPage() {
  const supabase = await createClient();

  const [{ data: wallets }, { data: labelRows }, polPrice, ethPrice] = await Promise.all([
    supabase
      .from('wallet_stats')
      .select('*')
      .order('total_spent_excluding_compounded_usd', { ascending: false }),
    supabase.from('wallet_labels').select('address, label, is_fc'),
    getCurrentPrice('POL').catch(() => getLatestCachedPrice('POL')).catch(() => 0),
    getCurrentPrice('ETH').catch(() => getLatestCachedPrice('ETH')).catch(() => 0),
  ]);

  const walletLabels: Record<string, string> = {};
  const fcAddresses: string[] = [];
  for (const row of labelRows ?? []) {
    walletLabels[row.address.toLowerCase()] = row.label;
    if (row.is_fc) fcAddresses.push(row.address.toLowerCase());
  }

  const now = new Date().toISOString();
  const safePeriodRpc = async (start: string): Promise<PeriodWalletStats[]> => {
    try {
      const { data, error } = await supabase.rpc('wallet_stats_for_period', { p_start: start, p_end: now });
      if (error) return [];
      return (data as PeriodWalletStats[]) ?? [];
    } catch {
      return [];
    }
  };

  const [weeklyData, monthlyData, quarterlyData, yearlyData] = await Promise.all([
    safePeriodRpc(getWeekStart()),
    safePeriodRpc(getMonthStart()),
    safePeriodRpc(getQuarterStart()),
    safePeriodRpc(getYearStart()),
  ]);

  const periodData = {
    weekly: weeklyData,
    monthly: monthlyData,
    quarterly: quarterlyData,
    yearly: yearlyData,
  };

  const [{ data: collectionRows }, { data: contractRows }] = await Promise.all([
    supabase.rpc('wallet_collection_stats'),
    supabase.from('contracts').select('id, name, type').order('type', { ascending: false }).order('name'),
  ]);

  const collectionData: CollectionStat[] = (collectionRows as CollectionStat[]) ?? [];
  const contracts: ContractInfo[] = (contractRows as ContractInfo[]) ?? [];

  return (
    <div className="pearls-page">
      <header className="pearls-header">
        <div>
          <h1><span className="gradient-text">SeaLaife Pearls</span> Tracker</h1>
          <p className="pearls-intro">
            SeaLife Pearls, by{' '}
            <a href="https://fishandchipscrypto.com" target="_blank" rel="noopener noreferrer">Fish &amp; Chips Crypto</a>,
            is a yield-earning NFT project with more than 18 months on record of constantly meeting
            their payout goals of 12%+ APR.<br />
            Learn more about them via their{' '}
            <a href="https://discord.gg/fishandchipsgg" target="_blank" rel="noopener noreferrer">Discord</a>,{' '}
            <a href="https://x.com/FishnChipsgg" target="_blank" rel="noopener noreferrer">on X</a>,{' '}
            or during their Sunday Game Night streams on{' '}
            <a href="https://twitch.tv/fishandchipsgg" target="_blank" rel="noopener noreferrer">Twitch</a>.{' '}<br />
            <a href="https://aeonforge.io" target="_blank" rel="noopener noreferrer">Aeon Forge</a>, and myself by association, are proud partners of this amazing project.
          </p>
          <p className="pearls-subtitle">
            You can use this DApp to track your own SeaLaife Pearl holdings, payouts, compounding, and ROI...as well
            as see the stats of any holding wallet.<br />If you login with your wallet, you will have the ability to
            mark purchases as "compounded" via the wallet details view.
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
        periodData={periodData}
        collectionData={collectionData}
        contracts={contracts}
      />
    </div>
  );
}
