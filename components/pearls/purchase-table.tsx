'use client';

import { useTransition } from 'react';
import type { NftTransfer } from '@/lib/pearls/types';
import { type TokenNameMap, getTokenName } from '@/lib/pearls/token-names';
import { formatNative } from '@/lib/pearls/currencies';

interface PurchaseTableProps {
  purchases: NftTransfer[];
  tokenNames: TokenNameMap;
  isOwner?: boolean;
  onCompoundToggle?: (transferId: string) => void;
}

export default function PurchaseTable({ purchases, tokenNames, isOwner = false, onCompoundToggle }: PurchaseTableProps) {
  const [isPending, startTransition] = useTransition();

  async function toggleCompound(transferId: string, currentValue: boolean) {
    startTransition(async () => {
      try {
        const res = await fetch('/api/pearls/compound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ transfer_id: transferId, is_compounded: !currentValue }),
        });

        if (res.ok) {
          onCompoundToggle?.(transferId);
        }
      } catch {
        // Toggle failed silently
      }
    });
  }

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
              <td>{getTokenName(tokenNames, p.contract_id, p.token_id)}</td>
              <td>{p.quantity}</td>
              <td>
                {p.native_value != null && p.native_currency
                  ? formatNative(p.native_value, p.native_currency)
                  : '\u2014'}
              </td>
              <td>
                {isOwner ? (
                  <button
                    type="button"
                    className={`pearls-compound-toggle ${p.is_compounded ? 'active' : ''}`}
                    onClick={() => toggleCompound(p.id, p.is_compounded)}
                    disabled={isPending}
                    aria-pressed={p.is_compounded}
                    aria-label={`Mark purchase as ${p.is_compounded ? 'not compounded' : 'compounded'}`}
                  >
                    {p.is_compounded ? 'Yes' : 'No'}
                  </button>
                ) : (
                  p.is_compounded ? 'Yes' : 'No'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
