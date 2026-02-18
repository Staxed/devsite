-- Pearls Tracker Schema

-- Contracts table
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  chain text not null check (chain in ('polygon', 'base')),
  address text not null,
  name text not null,
  type text not null check (type in ('pearl', 'booster')),
  created_at timestamptz not null default now(),
  unique (chain, address)
);

-- Seller wallets
create table if not exists seller_wallets (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

-- Payout wallets
create table if not exists payout_wallets (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

-- NFT transfers (ERC1155)
create table if not exists nft_transfers (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id),
  tx_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  from_address text not null,
  to_address text not null,
  token_id text not null,
  quantity integer not null default 1,
  is_purchase boolean not null default false,
  native_value numeric,
  native_currency text,
  usd_value numeric,
  is_compounded boolean not null default false,
  timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tx_hash, log_index)
);

-- Payout transfers (native token transfers from payout wallets)
create table if not exists payout_transfers (
  id uuid primary key default gen_random_uuid(),
  payout_wallet_id uuid not null references payout_wallets(id),
  to_address text not null,
  amount numeric not null,
  native_currency text not null,
  usd_value numeric,
  tx_hash text not null unique,
  block_number bigint not null,
  timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

-- Price cache (daily prices, permanently stored)
create table if not exists price_cache (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  date date not null,
  usd_price numeric not null,
  created_at timestamptz not null default now(),
  unique (token, date)
);

-- Sync cursors (backfill progress tracking)
-- contract_id is text (not FK) so it can store both contract UUIDs and
-- synthetic keys like "payout_0x…_polygon" for payout backfill.
create table if not exists sync_cursors (
  id uuid primary key default gen_random_uuid(),
  contract_id text not null unique,
  cursor text,
  last_block bigint not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_nft_transfers_to_address on nft_transfers(to_address);
create index if not exists idx_nft_transfers_from_address on nft_transfers(from_address);
create index if not exists idx_nft_transfers_contract_id on nft_transfers(contract_id);
create index if not exists idx_nft_transfers_is_purchase on nft_transfers(is_purchase);
create index if not exists idx_nft_transfers_block_number on nft_transfers(block_number);
create index if not exists idx_payout_transfers_to_address on payout_transfers(to_address);
create index if not exists idx_payout_transfers_block_number on payout_transfers(block_number);
create index if not exists idx_price_cache_token_date on price_cache(token, date);

-- Token metadata (names and intrinsic values per contract + token ID)
create table if not exists token_metadata (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  token_id text not null,
  name text not null,
  intrinsic_value numeric not null default 0,
  currency text not null default 'POL',
  created_at timestamptz not null default now(),
  unique(contract_id, token_id)
);

create index if not exists idx_token_metadata_contract_id on token_metadata(contract_id);

-- Wallet stats view (aggregated for leaderboard)
-- NOTE: Run DROP VIEW IF EXISTS wallet_stats; before creating if columns changed
create or replace view wallet_stats as
with purchase_stats as (
  select
    to_address as wallet_address,
    coalesce(sum(usd_value) filter (where is_purchase), 0) as total_spent_usd,
    coalesce(sum(usd_value) filter (where is_purchase and not is_compounded), 0) as total_spent_excluding_compounded_usd,
    coalesce(sum(native_value) filter (where is_purchase and native_currency = 'POL'), 0) as total_spent_pol,
    coalesce(sum(native_value) filter (where is_purchase and native_currency = 'ETH'), 0) as total_spent_eth,
    coalesce(sum(native_value) filter (where is_purchase and c.type = 'booster' and native_currency = 'POL'), 0) as total_booster_spent_pol
  from nft_transfers nt
  join contracts c on c.id = nt.contract_id
  where nt.is_purchase = true
  group by to_address
),
-- Secondary market sales: when a non-seller wallet sells a pearl for native value,
-- subtract the sale proceeds from their total_spent (not counted as earnings)
sale_stats as (
  select
    nt.from_address as wallet_address,
    coalesce(sum(nt.usd_value), 0) as total_sold_usd,
    coalesce(sum(nt.native_value) filter (where nt.native_currency = 'POL'), 0) as total_sold_pol,
    coalesce(sum(nt.native_value) filter (where nt.native_currency = 'ETH'), 0) as total_sold_eth
  from nft_transfers nt
  where nt.is_purchase = true
    and nt.from_address not in (select address from seller_wallets)
  group by nt.from_address
),
holdings as (
  select
    addr as wallet_address,
    coalesce(sum(net_qty) filter (where c.type = 'pearl'), 0) as held_pearls,
    coalesce(sum(net_qty) filter (where c.type = 'booster'), 0) as held_boosters,
    coalesce(sum(net_qty) filter (where c.type = 'pearl' and c.chain = 'polygon'), 0) as pol_pearls,
    coalesce(sum(net_qty) filter (where c.type = 'pearl' and c.chain = 'base'), 0) as eth_pearls,
    coalesce(sum(net_qty * coalesce(tm.intrinsic_value, 0)) filter (where c.type = 'pearl' and tm.currency = 'POL'), 0) as holdings_pol_value,
    coalesce(sum(net_qty * coalesce(tm.intrinsic_value, 0)) filter (where c.type = 'pearl' and tm.currency = 'ETH'), 0) as holdings_eth_value,
    coalesce(sum(net_qty * coalesce(tm.intrinsic_value, 0)) filter (where c.type = 'booster'), 0) as holdings_booster_value
  from (
    select to_address as addr, contract_id, token_id, sum(quantity) as net_qty from nft_transfers group by to_address, contract_id, token_id
    union all
    select from_address as addr, contract_id, token_id, -sum(quantity) as net_qty from nft_transfers group by from_address, contract_id, token_id
  ) balances
  join contracts c on c.id = balances.contract_id
  left join token_metadata tm on tm.contract_id = balances.contract_id and tm.token_id = balances.token_id
  group by addr
  having coalesce(sum(net_qty), 0) > 0
),
payout_stats as (
  select
    to_address as wallet_address,
    coalesce(sum(usd_value), 0) as total_earned_usd,
    coalesce(sum(amount) filter (where native_currency = 'POL'), 0) as total_earned_pol,
    coalesce(sum(amount) filter (where native_currency = 'ETH'), 0) as total_earned_eth
  from payout_transfers
  group by to_address
)
select
  h.wallet_address,
  h.held_pearls as total_pearls,
  h.held_boosters as total_boosters,
  h.pol_pearls,
  h.eth_pearls,
  greatest(0, coalesce(ps.total_spent_usd, 0) - coalesce(ss.total_sold_usd, 0)) as total_spent_usd,
  greatest(0, coalesce(ps.total_spent_excluding_compounded_usd, 0) - coalesce(ss.total_sold_usd, 0)) as total_spent_excluding_compounded_usd,
  greatest(0, coalesce(ps.total_spent_pol, 0) - coalesce(ss.total_sold_pol, 0)) as total_spent_pol,
  greatest(0, coalesce(ps.total_spent_eth, 0) - coalesce(ss.total_sold_eth, 0)) as total_spent_eth,
  coalesce(ps.total_booster_spent_pol, 0) as total_booster_spent_pol,
  h.holdings_pol_value,
  h.holdings_eth_value,
  h.holdings_booster_value,
  coalesce(pay.total_earned_usd, 0) as total_earned_usd,
  coalesce(pay.total_earned_pol, 0) as total_earned_pol,
  coalesce(pay.total_earned_eth, 0) as total_earned_eth,
  12 + least(h.held_boosters * 0.5, 8) as effective_apr,
  coalesce(pay.total_earned_usd, 0) - greatest(0, coalesce(ps.total_spent_excluding_compounded_usd, 0) - coalesce(ss.total_sold_usd, 0)) as net_position_usd,
  coalesce(pay.total_earned_pol, 0) - greatest(0, coalesce(ps.total_spent_pol, 0) - coalesce(ss.total_sold_pol, 0)) as net_pol,
  coalesce(pay.total_earned_eth, 0) - greatest(0, coalesce(ps.total_spent_eth, 0) - coalesce(ss.total_sold_eth, 0)) as net_eth
from holdings h
left join purchase_stats ps on ps.wallet_address = h.wallet_address
left join sale_stats ss on ss.wallet_address = h.wallet_address
left join payout_stats pay on pay.wallet_address = h.wallet_address;

-- RLS Policies
alter table contracts enable row level security;
alter table seller_wallets enable row level security;
alter table payout_wallets enable row level security;
alter table nft_transfers enable row level security;
alter table payout_transfers enable row level security;
alter table price_cache enable row level security;
alter table sync_cursors enable row level security;
alter table token_metadata enable row level security;

-- Public read access (for leaderboard)
create policy "Public read contracts" on contracts for select using (true);
create policy "Public read seller_wallets" on seller_wallets for select using (true);
create policy "Public read payout_wallets" on payout_wallets for select using (true);
create policy "Public read nft_transfers" on nft_transfers for select using (true);
create policy "Public read payout_transfers" on payout_transfers for select using (true);
create policy "Public read price_cache" on price_cache for select using (true);
create policy "Public read sync_cursors" on sync_cursors for select using (true);
create policy "Public read token_metadata" on token_metadata for select using (true);
