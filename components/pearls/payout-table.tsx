import type { PayoutTransfer, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import { formatNative, convertUsdTo, formatCurrency } from '@/lib/pearls/currencies';

interface PayoutTableProps {
  payouts: PayoutTransfer[];
  currency: SupportedCurrency;
  rates: CurrencyRates;
}

interface GroupedPayout {
  date: string;
  pol: PayoutTransfer | null;
  eth: PayoutTransfer | null;
}

function groupPayoutsByDate(payouts: PayoutTransfer[]): GroupedPayout[] {
  const map = new Map<string, GroupedPayout>();

  for (const p of payouts) {
    const date = new Date(p.timestamp).toLocaleDateString();
    let group = map.get(date);
    if (!group) {
      group = { date, pol: null, eth: null };
      map.set(date, group);
    }
    if (p.native_currency === 'ETH') {
      group.eth = p;
    } else {
      group.pol = p;
    }
  }

  // Sort by date descending (most recent first)
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.pol?.timestamp ?? b.eth?.timestamp ?? 0).getTime()
          - new Date(a.pol?.timestamp ?? a.eth?.timestamp ?? 0).getTime()
  );
}

function TxLink({ payout }: { payout: PayoutTransfer }) {
  // tx_hash may include _<address> suffix for uniqueness — strip it for the URL
  const rawHash = payout.tx_hash.split('_')[0];
  const url = payout.native_currency === 'POL'
    ? `https://polygonscan.com/tx/${rawHash}`
    : `https://basescan.org/tx/${rawHash}`;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="pearls-tx-link">
      {payout.tx_hash.slice(0, 8)}...
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

export default function PayoutTable({ payouts, currency, rates }: PayoutTableProps) {
  if (payouts.length === 0) {
    return (
      <div className="pearls-empty">
        <p>No payouts found for this wallet.</p>
      </div>
    );
  }

  const grouped = groupPayoutsByDate(payouts);

  return (
    <div className="pearls-table-wrap">
      <table className="pearls-table" role="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Amount</th>
            <th scope="col">Tx</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => {
            const nativeParts: string[] = [];
            if (g.pol) nativeParts.push(formatNative(g.pol.amount, 'POL'));
            if (g.eth) nativeParts.push(formatNative(g.eth.amount, 'ETH'));

            const totalUsd = (g.pol?.usd_value ?? 0) + (g.eth?.usd_value ?? 0);
            const fiatStr = totalUsd > 0
              ? `~${formatCurrency(convertUsdTo(totalUsd, currency, rates), currency)}`
              : null;

            return (
              <tr key={g.date}>
                <td>{g.date}</td>
                <td>
                  <span className="pearls-stat-value-gradient">
                    {nativeParts.join(' | ')}
                  </span>
                  {fiatStr && <>{' | '}<span className="pearls-positive">{fiatStr}</span></>}
                </td>
                <td className="pearls-tx-links">
                  {g.pol && <TxLink payout={g.pol} />}
                  {g.pol && g.eth && <span className="pearls-tx-sep">&nbsp;|&nbsp;</span>}
                  {g.eth && <TxLink payout={g.eth} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
