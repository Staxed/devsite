'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import type { WalletStats } from '@/lib/pearls/types';
import { formatNative } from '@/lib/pearls/currencies';

type SortKey = 'total_pearls' | 'pol_pearls' | 'eth_pearls' | 'total_boosters' | 'effective_apr' | 'pol_equiv';
type SortDir = 'asc' | 'desc';

interface LeaderboardProps {
  wallets: WalletStats[];
  polPrice: number;
  ethPrice: number;
  walletLabels: Record<string, string>;
  fcAddresses: string[];
}

interface LeaderboardRow {
  wallet: WalletStats;
  pol_equiv: number;
}

export default function Leaderboard({ wallets, polPrice, ethPrice, walletLabels, fcAddresses }: LeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('pol_equiv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hideFc, setHideFc] = useState(true);
  const { address: connectedAddress } = useAccount();

  useEffect(() => {
    const stored = localStorage.getItem('pearls-hide-fc');
    if (stored !== null) setHideFc(stored === 'true');
  }, []);

  const fcSet = useMemo(() => new Set(fcAddresses), [fcAddresses]);

  const ethToPolRatio = polPrice > 0 ? ethPrice / polPrice : 0;

  const rows: LeaderboardRow[] = useMemo(
    () =>
      wallets.map((w) => ({
        wallet: w,
        pol_equiv:
          w.total_spent_excluding_compounded_pol +
          w.total_spent_excluding_compounded_eth * ethToPolRatio,
      })),
    [wallets, ethToPolRatio]
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

  if (wallets.length === 0) {
    return (
      <div className="pearls-empty">
        <p>No wallet data yet. Check back after the first backfill.</p>
      </div>
    );
  }

  return (
    <>
      <div className="pearls-toolbar">
        <h2>Leaderboard</h2>
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
                Invested (POL eq.){sortIndicator('pol_equiv')}
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
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
