-- Migration 007: Leaderboard period support
-- Adds index on nft_transfers(timestamp) and a function for period-scoped wallet stats

-- Index for period-based queries
CREATE INDEX IF NOT EXISTS idx_nft_transfers_timestamp ON nft_transfers(timestamp);

-- Function: wallet_stats_for_period
-- Returns wallet stats (pearls, boosters, APR, spend) for a given time window.
-- APR is computed from all-time booster holdings, not period-scoped.
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
    total_spent_excluding_compounded_eth    numeric
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
            coalesce(sum(nt.native_value) FILTER (WHERE NOT nt.is_compounded AND nt.native_currency = 'ETH'), 0)    AS spent_eth
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
        pp.spent_eth                                                     AS total_spent_excluding_compounded_eth
    FROM period_purchases pp
    LEFT JOIN current_boosters cb ON cb.wallet_address = pp.wallet_address
    WHERE pp.total_pearls > 0
       OR pp.total_boosters > 0;
$$;
