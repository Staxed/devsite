'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import type { WalletStats, PeriodWalletStats, TimePeriod, CollectionStat, ContractInfo } from '@/lib/pearls/types';
import { formatNative } from '@/lib/pearls/currencies';
import CollectionModal from './collection-modal';

type SortKey = 'total_pearls' | 'pol_pearls' | 'eth_pearls' | 'total_boosters' | 'effective_apr' | 'pol_equiv' | 'compounded_pol_equiv';
type SortDir = 'asc' | 'desc';
type LeaderboardTab = TimePeriod | 'collectors';
type CollectorsSortKey = 'pearl_pct' | 'total_pct' | string;

interface LeaderboardProps {
  wallets: WalletStats[];
  polPrice: number;
  ethPrice: number;
  walletLabels: Record<string, string>;
  fcAddresses: string[];
  periodData: Record<Exclude<TimePeriod, 'all'>, PeriodWalletStats[]>;
  collectionData: CollectionStat[];
  contracts: ContractInfo[];
}

interface LeaderboardRow {
  wallet: PeriodWalletStats;
  pol_equiv: number;
  compounded_pol_equiv: number;
}

interface CollectorRow {
  wallet_address: string;
  contractStats: Record<string, { unique_owned: number; total_possible: number }>;
  pearl_pct: number;
  total_pct: number;
}

export default function Leaderboard({ wallets, polPrice, ethPrice, walletLabels, fcAddresses, periodData, collectionData, contracts }: LeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('pol_equiv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hideFc, setHideFc] = useState(true);
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('all');
  const [collectorsSortKey, setCollectorsSortKey] = useState<CollectorsSortKey>('total_pct');
  const [collectorsSortDir, setCollectorsSortDir] = useState<SortDir>('desc');
  const [modalInfo, setModalInfo] = useState<{ walletAddress: string; contracts: { id: string; name: string }[]; title: string; displayName: string } | null>(null);
  const { address: connectedAddress } = useAccount();

  useEffect(() => {
    const stored = localStorage.getItem('pearls-hide-fc');
    if (stored !== null) setHideFc(stored === 'true');
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('pearls-leaderboard-tab');
    if (stored && ['weekly', 'monthly', 'quarterly', 'yearly', 'all', 'collectors'].includes(stored)) {
      setActiveTab(stored as LeaderboardTab);
    }
  }, []);

  const fcSet = useMemo(() => new Set(fcAddresses), [fcAddresses]);

  const ethToPolRatio = polPrice > 0 ? ethPrice / polPrice : 0;

  const activeWallets: PeriodWalletStats[] = activeTab === 'all' ? wallets : activeTab === 'collectors' ? [] : periodData[activeTab];

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

  const collectorRows: CollectorRow[] = useMemo(() => {
    const byWallet: Record<string, Record<string, { unique_owned: number; total_possible: number }>> = {};
    for (const stat of collectionData) {
      if (!byWallet[stat.wallet_address]) byWallet[stat.wallet_address] = {};
      byWallet[stat.wallet_address][stat.contract_id] = {
        unique_owned: stat.unique_owned,
        total_possible: stat.total_possible,
      };
    }

    return Object.entries(byWallet).map(([addr, contractStats]) => {
      let pearlOwned = 0, pearlTotal = 0, allOwned = 0, allTotal = 0;
      for (const c of contracts) {
        const s = contractStats[c.id];
        if (s) {
          allOwned += s.unique_owned;
          allTotal += s.total_possible;
          if (c.type === 'pearl') {
            pearlOwned += s.unique_owned;
            pearlTotal += s.total_possible;
          }
        }
      }
      // For contracts the wallet doesn't appear in, add their totals
      for (const c of contracts) {
        if (!contractStats[c.id]) {
          const sample = collectionData.find(s => s.contract_id === c.id);
          if (sample) {
            allTotal += sample.total_possible;
            if (c.type === 'pearl') pearlTotal += sample.total_possible;
          }
        }
      }
      return {
        wallet_address: addr,
        contractStats,
        pearl_pct: pearlTotal > 0 ? (pearlOwned / pearlTotal) * 100 : 0,
        total_pct: allTotal > 0 ? (allOwned / allTotal) * 100 : 0,
      };
    });
  }, [collectionData, contracts]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function handleCollectorsSort(key: CollectorsSortKey) {
    if (collectorsSortKey === key) {
      setCollectorsSortDir(collectorsSortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setCollectorsSortKey(key);
      setCollectorsSortDir('desc');
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

  const filteredCollectors = hideFc
    ? collectorRows.filter((r) => !fcSet.has(r.wallet_address.toLowerCase()))
    : collectorRows;

  const getCollectorVal = (row: CollectorRow, key: CollectorsSortKey): number => {
    if (key === 'pearl_pct') return row.pearl_pct;
    if (key === 'total_pct') return row.total_pct;
    const s = row.contractStats[key];
    return s ? (s.unique_owned / s.total_possible) * 100 : 0;
  };

  const sortedCollectors = [...filteredCollectors].sort((a, b) => {
    const aVal = getCollectorVal(a, collectorsSortKey);
    const bVal = getCollectorVal(b, collectorsSortKey);
    return collectorsSortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' \u25BC' : ' \u25B2';
  }

  function collectorsSortIndicator(key: CollectorsSortKey) {
    if (collectorsSortKey !== key) return '';
    return collectorsSortDir === 'desc' ? ' \u25BC' : ' \u25B2';
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

  if (activeTab !== 'collectors' && activeWallets.length === 0) {
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
        {(['all', 'weekly', 'monthly', 'quarterly', 'yearly', 'collectors'] as const).map((tab) => (
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
            {tab === 'all' ? 'All Time' : tab === 'collectors' ? 'Collectors' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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
      {activeTab === 'collectors' ? (
        <>
          <div className="pearls-table-wrap">
            <table className="pearls-table" role="table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Wallet</th>
                  {contracts.map((c) => (
                    <th key={c.id} scope="col">
                      <button type="button" className="pearls-sort-btn" onClick={() => handleCollectorsSort(c.id)}>
                        {c.name}{collectorsSortIndicator(c.id)}
                      </button>
                    </th>
                  ))}
                  <th scope="col">
                    <button type="button" className="pearls-sort-btn" onClick={() => handleCollectorsSort('pearl_pct')}>
                      All Pearls{collectorsSortIndicator('pearl_pct')}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="pearls-sort-btn" onClick={() => handleCollectorsSort('total_pct')}>
                      Total{collectorsSortIndicator('total_pct')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedCollectors.map((row, i) => {
                    const me = isMe(row.wallet_address);
                    const fc = fcSet.has(row.wallet_address.toLowerCase());
                    const named = !me && !fc && !!walletLabels[row.wallet_address.toLowerCase()];
                    const rowClass = me ? 'pearls-row-me' : fc ? 'pearls-row-fc' : named ? 'pearls-row-named' : '';
                    const linkClass = me ? ' pearls-me' : fc ? ' pearls-fc-name' : named ? ' pearls-named' : '';
                    const dn = getDisplayName(row.wallet_address);
                    return (
                      <tr key={row.wallet_address} className={rowClass}>
                        <td>{i + 1}</td>
                        <td>
                          <a href={`/pearls/${row.wallet_address}`} className={`pearls-wallet-link${linkClass}`}>
                            {dn}
                          </a>
                        </td>
                        {contracts.map((c) => {
                          const s = row.contractStats[c.id];
                          const pct = s ? Math.round((s.unique_owned / s.total_possible) * 100) : 0;
                          const pctClass = pct === 100 ? 'pearls-pct-gold' : pct === 0 ? 'pearls-pct-dim' : '';
                          return (
                            <td key={c.id}>
                              <span
                                className={`pearls-pct-cell ${pctClass}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => setModalInfo({ walletAddress: row.wallet_address, contracts: [{ id: c.id, name: c.name }], title: c.name, displayName: dn })}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalInfo({ walletAddress: row.wallet_address, contracts: [{ id: c.id, name: c.name }], title: c.name, displayName: dn }); }}}
                              >
                                {pct}%
                              </span>
                            </td>
                          );
                        })}
                        <td className={row.pearl_pct === 100 ? 'pearls-pct-gold' : ''}>
                          <span
                            className={`pearls-pct-cell ${row.pearl_pct === 100 ? 'pearls-pct-gold' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setModalInfo({
                              walletAddress: row.wallet_address,
                              contracts: contracts.filter(c => c.type === 'pearl').map(c => ({ id: c.id, name: c.name })),
                              title: 'All Pearls',
                              displayName: dn,
                            })}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalInfo({ walletAddress: row.wallet_address, contracts: contracts.filter(c => c.type === 'pearl').map(c => ({ id: c.id, name: c.name })), title: 'All Pearls', displayName: dn }); }}}
                          >
                            {Math.round(row.pearl_pct)}%
                          </span>
                        </td>
                        <td className={row.total_pct === 100 ? 'pearls-pct-gold' : ''}>
                          <span
                            className={`pearls-pct-cell ${row.total_pct === 100 ? 'pearls-pct-gold' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setModalInfo({
                              walletAddress: row.wallet_address,
                              contracts: contracts.map(c => ({ id: c.id, name: c.name })),
                              title: 'Total',
                              displayName: dn,
                            })}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalInfo({ walletAddress: row.wallet_address, contracts: contracts.map(c => ({ id: c.id, name: c.name })), title: 'Total', displayName: dn }); }}}
                          >
                            {Math.round(row.total_pct)}%
                          </span>
                        </td>
                      </tr>
                    );
                })}
              </tbody>
            </table>
          </div>
          <p className="pearls-collectors-disclaimer">Collection % based on unique token IDs owned per contract.</p>
          {modalInfo && (
            <CollectionModal
              walletAddress={modalInfo.walletAddress}
              contracts={modalInfo.contracts}
              title={modalInfo.title}
              displayName={modalInfo.displayName}
              onClose={() => setModalInfo(null)}
            />
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
