-- Add is_fc column to existing wallet_labels table
alter table wallet_labels add column if not exists is_fc boolean not null default false;
