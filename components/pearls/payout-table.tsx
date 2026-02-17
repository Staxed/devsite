import type { PayoutTransfer } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import type { CurrencyRates } from '@/lib/pearls/types';
import { convertUsdTo, formatCurrency, formatNative } from '@/lib/pearls/currencies';

interface PayoutTableProps {
  payouts: PayoutTransfer[];
  currency: SupportedCurrency;
  rates: CurrencyRates;
}

export default function PayoutTable({ payouts, currency, rates }: PayoutTableProps) {
  if (payouts.length === 0) {
    return (
      <div className="pearls-empty">
        <p>No payouts found for this wallet.</p>
      </div>
    );
  }

  return (
    <div className="pearls-table-wrap">
      <table className="pearls-table" role="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Amount</th>
            <th scope="col">Value</th>
            <th scope="col">Tx</th>
          </tr>
        </thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.timestamp).toLocaleDateString()}</td>
              <td>{formatNative(p.amount, p.native_currency)}</td>
              <td>
                {p.usd_value != null
                  ? formatCurrency(convertUsdTo(p.usd_value, currency, rates), currency)
                  : '\u2014'}
              </td>
              <td>
                <a
                  href={p.native_currency === 'POL'
                    ? `https://polygonscan.com/tx/${p.tx_hash}`
                    : `https://basescan.org/tx/${p.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pearls-tx-link"
                >
                  {p.tx_hash.slice(0, 8)}...
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
