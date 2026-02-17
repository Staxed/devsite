import type { NftTransfer } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import type { CurrencyRates } from '@/lib/pearls/types';
import { convertUsdTo, formatCurrency, formatNative } from '@/lib/pearls/currencies';

interface PurchaseTableProps {
  purchases: NftTransfer[];
  currency: SupportedCurrency;
  rates: CurrencyRates;
}

export default function PurchaseTable({ purchases, currency, rates }: PurchaseTableProps) {
  if (purchases.length === 0) {
    return (
      <div className="pearls-empty">
        <p>No purchases found for this wallet.</p>
      </div>
    );
  }

  return (
    <div className="pearls-table-wrap">
      <table className="pearls-table" role="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Token ID</th>
            <th scope="col">Qty</th>
            <th scope="col">Paid</th>
            <th scope="col">Value</th>
            <th scope="col">Compounded</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.timestamp).toLocaleDateString()}</td>
              <td>#{p.token_id}</td>
              <td>{p.quantity}</td>
              <td>
                {p.native_value != null && p.native_currency
                  ? formatNative(p.native_value, p.native_currency)
                  : '\u2014'}
              </td>
              <td>
                {p.usd_value != null
                  ? formatCurrency(convertUsdTo(p.usd_value, currency, rates), currency)
                  : '\u2014'}
              </td>
              <td>{p.is_compounded ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
