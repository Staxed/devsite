-- Migration 008: Add compounded columns to wallet_stats view and period function

-- Recreate wallet_stats view with compounded columns
drop view if exists wallet_stats;

create or replace view wallet_stats as
with purchase_stats as (
  select
    to_address as wallet_address,
    coalesce(sum(usd_value) filter (where is_purchase), 0) as total_spent_usd,
    coalesce(sum(usd_value) filter (where is_purchase and not is_compounded), 0) as total_spent_excluding_compounded_usd,
    coalesce(sum(native_value) filter (where is_purchase and native_currency = 'POL'), 0) as total_spent_pol,
    coalesce(sum(native_value) filter (where is_purchase and native_currency = 'ETH'), 0) as total_spent_eth,
    coalesce(sum(native_value) filter (where is_purchase and not is_compounded and native_currency = 'POL'), 0) as total_spent_excluding_compounded_pol,
    coalesce(sum(native_value) filter (where is_purchase and not is_compounded and native_currency = 'ETH'), 0) as total_spent_excluding_compounded_eth,
    coalesce(sum(native_value) filter (where is_purchase and is_compounded and native_currency = 'POL'), 0) as total_compounded_pol,
    coalesce(sum(native_value) filter (where is_purchase and is_compounded and native_currency = 'ETH'), 0) as total_compounded_eth,
    coalesce(sum(native_value) filter (where is_purchase and c.type = 'booster' and native_currency = 'POL'), 0) as total_booster_spent_pol
  from nft_transfers nt
  join contracts c on c.id = nt.contract_id
  where nt.is_purchase = true
  group by to_address
),
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
  greatest(0, coalesce(ps.total_spent_excluding_compounded_pol, 0) - coalesce(ss.total_sold_pol, 0)) as total_spent_excluding_compounded_pol,
  greatest(0, coalesce(ps.total_spent_excluding_compounded_eth, 0) - coalesce(ss.total_sold_eth, 0)) as total_spent_excluding_compounded_eth,
  coalesce(ps.total_compounded_pol, 0) as total_compounded_pol,
  coalesce(ps.total_compounded_eth, 0) as total_compounded_eth,
  coalesce(ps.total_booster_spent_pol, 0) as total_booster_spent_pol,
  h.holdings_pol_value,
  h.holdings_eth_value,
  h.holdings_booster_value,
  coalesce(pay.total_earned_usd, 0) as total_earned_usd,
  coalesce(pay.total_earned_pol, 0) as total_earned_pol,
  coalesce(pay.total_earned_eth, 0) as total_earned_eth,
  12 + least(h.held_boosters * 0.5, 8) as effective_apr,
  coalesce(pay.total_earned_usd, 0) - greatest(0, coalesce(ps.total_spent_excluding_compounded_usd, 0) - coalesce(ss.total_sold_usd, 0)) as net_position_usd,
  coalesce(pay.total_earned_pol, 0) - greatest(0, coalesce(ps.total_spent_excluding_compounded_pol, 0) - coalesce(ss.total_sold_pol, 0)) as net_pol,
  coalesce(pay.total_earned_eth, 0) - greatest(0, coalesce(ps.total_spent_excluding_compounded_eth, 0) - coalesce(ss.total_sold_eth, 0)) as net_eth
from holdings h
left join purchase_stats ps on ps.wallet_address = h.wallet_address
left join sale_stats ss on ss.wallet_address = h.wallet_address
left join payout_stats pay on pay.wallet_address = h.wallet_address;

-- Drop and recreate function (return type changed)
DROP FUNCTION IF EXISTS wallet_stats_for_period(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION wallet_stats_for_period(
    p_start timestamptz,
    p_end   timestamptz
)
RETURNS TABLE (
    wallet_address                          text,
    total_pearls                            bigint,
    pol_pearls                              bigint,
    eth_pearls                              bigint,
    total_boosters                          bigint,
    effective_apr                           numeric,
    total_spent_excluding_compounded_pol    numeric,
    total_spent_excluding_compounded_eth    numeric,
    total_compounded_pol                    numeric,
    total_compounded_eth                    numeric
)
LANGUAGE sql STABLE
AS $$
    WITH period_purchases AS (
        SELECT
            nt.to_address AS wallet_address,
            coalesce(sum(nt.quantity) FILTER (WHERE c.type = 'pearl'), 0)::bigint                                    AS total_pearls,
            coalesce(sum(nt.quantity) FILTER (WHERE c.type = 'pearl' AND c.chain = 'polygon'), 0)::bigint           AS pol_pearls,
            coalesce(sum(nt.quantity) FILTER (WHERE c.type = 'pearl' AND c.chain = 'base'), 0)::bigint              AS eth_pearls,
            coalesce(sum(nt.quantity) FILTER (WHERE c.type = 'booster'), 0)::bigint                                  AS total_boosters,
            coalesce(sum(nt.native_value) FILTER (WHERE NOT nt.is_compounded AND nt.native_currency = 'POL'), 0)    AS spent_pol,
            coalesce(sum(nt.native_value) FILTER (WHERE NOT nt.is_compounded AND nt.native_currency = 'ETH'), 0)    AS spent_eth,
            coalesce(sum(nt.native_value) FILTER (WHERE nt.is_compounded AND nt.native_currency = 'POL'), 0)        AS compounded_pol,
            coalesce(sum(nt.native_value) FILTER (WHERE nt.is_compounded AND nt.native_currency = 'ETH'), 0)        AS compounded_eth
        FROM nft_transfers nt
        JOIN contracts c ON c.id = nt.contract_id
        WHERE nt.is_purchase = true
          AND nt.timestamp >= p_start
          AND nt.timestamp <  p_end
        GROUP BY nt.to_address
    ),

    current_boosters AS (
        SELECT
            addr AS wallet_address,
            sum(net_qty) AS held_boosters
        FROM (
            SELECT to_address   AS addr, contract_id, token_id,  sum(quantity) AS net_qty FROM nft_transfers GROUP BY to_address,   contract_id, token_id
            UNION ALL
            SELECT from_address AS addr, contract_id, token_id, -sum(quantity) AS net_qty FROM nft_transfers GROUP BY from_address, contract_id, token_id
        ) raw
        JOIN contracts c ON c.id = raw.contract_id
        WHERE c.type = 'booster'
        GROUP BY addr
        HAVING sum(net_qty) > 0
    )

    SELECT
        pp.wallet_address,
        pp.total_pearls,
        pp.pol_pearls,
        pp.eth_pearls,
        pp.total_boosters,
        (12 + least(coalesce(cb.held_boosters, 0) * 0.5, 8))::numeric  AS effective_apr,
        pp.spent_pol                                                     AS total_spent_excluding_compounded_pol,
        pp.spent_eth                                                     AS total_spent_excluding_compounded_eth,
        pp.compounded_pol                                                AS total_compounded_pol,
        pp.compounded_eth                                                AS total_compounded_eth
    FROM period_purchases pp
    LEFT JOIN current_boosters cb ON cb.wallet_address = pp.wallet_address
    WHERE pp.total_pearls > 0
       OR pp.total_boosters > 0
       OR pp.compounded_pol > 0
       OR pp.compounded_eth > 0;
$$;
