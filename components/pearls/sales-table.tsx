import type { NftTransfer } from '@/lib/pearls/types';
import type { TokenNameMap } from '@/lib/pearls/token-names';
import { formatNative } from '@/lib/pearls/currencies';

interface SalesTableProps {
  sales: NftTransfer[];
  tokenNames: TokenNameMap;
}

function getPearlName(transfer: NftTransfer, tokenNames: TokenNameMap): string {
  return tokenNames[`${transfer.contract_id}:${transfer.token_id}`] ?? `#${transfer.token_id}`;
}

export default function SalesTable({ sales, tokenNames }: SalesTableProps) {
  if (sales.length === 0) {
    return (
      <div className="pearls-empty">
        <p>No sales found for this wallet.</p>
      </div>
    );
  }

  return (
    <div className="pearls-table-wrap">
      <table className="pearls-table" role="table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Pearl</th>
            <th scope="col">Qty</th>
            <th scope="col">Received</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{new Date(s.timestamp).toLocaleDateString()}</td>
              <td>{getPearlName(s, tokenNames)}</td>
              <td>{s.quantity}</td>
              <td>
                {s.native_value != null && s.native_currency
                  ? formatNative(s.native_value, s.native_currency)
                  : '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
