-- Collection stats: unique token ownership per wallet per contract
CREATE OR REPLACE FUNCTION wallet_collection_stats()
RETURNS TABLE (
  wallet_address text,
  contract_id uuid,
  contract_name text,
  contract_type text,
  unique_owned bigint,
  total_possible bigint
) LANGUAGE sql STABLE AS $$
  WITH token_balances AS (
    SELECT addr, contract_id, token_id, SUM(delta) AS balance
    FROM (
      SELECT to_address AS addr, contract_id, token_id, quantity AS delta
      FROM nft_transfers
      UNION ALL
      SELECT from_address AS addr, contract_id, token_id, -quantity AS delta
      FROM nft_transfers
    ) movements
    GROUP BY addr, contract_id, token_id
    HAVING SUM(delta) > 0
  ),
  contract_totals AS (
    SELECT contract_id, COUNT(DISTINCT token_id) AS total_tokens
    FROM token_metadata
    GROUP BY contract_id
  ),
  wallet_contract_counts AS (
    SELECT
      tb.addr AS wallet_address,
      tb.contract_id,
      COUNT(DISTINCT tb.token_id) AS unique_owned
    FROM token_balances tb
    GROUP BY tb.addr, tb.contract_id
  )
  SELECT
    wcc.wallet_address,
    wcc.contract_id,
    c.name AS contract_name,
    c.type AS contract_type,
    wcc.unique_owned,
    COALESCE(ct.total_tokens, 0) AS total_possible
  FROM wallet_contract_counts wcc
  JOIN contracts c ON c.id = wcc.contract_id
  LEFT JOIN contract_totals ct ON ct.contract_id = wcc.contract_id;
$$;
