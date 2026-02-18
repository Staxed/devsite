'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import type { WalletStats, PeriodWalletStats, TimePeriod } from '@/lib/pearls/types';
import { formatNative } from '@/lib/pearls/currencies';

type SortKey = 'total_pearls' | 'pol_pearls' | 'eth_pearls' | 'total_boosters' | 'effective_apr' | 'pol_equiv' | 'compounded_pol_equiv';
type SortDir = 'asc' | 'desc';

interface LeaderboardProps {
  wallets: WalletStats[];
  polPrice: number;
  ethPrice: number;
  walletLabels: Record<string, string>;
  fcAddresses: string[];
  periodData: Record<Exclude<TimePeriod, 'all'>, PeriodWalletStats[]>;
}

interface LeaderboardRow {
  wallet: PeriodWalletStats;
  pol_equiv: number;
  compounded_pol_equiv: number;
}

export default function Leaderboard({ wallets, polPrice, ethPrice, walletLabels, fcAddresses, periodData }: LeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('pol_equiv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hideFc, setHideFc] = useState(true);
  const [activeTab, setActiveTab] = useState<TimePeriod>('all');
  const { address: connectedAddress } = useAccount();

  useEffect(() => {
    const stored = localStorage.getItem('pearls-hide-fc');
    if (stored !== null) setHideFc(stored === 'true');
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('pearls-leaderboard-tab');
    if (stored && ['weekly', 'monthly', 'quarterly', 'yearly', 'all'].includes(stored)) {
      setActiveTab(stored as TimePeriod);
    }
  }, []);

  const fcSet = useMemo(() => new Set(fcAddresses), [fcAddresses]);

  const ethToPolRatio = polPrice > 0 ? ethPrice / polPrice : 0;

  const activeWallets: PeriodWalletStats[] = activeTab === 'all' ? wallets : periodData[activeTab];

  const rows: LeaderboardRow[] = useMemo(
    () =>
      activeWallets.map((w) => ({
        wallet: w,
        pol_equiv:
          w.total_spent_excluding_compounded_pol +
          w.total_spent_excluding_compounded_eth * ethToPolRatio,
        compounded_pol_equiv:
          (w.total_compounded_pol ?? 0) +
          (w.total_compounded_eth ?? 0) * ethToPolRatio,
      })),
    [activeWallets, ethToPolRatio]
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function getValue(row: LeaderboardRow, key: SortKey): number {
    if (key === 'pol_equiv') return row.pol_equiv;
    if (key === 'compounded_pol_equiv') return row.compounded_pol_equiv;
    return row.wallet[key];
  }

  const filtered = hideFc
    ? rows.filter((r) => !fcSet.has(r.wallet.wallet_address.toLowerCase()))
    : rows;

  const sorted = [...filtered].sort((a, b) => {
    const aVal = getValue(a, sortKey);
    const bVal = getValue(b, sortKey);
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' \u25BC' : ' \u25B2';
  }

  function getDisplayName(addr: string): string {
    if (connectedAddress && addr.toLowerCase() === connectedAddress.toLowerCase()) {
      return 'Me';
    }
    return walletLabels[addr.toLowerCase()] ?? `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function isMe(addr: string): boolean {
    return !!connectedAddress && addr.toLowerCase() === connectedAddress.toLowerCase();
  }

  if (activeWallets.length === 0) {
    return (
      <div className="pearls-empty">
        <p>{activeTab !== 'all' ? 'No purchases in this period.' : 'No wallet data yet. Check back after the first backfill.'}</p>
      </div>
    );
  }

  return (
    <div className="pearls-leaderboard">
      <div className="pearls-toolbar">
        <h2>Leaderboards</h2>
      </div>
      <div className="pearls-tabs" role="tablist">
        {(['all', 'weekly', 'monthly', 'quarterly', 'yearly'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`pearls-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => {
              setActiveTab(tab);
              localStorage.setItem('pearls-leaderboard-tab', tab);
            }}
          >
            {tab === 'all' ? 'All Time' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <label className="pearls-fc-filter">
          <input
            type="checkbox"
            checked={hideFc}
            onChange={(e) => {
              setHideFc(e.target.checked);
              localStorage.setItem('pearls-hide-fc', String(e.target.checked));
            }}
          />
          Hide Fish &amp; Chips wallets
        </label>
      </div>
      <div className="pearls-table-wrap">
      <table className="pearls-table" role="table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Wallet</th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('total_pearls')}>
                Total Pearls{sortIndicator('total_pearls')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('pol_pearls')}>
                POL Pearls{sortIndicator('pol_pearls')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('eth_pearls')}>
                ETH Pearls{sortIndicator('eth_pearls')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('total_boosters')}>
                Boosters{sortIndicator('total_boosters')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('effective_apr')}>
                APR{sortIndicator('effective_apr')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('pol_equiv')}>
                Inv. (POL eq.){sortIndicator('pol_equiv')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('compounded_pol_equiv')}>
                Comp. (POL eq.){sortIndicator('compounded_pol_equiv')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const w = row.wallet;
            const me = isMe(w.wallet_address);
            const fc = fcSet.has(w.wallet_address.toLowerCase());
            const named = !me && !fc && !!walletLabels[w.wallet_address.toLowerCase()];
            const rowClass = me ? 'pearls-row-me' : fc ? 'pearls-row-fc' : named ? 'pearls-row-named' : '';
            const linkClass = me ? ' pearls-me' : fc ? ' pearls-fc-name' : named ? ' pearls-named' : '';
            return (
              <tr key={w.wallet_address} className={rowClass}>
                <td>{i + 1}</td>
                <td>
                  <a href={`/pearls/${w.wallet_address}`} className={`pearls-wallet-link${linkClass}`}>
                    {getDisplayName(w.wallet_address)}
                  </a>
                </td>
                <td>{w.total_pearls}</td>
                <td>{w.pol_pearls}</td>
                <td>{w.eth_pearls}</td>
                <td>{w.total_boosters}</td>
                <td>{w.effective_apr.toFixed(1)}%</td>
                <td>{Math.round(row.pol_equiv).toLocaleString()} POL</td>
                <td>{Math.round(row.compounded_pol_equiv).toLocaleString()} POL</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="pearls-compound-disclaimer">Compounding is set manually by the wallet holder and may not be accurate if they have not marked compounded purchases.</p>
      <div className="pearls-legend">
        <span><strong>Inv. (POL eq.)</strong> = Invested POL + ETH converted to equivalent POL value</span>
        <span><strong>Comp. (POL eq.)</strong> = Compounded POL + ETH converted to equivalent POL value</span>
      </div>
    </div>
  );
}
