import { NextRequest, NextResponse } from 'next/server';
import { getErc1155Transfers, getWalletPayoutTransfers, getTransactionDetails } from '@/lib/pearls/moralis';
import { getTokenPrice } from '@/lib/pearls/coingecko';
import { getServiceClient } from '@/lib/pearls/supabase-admin';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin secret (header only — never accept secrets in query strings)
    const secret = request.headers.get('x-admin-secret') ?? '';
    const expected = process.env.BACKFILL_ADMIN_SECRET ?? '';
    if (!secret || !expected || !timingSafeEqual(secret, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetContract = body.contract_address?.toLowerCase();
    const backfillPayouts = body.backfill_payouts === true;

    const supabase = getServiceClient();
    const results: Array<{
      name: string;
      chain: string;
      processed: number;
      hasMore: boolean;
      completed: boolean;
    }> = [];

    // Load seller addresses from DB
    const { data: sellerRows } = await supabase.from('seller_wallets').select('address');
    const sellerAddresses = new Set((sellerRows ?? []).map((w) => w.address.toLowerCase()));

    if (backfillPayouts) {
      // Load payout wallets from DB
      const { data: payoutWalletRows } = await supabase
        .from('payout_wallets')
        .select('id, address');

      for (const payoutWallet of payoutWalletRows ?? []) {
        for (const chain of ['polygon', 'base'] as const) {
          const nativeCurrency = chain === 'polygon' ? 'POL' : 'ETH';

          // Use a synthetic cursor key for payout backfill
          const cursorKey = `payout_${payoutWallet.address}_${chain}`;
          const { data: cursorRow } = await supabase
            .from('sync_cursors')
            .select('*')
            .eq('contract_id', cursorKey)
            .single();

          if (cursorRow?.completed) {
            results.push({ name: `payouts-${chain}`, chain, processed: 0, hasMore: false, completed: true });
            continue;
          }

          // Use wallet history endpoint to capture internal txs (bulk payouts via multisig/Safe)
          const data = await getWalletPayoutTransfers(
            payoutWallet.address,
            chain,
            cursorRow?.cursor
          );

          // Deduplicate prices per date
          const priceCache = new Map<string, number>();

          let processed = 0;
          for (const tx of data.result) {
            const amount = Number(tx.value) / 1e18;
            if (amount <= 0) continue;

            let usdValue: number | null = null;
            try {
              const txDate = new Date(tx.block_timestamp);
              const dateKey = `${nativeCurrency}_${txDate.toISOString().split('T')[0]}`;
              let price: number;
              if (priceCache.has(dateKey)) {
                price = priceCache.get(dateKey)!;
              } else {
                await new Promise((r) => setTimeout(r, 300));
                price = await getTokenPrice(nativeCurrency, txDate, supabase);
                priceCache.set(dateKey, price);
              }
              usdValue = amount * price;
            } catch {
              // skip price
            }

            // Use tx_hash + to_address as unique key since one TX has many payouts
            await supabase.from('payout_transfers').upsert(
              {
                payout_wallet_id: payoutWallet.id,
                to_address: tx.to_address,
                amount,
                native_currency: nativeCurrency,
                usd_value: usdValue,
                tx_hash: `${tx.tx_hash}_${tx.to_address}`,
                block_number: Number(tx.block_number),
                timestamp: new Date(tx.block_timestamp).toISOString(),
              },
              { onConflict: 'tx_hash' }
            );
            processed++;
          }

          const hasMore = !!data.cursor;
          await supabase.from('sync_cursors').upsert(
            {
              contract_id: cursorKey,
              cursor: data.cursor,
              last_block: data.result.length > 0 ? Number(data.result[data.result.length - 1].block_number) : 0,
              completed: !hasMore,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'contract_id' }
          );

          results.push({ name: `payouts-${chain}`, chain, processed, hasMore, completed: !hasMore });
        }
      }
    } else {
      // Load contracts from DB
      let contractQuery = supabase.from('contracts').select('id, chain, address, name');
      if (targetContract) {
        contractQuery = contractQuery.eq('address', targetContract);
      }
      const { data: contracts } = await contractQuery;

      for (const contractRow of contracts ?? []) {
        // Check cursor
        const { data: cursorRow } = await supabase
          .from('sync_cursors')
          .select('*')
          .eq('contract_id', contractRow.id)
          .single();

        if (cursorRow?.completed) {
          results.push({ name: contractRow.name, chain: contractRow.chain, processed: 0, hasMore: false, completed: true });
          continue;
        }

        const nativeCurrency = contractRow.chain === 'polygon' ? 'POL' : 'ETH';

        // Fetch one page
        const data = await getErc1155Transfers(
          contractRow.address,
          contractRow.chain,
          cursorRow?.cursor
        );

        // In-memory caches to avoid duplicate API calls within this page
        const txValueCache = new Map<string, number>();
        const priceCache = new Map<string, number>();

        // Pre-count transfers per tx_hash so we can split the TX value evenly
        // (e.g. 1 TX with 8 ERC1155 transfers = TX value / 8 per transfer)
        const txTransferCount = new Map<string, number>();
        for (const t of data.result) {
          txTransferCount.set(t.transaction_hash, (txTransferCount.get(t.transaction_hash) ?? 0) + 1);
        }

        let processed = 0;
        for (const transfer of data.result) {
          const fromAddr = transfer.from_address.toLowerCase();
          const toAddr = transfer.to_address.toLowerCase();

          let nativeValue: number | null = null;
          let usdValue: number | null = null;
          let isPurchase = false;

          try {
            // Get tx native value (deduplicated - batch transfers share tx hash)
            let txValue: number;
            if (txValueCache.has(transfer.transaction_hash)) {
              txValue = txValueCache.get(transfer.transaction_hash)!;
            } else {
              const txDetails = await getTransactionDetails(
                transfer.transaction_hash,
                contractRow.chain
              );
              txValue = Number(txDetails.value) / 1e18;
              txValueCache.set(transfer.transaction_hash, txValue);
            }

            // Any transfer with native value is a purchase (includes secondary market)
            if (txValue > 0) {
              isPurchase = true;
              const transfersInTx = txTransferCount.get(transfer.transaction_hash) ?? 1;
              nativeValue = txValue / transfersInTx;

              const txDate = new Date(transfer.block_timestamp);
              const dateKey = `${nativeCurrency}_${txDate.toISOString().split('T')[0]}`;

              // Get price (deduplicated per token+date, with 300ms throttle)
              let price: number;
              if (priceCache.has(dateKey)) {
                price = priceCache.get(dateKey)!;
              } else {
                await new Promise((r) => setTimeout(r, 300));
                price = await getTokenPrice(nativeCurrency, txDate, supabase);
                priceCache.set(dateKey, price);
              }

              usdValue = nativeValue * price;
            }
          } catch {
            // skip price lookup on error
          }

          await supabase.from('nft_transfers').upsert(
            {
              contract_id: contractRow.id,
              tx_hash: transfer.transaction_hash,
              log_index: Number(transfer.log_index),
              block_number: Number(transfer.block_number),
              from_address: fromAddr,
              to_address: toAddr,
              token_id: transfer.token_id,
              quantity: Number(transfer.amount || 1),
              is_purchase: isPurchase,
              native_value: nativeValue,
              native_currency: isPurchase ? nativeCurrency : null,
              usd_value: usdValue,
              timestamp: new Date(transfer.block_timestamp).toISOString(),
            },
            { onConflict: 'tx_hash,log_index' }
          );
          processed++;
        }

        const hasMore = !!data.cursor;
        await supabase.from('sync_cursors').upsert(
          {
            contract_id: contractRow.id,
            cursor: data.cursor,
            last_block: data.result.length > 0 ? Number(data.result[data.result.length - 1].block_number) : cursorRow?.last_block ?? 0,
            completed: !hasMore,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'contract_id' }
        );

        results.push({ name: contractRow.name, chain: contractRow.chain, processed, hasMore, completed: !hasMore });
      }
    }

    const allCompleted = results.every((r) => r.completed);
    return NextResponse.json({ results, allCompleted });
  } catch (err) {
    console.error('Backfill error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
