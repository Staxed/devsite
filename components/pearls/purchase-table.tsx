import type { NftTransfer, TokenMetadata } from '@/lib/pearls/types';
import { formatNative } from '@/lib/pearls/currencies';

/** Lookup key: "contract_id:token_id" → name */
export type TokenNameMap = Record<string, string>;

export function buildTokenNameMap(metadata: TokenMetadata[]): TokenNameMap {
  const map: TokenNameMap = {};
  for (const tm of metadata) {
    map[`${tm.contract_id}:${tm.token_id}`] = tm.name;
  }
  return map;
}

interface PurchaseTableProps {
  purchases: NftTransfer[];
  tokenNames: TokenNameMap;
}

function getPearlName(purchase: NftTransfer, tokenNames: TokenNameMap): string {
  return tokenNames[`${purchase.contract_id}:${purchase.token_id}`] ?? `#${purchase.token_id}`;
}

export default function PurchaseTable({ purchases, tokenNames }: PurchaseTableProps) {
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
            <th scope="col">Pearl</th>
            <th scope="col">Qty</th>
            <th scope="col">Paid</th>
            <th scope="col">Compounded</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p) => (
            <tr key={p.id}>
              <td>{new Date(p.timestamp).toLocaleDateString()}</td>
              <td>{getPearlName(p, tokenNames)}</td>
              <td>{p.quantity}</td>
              <td>
                {p.native_value != null && p.native_currency
                  ? formatNative(p.native_value, p.native_currency)
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
