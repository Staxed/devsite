import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { PEARL_CONTRACTS, SELLER_WALLETS, PAYOUT_WALLETS } from '@/lib/pearls/config';
import { getErc1155Transfers, getNativeTransfers } from '@/lib/pearls/moralis';
import { getTokenPrice } from '@/lib/pearls/coingecko';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role config');
  return createSupabaseClient(url, key);
}

const sellerAddresses = new Set(SELLER_WALLETS.map((w) => w.address.toLowerCase()));

export async function POST(request: NextRequest) {
  try {
    // Verify admin secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret') || request.headers.get('x-admin-secret');
    if (secret !== process.env.BACKFILL_ADMIN_SECRET) {
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

    if (backfillPayouts) {
      // Backfill payout transfers from payout wallets
      for (const payoutWallet of PAYOUT_WALLETS) {
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

          const data = await getNativeTransfers(
            payoutWallet.address,
            chain,
            cursorRow?.cursor
          );

          let processed = 0;
          const { data: payoutWalletRow } = await supabase
            .from('payout_wallets')
            .select('id')
            .eq('address', payoutWallet.address.toLowerCase())
            .single();

          if (payoutWalletRow) {
            for (const tx of data.result) {
              const amount = Number(tx.value) / 1e18;
              if (amount <= 0) continue;

              let usdValue: number | null = null;
              try {
                const txDate = new Date(tx.block_timestamp);
                const price = await getTokenPrice(nativeCurrency, txDate);
                usdValue = amount * price;
              } catch {
                // skip price
              }

              await supabase.from('payout_transfers').upsert(
                {
                  payout_wallet_id: payoutWalletRow.id,
                  to_address: tx.to_address.toLowerCase(),
                  amount,
                  native_currency: nativeCurrency,
                  usd_value: usdValue,
                  tx_hash: tx.hash,
                  block_number: Number(tx.block_number),
                  timestamp: new Date(tx.block_timestamp).toISOString(),
                },
                { onConflict: 'tx_hash' }
              );
              processed++;
            }
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
      // Backfill NFT transfers per contract
      const contracts = targetContract
        ? PEARL_CONTRACTS.filter((c) => c.address.toLowerCase() === targetContract)
        : [...PEARL_CONTRACTS];

      for (const contractConfig of contracts) {
        // Find contract ID in DB
        const { data: contract } = await supabase
          .from('contracts')
          .select('id')
          .eq('address', contractConfig.address.toLowerCase())
          .eq('chain', contractConfig.chain)
          .single();

        if (!contract) {
          results.push({ name: contractConfig.name, chain: contractConfig.chain, processed: 0, hasMore: false, completed: false });
          continue;
        }

        // Check cursor
        const { data: cursorRow } = await supabase
          .from('sync_cursors')
          .select('*')
          .eq('contract_id', contract.id)
          .single();

        if (cursorRow?.completed) {
          results.push({ name: contractConfig.name, chain: contractConfig.chain, processed: 0, hasMore: false, completed: true });
          continue;
        }

        const nativeCurrency = contractConfig.chain === 'polygon' ? 'POL' : 'ETH';

        // Fetch one page
        const data = await getErc1155Transfers(
          contractConfig.address,
          contractConfig.chain,
          cursorRow?.cursor
        );

        let processed = 0;
        for (const transfer of data.result) {
          const fromAddr = transfer.from_address.toLowerCase();
          const toAddr = transfer.to_address.toLowerCase();
          const isPurchase = sellerAddresses.has(fromAddr);

          let nativeValue: number | null = null;
          let usdValue: number | null = null;

          if (isPurchase && transfer.value && transfer.value !== '0') {
            nativeValue = Number(transfer.value) / 1e18;
            try {
              const txDate = new Date(transfer.block_timestamp);
              const price = await getTokenPrice(nativeCurrency, txDate);
              usdValue = nativeValue * price;
            } catch {
              // skip price
            }
          }

          await supabase.from('nft_transfers').upsert(
            {
              contract_id: contract.id,
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
            contract_id: contract.id,
            cursor: data.cursor,
            last_block: data.result.length > 0 ? Number(data.result[data.result.length - 1].block_number) : cursorRow?.last_block ?? 0,
            completed: !hasMore,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'contract_id' }
        );

        results.push({ name: contractConfig.name, chain: contractConfig.chain, processed, hasMore, completed: !hasMore });
      }
    }

    const allCompleted = results.every((r) => r.completed);
    return NextResponse.json({ results, allCompleted });
  } catch (err) {
    console.error('Backfill error:', err);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
