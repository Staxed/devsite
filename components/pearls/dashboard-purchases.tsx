'use client';

import { useState, useTransition } from 'react';
import type { NftTransfer, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import { convertUsdTo, formatCurrency, formatNative } from '@/lib/pearls/currencies';
import CurrencySelector from './currency-selector';

interface DashboardPurchasesProps {
  purchases: NftTransfer[];
  rates: CurrencyRates;
}

export default function DashboardPurchases({ purchases: initial, rates }: DashboardPurchasesProps) {
  const [purchases, setPurchases] = useState(initial);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
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
          setPurchases((prev) =>
            prev.map((p) =>
              p.id === transferId ? { ...p, is_compounded: !currentValue } : p
            )
          );
        }
      } catch {
        // Toggle failed silently
      }
    });
  }

  if (purchases.length === 0) {
    return null;
  }

  return (
    <div className="pearls-section">
      <div className="pearls-toolbar">
        <h2>Your Purchases</h2>
        <CurrencySelector value={currency} onChange={setCurrency} />
      </div>
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
                <td>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
