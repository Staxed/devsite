import type { TokenMetadata, Contract, CurrencyRates } from '@/lib/pearls/types';
import type { SupportedCurrency } from '@/lib/pearls/config';
import { formatNative, convertUsdTo, formatCurrency } from '@/lib/pearls/currencies';

export interface InventoryItem {
  name: string;
  quantity: number;
  intrinsicValue: number;
  currency: string;
  totalNativeValue: number;
  isBooster: boolean;
}

/** Build inventory from raw received/sent transfer rows and token metadata. */
export function buildInventory(
  received: { contract_id: string; token_id: string; quantity: number }[],
  sent: { contract_id: string; token_id: string; quantity: number }[],
  metadata: TokenMetadata[],
  contracts: Pick<Contract, 'id' | 'type'>[]
): InventoryItem[] {
  const holdings = new Map<string, number>();

  for (const r of received) {
    const key = `${r.contract_id}:${r.token_id}`;
    holdings.set(key, (holdings.get(key) ?? 0) + r.quantity);
  }
  for (const s of sent) {
    const key = `${s.contract_id}:${s.token_id}`;
    holdings.set(key, (holdings.get(key) ?? 0) - s.quantity);
  }

  const metaMap = new Map<string, TokenMetadata>();
  for (const tm of metadata) {
    metaMap.set(`${tm.contract_id}:${tm.token_id}`, tm);
  }

  const contractTypeMap = new Map<string, string>();
  for (const c of contracts) {
    contractTypeMap.set(c.id, c.type);
  }

  const items: InventoryItem[] = [];
  for (const [key, qty] of holdings) {
    if (qty <= 0) continue;
    const tm = metaMap.get(key);
    const contractId = key.split(':')[0];
    const intrinsicValue = tm?.intrinsic_value ?? 0;
    items.push({
      name: tm?.name ?? key,
      quantity: qty,
      intrinsicValue,
      currency: tm?.currency ?? 'POL',
      totalNativeValue: qty * intrinsicValue,
      isBooster: contractTypeMap.get(contractId) === 'booster',
    });
  }

  // Pearls first (POL then ETH, by value descending), boosters at bottom
  items.sort((a, b) => {
    if (a.isBooster !== b.isBooster) return a.isBooster ? 1 : -1;
    if (a.currency !== b.currency) return a.currency === 'POL' ? -1 : 1;
    return b.totalNativeValue - a.totalNativeValue;
  });

  return items;
}

interface InventoryTableProps {
  inventory: InventoryItem[];
  polPrice: number;
  ethPrice: number;
  currency: SupportedCurrency;
  rates: CurrencyRates;
}

export default function InventoryTable({ inventory, polPrice, ethPrice, currency, rates }: InventoryTableProps) {
  if (inventory.length === 0) {
    return (
      <div className="pearls-empty">
        <p>No pearls held by this wallet.</p>
      </div>
    );
  }

  function getFiatValue(item: InventoryItem): number {
    const usdPrice = item.currency === 'ETH' ? ethPrice : polPrice;
    const usdValue = item.totalNativeValue * usdPrice;
    return convertUsdTo(usdValue, currency, rates);
  }

  return (
    <div className="pearls-table-wrap">
      <table className="pearls-table" role="table">
        <thead>
          <tr>
            <th scope="col">Pearl</th>
            <th scope="col">Qty</th>
            <th scope="col">Value</th>
            <th scope="col">Fiat</th>
          </tr>
        </thead>
        <tbody>
          {inventory.map((item) => (
            <tr key={item.name}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{formatNative(item.totalNativeValue, item.currency)}</td>
              <td>{formatCurrency(getFiatValue(item), currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
