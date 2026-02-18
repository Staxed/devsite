import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFiatRates, getCurrentPrice } from '@/lib/pearls/coingecko';
import { verifySession } from '@/lib/pearls/auth';
import type { WalletStats, NftTransfer, PayoutTransfer, CurrencyRates, TokenMetadata, Contract } from '@/lib/pearls/types';
import ConnectButton from '@/components/pearls/connect-button';
import WalletDetailView from '@/components/pearls/wallet-detail-view';
import { buildTokenNameMap } from '@/lib/pearls/token-names';
import { buildInventory } from '@/components/pearls/inventory-table';

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

interface Props {
  params: Promise<{ wallet: string }>;
}

export default async function WalletPage({ params }: Props) {
  const { wallet } = await params;
  if (!ETH_ADDRESS_RE.test(wallet)) notFound();
  const address = wallet.toLowerCase();

  const cookieStore = await cookies();
  const token = cookieStore.get('pearls-session')?.value;
  let isOwner = false;
  if (token) {
    const session = await verifySession(token);
    if (session && session.address.toLowerCase() === address) {
      isOwner = true;
    }
  }

  const supabase = await createClient();

  const [statsResult, purchasesResult, salesResult, payoutsResult, tokenMetaResult, contractsResult, receivedResult, sentResult] = await Promise.all([
    supabase
      .from('wallet_stats')
      .select('*')
      .eq('wallet_address', address)
      .single(),
    supabase
      .from('nft_transfers')
      .select('*')
      .eq('to_address', address)
      .eq('is_purchase', true)
      .order('timestamp', { ascending: false }),
    supabase
      .from('nft_transfers')
      .select('*')
      .eq('from_address', address)
      .eq('is_purchase', true)
      .order('timestamp', { ascending: false }),
    supabase
      .from('payout_transfers')
      .select('*')
      .eq('to_address', address)
      .order('timestamp', { ascending: false }),
    supabase
      .from('token_metadata')
      .select('*'),
    supabase
      .from('contracts')
      .select('id, type'),
    supabase
      .from('nft_transfers')
      .select('contract_id, token_id, quantity')
      .eq('to_address', address),
    supabase
      .from('nft_transfers')
      .select('contract_id, token_id, quantity')
      .eq('from_address', address),
  ]);

  const stats = statsResult.data as WalletStats | null;
  const purchases = (purchasesResult.data as NftTransfer[]) ?? [];
  const sales = (salesResult.data as NftTransfer[]) ?? [];
  const payouts = (payoutsResult.data as PayoutTransfer[]) ?? [];
  const tokenMeta = (tokenMetaResult.data as TokenMetadata[]) ?? [];
  const contracts = (contractsResult.data as Pick<Contract, 'id' | 'type'>[]) ?? [];
  const tokenNames = buildTokenNameMap(tokenMeta);
  const inventory = buildInventory(
    (receivedResult.data as { contract_id: string; token_id: string; quantity: number }[]) ?? [],
    (sentResult.data as { contract_id: string; token_id: string; quantity: number }[]) ?? [],
    tokenMeta,
    contracts
  );

  let rates: CurrencyRates = { EUR: 0.92, GBP: 0.79, CAD: 1.36 };
  let polPrice = 0.25;
  let ethPrice = 2500;
  try {
    const [fetchedRates, pol, eth] = await Promise.all([
      getFiatRates(),
      getCurrentPrice('POL'),
      getCurrentPrice('ETH'),
    ]);
    rates = fetchedRates;
    polPrice = pol;
    ethPrice = eth;
  } catch {
    // Use defaults
  }

  if (!stats) {
    return (
      <div className="pearls-page">
        <header className="pearls-header">
          <div>
            <h1><span className="gradient-text">Wallet</span> Not Found</h1>
            <p className="pearls-subtitle">No data found for this wallet address.</p>
          </div>
          <ConnectButton />
        </header>
        <div className="pearls-content">
          <a href="/pearls" className="pearls-back-link">&larr; Back to Leaderboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="pearls-page">
      <header className="pearls-header">
        <div>
          <h1><span className="gradient-text">Wallet</span> Details</h1>
          <p className="pearls-subtitle pearls-address">{address}</p>
        </div>
        <ConnectButton />
      </header>
      <WalletDetailView
        stats={stats}
        purchases={purchases}
        sales={sales}
        payouts={payouts}
        inventory={inventory}
        rates={rates}
        polPrice={polPrice}
        ethPrice={ethPrice}
        tokenNames={tokenNames}
        isOwner={isOwner}
      />
    </div>
  );
}
