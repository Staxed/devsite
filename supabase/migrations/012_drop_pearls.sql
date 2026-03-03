-- Drop all Pearls Tracker objects

-- Drop functions first (depend on tables)
DROP FUNCTION IF EXISTS wallet_stats_for_period(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS wallet_collection_stats();

-- Drop view
DROP VIEW IF EXISTS wallet_stats;

-- Drop tables (order respects foreign key constraints)
DROP TABLE IF EXISTS token_metadata CASCADE;
DROP TABLE IF EXISTS sync_cursors CASCADE;
DROP TABLE IF EXISTS price_cache CASCADE;
DROP TABLE IF EXISTS payout_transfers CASCADE;
DROP TABLE IF EXISTS nft_transfers CASCADE;
DROP TABLE IF EXISTS payout_wallets CASCADE;
DROP TABLE IF EXISTS seller_wallets CASCADE;
DROP TABLE IF EXISTS wallet_labels CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
