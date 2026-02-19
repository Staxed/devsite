-- Replace single-column unique on tx_hash with composite unique on (tx_hash, to_address)
-- to support batch payout transactions that send to multiple recipients in one tx.
ALTER TABLE payout_transfers DROP CONSTRAINT payout_transfers_tx_hash_key;
ALTER TABLE payout_transfers ADD CONSTRAINT payout_transfers_tx_hash_to_address_key UNIQUE (tx_hash, to_address);
