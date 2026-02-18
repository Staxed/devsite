'use client';

import { useState } from 'react';
import type { WalletStats } from '@/lib/pearls/types';
import { formatNative } from '@/lib/pearls/currencies';

type SortKey = 'total_pearls' | 'total_spent_pol' | 'total_spent_eth' | 'total_earned_pol' | 'total_earned_eth' | 'net_pol' | 'net_eth' | 'effective_apr';
type SortDir = 'asc' | 'desc';

interface LeaderboardProps {
  wallets: WalletStats[];
}

export default function Leaderboard({ wallets }: LeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total_spent_pol');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...wallets].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' \u25BC' : ' \u25B2';
  }

  function truncateAddress(addr: string) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  if (wallets.length === 0) {
    return (
      <div className="pearls-empty">
        <p>No wallet data yet. Check back after the first backfill.</p>
      </div>
    );
  }

  return (
    <div className="pearls-table-wrap">
      <table className="pearls-table" role="table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Wallet</th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('total_pearls')}>
                Pearls{sortIndicator('total_pearls')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('total_spent_pol')}>
                POL Spent{sortIndicator('total_spent_pol')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('total_spent_eth')}>
                ETH Spent{sortIndicator('total_spent_eth')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('total_earned_pol')}>
                POL Earned{sortIndicator('total_earned_pol')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('total_earned_eth')}>
                ETH Earned{sortIndicator('total_earned_eth')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('net_pol')}>
                Net POL{sortIndicator('net_pol')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('net_eth')}>
                Net ETH{sortIndicator('net_eth')}
              </button>
            </th>
            <th scope="col">
              <button type="button" className="pearls-sort-btn" onClick={() => handleSort('effective_apr')}>
                APR{sortIndicator('effective_apr')}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((w, i) => (
            <tr key={w.wallet_address}>
              <td>{i + 1}</td>
              <td>
                <a href={`/pearls/${w.wallet_address}`} className="pearls-wallet-link">
                  {truncateAddress(w.wallet_address)}
                </a>
              </td>
              <td>{w.total_pearls}</td>
              <td>{formatNative(w.total_spent_pol, 'POL')}</td>
              <td>{w.total_spent_eth > 0 ? formatNative(w.total_spent_eth, 'ETH') : '\u2014'}</td>
              <td>{formatNative(w.total_earned_pol, 'POL')}</td>
              <td>{w.total_earned_eth > 0 ? formatNative(w.total_earned_eth, 'ETH') : '\u2014'}</td>
              <td className={w.net_pol >= 0 ? 'pearls-positive' : 'pearls-negative'}>
                {formatNative(w.net_pol, 'POL')}
              </td>
              <td className={w.net_eth >= 0 ? 'pearls-positive' : 'pearls-negative'}>
                {w.net_eth !== 0 ? formatNative(w.net_eth, 'ETH') : '\u2014'}
              </td>
              <td>{w.effective_apr.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
