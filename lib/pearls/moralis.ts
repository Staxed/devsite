const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2';

function getHeaders(): HeadersInit {
  const key = process.env.MORALIS_API_KEY;
  if (!key) throw new Error('MORALIS_API_KEY not configured');
  return { 'X-API-Key': key, Accept: 'application/json' };
}

function chainToMoralisId(chain: string): string {
  switch (chain) {
    case 'polygon': return '0x89';
    case 'base': return '0x2105';
    default: throw new Error(`Unsupported chain: ${chain}`);
  }
}

export interface MoralisTransferResult {
  total: number;
  page_size: number;
  cursor: string | null;
  result: Array<{
    transaction_hash: string;
    log_index: string;
    block_number: string;
    block_timestamp: string;
    from_address: string;
    to_address: string;
    token_id: string;
    amount: string;
    value: string;
    contract_type: string;
  }>;
}

export interface MoralisNativeResult {
  total: number;
  page_size: number;
  cursor: string | null;
  result: Array<{
    hash: string;
    block_number: string;
    block_timestamp: string;
    from_address: string;
    to_address: string;
    value: string;
  }>;
}

export interface WalletHistoryNativeTransfer {
  from_address: string;
  to_address: string;
  value: string;
  value_formatted: string;
  tx_hash: string;
  block_number: string;
  block_timestamp: string;
}

export async function getErc1155Transfers(
  contractAddress: string,
  chain: string,
  cursor?: string | null,
  fromBlock?: number
): Promise<MoralisTransferResult> {
  const chainId = chainToMoralisId(chain);
  const params = new URLSearchParams({
    chain: chainId,
    format: 'decimal',
    limit: '100',
  });

  if (cursor) params.set('cursor', cursor);
  if (fromBlock) params.set('from_block', String(fromBlock));

  const res = await fetch(
    `${MORALIS_BASE}/nft/${contractAddress}/transfers?${params}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Moralis API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function getNativeTransfers(
  walletAddress: string,
  chain: string,
  cursor?: string | null,
  fromBlock?: number
): Promise<MoralisNativeResult> {
  const chainId = chainToMoralisId(chain);
  const params = new URLSearchParams({
    chain: chainId,
    limit: '100',
  });

  if (cursor) params.set('cursor', cursor);
  if (fromBlock) params.set('from_block', String(fromBlock));

  const res = await fetch(
    `${MORALIS_BASE}/${walletAddress}?${params}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Moralis native transfers error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Get outgoing native transfers (including internal txs from contract calls)
 * using the wallet history endpoint. This captures bulk payouts via multisig/Safe.
 */
export async function getWalletPayoutTransfers(
  walletAddress: string,
  chain: string,
  cursor?: string | null
): Promise<{
  cursor: string | null;
  result: WalletHistoryNativeTransfer[];
}> {
  const chainId = chainToMoralisId(chain);
  const walletLower = walletAddress.toLowerCase();
  const params = new URLSearchParams({
    chain: chainId,
    limit: '10',
    include_internal_transactions: 'true',
    nft_metadata: 'false',
  });

  if (cursor) params.set('cursor', cursor);

  const res = await fetch(
    `${MORALIS_BASE}/wallets/${walletAddress}/history?${params}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Moralis wallet history error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const outgoing: WalletHistoryNativeTransfer[] = [];

  for (const tx of data.result ?? []) {
    for (const nt of tx.native_transfers ?? []) {
      // Only include outgoing transfers from this wallet
      if (nt.from_address?.toLowerCase() === walletLower && nt.to_address) {
        outgoing.push({
          from_address: nt.from_address.toLowerCase(),
          to_address: nt.to_address.toLowerCase(),
          value: nt.value ?? '0',
          value_formatted: nt.value_formatted ?? '0',
          tx_hash: tx.hash,
          block_number: String(tx.block_number),
          block_timestamp: tx.block_timestamp,
        });
      }
    }
  }

  return { cursor: data.cursor ?? null, result: outgoing };
}

export async function getTransactionDetails(
  txHash: string,
  chain: string
): Promise<{ value: string; block_timestamp: string }> {
  const chainId = chainToMoralisId(chain);

  const res = await fetch(
    `${MORALIS_BASE}/transaction/${txHash}?chain=${chainId}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Moralis tx detail error ${res.status}: ${text}`);
  }

  return res.json();
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.MORALIS_STREAM_SECRET;
  if (!secret) return false;

  // Moralis uses the body as-is for HMAC-SHA256
  // In edge/workers environments, we need to use Web Crypto API
  // This is a sync check placeholder - actual implementation uses crypto.subtle
  // For the webhook route, we'll do the async verification there
  return signature.length > 0 && secret.length > 0;
}
