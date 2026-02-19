import { NextRequest, NextResponse } from 'next/server';
import { getTokenPrice } from '@/lib/pearls/coingecko';
import { getServiceClient } from '@/lib/pearls/supabase-admin';

async function loadPayoutAddresses(supabase: ReturnType<typeof getServiceClient>): Promise<Set<string>> {
  const { data } = await supabase.from('payout_wallets').select('address');
  return new Set((data ?? []).map((w) => w.address.toLowerCase()));
}

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const secret = process.env.MORALIS_STREAM_SECRET;
  if (!secret) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

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

    const valid = await verifySignature(rawBody, signature);
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
      return NextResponse.json({ status: 'skipped', reason: 'unsupported chain' });
    }

    const nativeCurrency = chain === 'polygon' ? 'POL' : 'ETH';

    const payoutAddresses = await loadPayoutAddresses(supabase);

    // Process ERC1155 transfers
    if (body.erc1155Transfers?.length) {
      // Pre-count transfers per tx to split native value evenly
      const txTransferCount = new Map<string, number>();
      for (const t of body.erc1155Transfers) {
        const txHash = t.transaction_hash ?? t.transactionHash;
        txTransferCount.set(txHash, (txTransferCount.get(txHash) ?? 0) + 1);
      }

      for (const transfer of body.erc1155Transfers) {
        const fromAddr = transfer.from_address?.toLowerCase() ?? transfer.from?.toLowerCase();
        const toAddr = transfer.to_address?.toLowerCase() ?? transfer.to?.toLowerCase();
        const contractAddr = (transfer.contract_address ?? transfer.contract)?.toLowerCase();
        const txHash = transfer.transaction_hash ?? transfer.transactionHash;

        // Find matching contract
        const { data: contract } = await supabase
          .from('contracts')
          .select('id')
          .eq('address', contractAddr)
          .eq('chain', chain)
          .single();

        if (!contract) continue;

        let nativeValue: number | null = null;
        let usdValue: number | null = null;

        // Any transfer with native value is a purchase (includes secondary market)
        const txValue = transfer.value ? Number(transfer.value) / 1e18 : 0;
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

        await supabase.from('nft_transfers').upsert(
          {
            contract_id: contract.id,
            tx_hash: txHash,
            log_index: Number(transfer.log_index ?? transfer.logIndex ?? 0),
            block_number: Number(body.block.number),
            from_address: fromAddr,
            to_address: toAddr,
            token_id: transfer.token_id ?? transfer.tokenId ?? '0',
            quantity: Number(transfer.amount ?? 1),
            is_purchase: isPurchase,
            native_value: nativeValue,
            native_currency: isPurchase ? nativeCurrency : null,
            usd_value: usdValue,
            timestamp: new Date(body.block.timestamp * 1000).toISOString(),
          },
          { onConflict: 'tx_hash,log_index' }
        );
      }
    }

    // Process native transfers (for payouts)
    if (body.nativeTransfers?.length) {
      for (const transfer of body.nativeTransfers) {
        const fromAddr = transfer.from_address?.toLowerCase() ?? transfer.from?.toLowerCase();
        const toAddr = transfer.to_address?.toLowerCase() ?? transfer.to?.toLowerCase();

        if (!payoutAddresses.has(fromAddr)) continue;

        // Find matching payout wallet
        const { data: payoutWallet } = await supabase
          .from('payout_wallets')
          .select('id')
          .eq('address', fromAddr)
          .single();

        if (!payoutWallet) continue;

        const amount = Number(transfer.value) / 1e18;
        let usdValue: number | null = null;

        try {
          const blockDate = new Date(body.block.timestamp * 1000);
          const price = await getTokenPrice(nativeCurrency, blockDate, supabase);
          usdValue = amount * price;
        } catch {
          // Price lookup failed
        }

        await supabase.from('payout_transfers').upsert(
          {
            payout_wallet_id: payoutWallet.id,
            to_address: toAddr,
            amount,
            native_currency: nativeCurrency,
            usd_value: usdValue,
            tx_hash: transfer.transaction_hash ?? transfer.hash,
            block_number: Number(body.block.number),
            timestamp: new Date(body.block.timestamp * 1000).toISOString(),
          },
          { onConflict: 'tx_hash' }
        );
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
