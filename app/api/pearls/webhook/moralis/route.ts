import { NextRequest, NextResponse } from 'next/server';
import { keccak256, toHex } from 'viem';
import { getTokenPrice } from '@/lib/pearls/coingecko';
import { getServiceClient } from '@/lib/pearls/supabase-admin';

export const runtime = 'edge';

async function loadPayoutAddresses(supabase: ReturnType<typeof getServiceClient>): Promise<Set<string>> {
  const { data } = await supabase.from('payout_wallets').select('address');
  return new Set((data ?? []).map((w) => w.address.toLowerCase()));
}

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.MORALIS_STREAM_SECRET;
  if (!secret) return false;

  const computed = keccak256(toHex(body + secret));

  const target = signature.toLowerCase();
  if (computed.length !== target.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ target.charCodeAt(i);
  }
  return result === 0;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-signature') ?? '';

    const valid = verifySignature(rawBody, signature);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    if (!body.confirmed) {
      return NextResponse.json({ status: 'skipped', reason: 'unconfirmed' });
    }

    const supabase = getServiceClient();
    const chainId = body.chainId;
    const chain = chainId === '0x89' ? 'polygon' : chainId === '0x2105' ? 'base' : null;

    if (!chain) {
      console.log('Webhook skip: unsupported chain', chainId);
      return NextResponse.json({ status: 'skipped', reason: 'unsupported chain' });
    }

    const nativeCurrency = chain === 'polygon' ? 'POL' : 'ETH';

    // Build tx value map from body.txs (Moralis sends native value here, not on transfers)
    const txValueMap = new Map<string, string>();
    if (body.txs?.length) {
      for (const tx of body.txs) {
        const hash = (tx.hash ?? tx.transactionHash)?.toLowerCase();
        if (hash && tx.value) txValueMap.set(hash, tx.value);
      }
    }

    const payoutAddresses = await loadPayoutAddresses(supabase);

    // Process NFT transfers (Moralis Streams uses "nftTransfers" for all NFTs)
    const nftTransfers = body.nftTransfers ?? [];
    if (nftTransfers.length) {
      // Pre-count transfers per tx to split native value evenly
      const txTransferCount = new Map<string, number>();
      for (const t of nftTransfers) {
        const txHash = (t.transactionHash ?? t.transaction_hash)?.toLowerCase();
        txTransferCount.set(txHash, (txTransferCount.get(txHash) ?? 0) + 1);
      }

      // Batch-fetch all contracts for this chain up front
      const uniqueContractAddrs = [
        ...new Set(
          nftTransfers.map((t: { contract?: string; contract_address?: string }) =>
            (t.contract ?? t.contract_address)?.toLowerCase()
          ).filter(Boolean)
        ),
      ];
      const { data: contractRows } = await supabase
        .from('contracts')
        .select('id, address')
        .eq('chain', chain)
        .in('address', uniqueContractAddrs);
      const contractMap = new Map<string, { id: string }>(
        (contractRows ?? []).map((c: { id: string; address: string }) => [c.address.toLowerCase(), { id: c.id }])
      );
      console.log(`Webhook: chain=${chain}, ${nftTransfers.length} nftTransfers, ${contractMap.size}/${uniqueContractAddrs.length} contracts matched`);

      for (const transfer of nftTransfers) {
        const fromAddr = (transfer.from ?? transfer.from_address)?.toLowerCase();
        const toAddr = (transfer.to ?? transfer.to_address)?.toLowerCase();
        const contractAddr = (transfer.contract ?? transfer.contract_address)?.toLowerCase();
        const txHash = (transfer.transactionHash ?? transfer.transaction_hash)?.toLowerCase();

        // Find matching contract via map lookup
        const contract = contractMap.get(contractAddr);

        if (!contract) continue;

        let nativeValue: number | null = null;
        let usdValue: number | null = null;

        // Get native value from the transaction (not the transfer)
        const txValueWei = txValueMap.get(txHash);
        const txValue = txValueWei ? Number(txValueWei) / 1e18 : 0;
        const isPurchase = txValue > 0;

        if (isPurchase) {
          const transfersInTx = txTransferCount.get(txHash) ?? 1;
          nativeValue = txValue / transfersInTx;
          try {
            const blockDate = new Date(body.block.timestamp * 1000);
            const price = await getTokenPrice(nativeCurrency, blockDate, supabase);
            usdValue = nativeValue * price;
          } catch {
            // Price lookup failed, leave null
          }
        }

        const { error: nftUpsertErr } = await supabase.from('nft_transfers').upsert(
          {
            contract_id: contract.id,
            tx_hash: txHash,
            log_index: Number(transfer.logIndex ?? transfer.log_index ?? 0),
            block_number: Number(body.block.number),
            from_address: fromAddr,
            to_address: toAddr,
            token_id: transfer.tokenId ?? transfer.token_id ?? '0',
            quantity: Number(transfer.amount ?? 1),
            is_purchase: isPurchase,
            native_value: nativeValue,
            native_currency: isPurchase ? nativeCurrency : null,
            usd_value: usdValue,
            timestamp: new Date(body.block.timestamp * 1000).toISOString(),
          },
          { onConflict: 'tx_hash,log_index' }
        );
        if (nftUpsertErr) console.error('Webhook nft upsert failed:', nftUpsertErr.message);
      }
    }

    // Process native transfers for payouts (from body.txs)
    if (body.txs?.length) {
      for (const tx of body.txs) {
        const fromAddr = (tx.fromAddress ?? tx.from_address)?.toLowerCase();
        const toAddr = (tx.toAddress ?? tx.to_address)?.toLowerCase();

        if (!fromAddr || !payoutAddresses.has(fromAddr)) continue;

        // Find matching payout wallet
        const { data: payoutWallet } = await supabase
          .from('payout_wallets')
          .select('id')
          .eq('address', fromAddr)
          .single();

        if (!payoutWallet) continue;

        const amount = Number(tx.value) / 1e18;
        if (!Number.isFinite(amount) || amount <= 0) continue;

        let usdValue: number | null = null;

        try {
          const blockDate = new Date(body.block.timestamp * 1000);
          const price = await getTokenPrice(nativeCurrency, blockDate, supabase);
          usdValue = amount * price;
        } catch {
          // Price lookup failed
        }

        const txHash = (tx.hash ?? tx.transactionHash)?.toLowerCase();

        const { error: payoutUpsertErr } = await supabase.from('payout_transfers').upsert(
          {
            payout_wallet_id: payoutWallet.id,
            to_address: toAddr,
            amount,
            native_currency: nativeCurrency,
            usd_value: usdValue,
            tx_hash: txHash,
            block_number: Number(body.block.number),
            timestamp: new Date(body.block.timestamp * 1000).toISOString(),
          },
          { onConflict: 'tx_hash,to_address' }
        );
        if (payoutUpsertErr) console.error('Webhook payout upsert failed:', payoutUpsertErr.message);
      }
    }

    console.log('Webhook: processing complete');
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
