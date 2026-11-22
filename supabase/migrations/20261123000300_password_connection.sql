-- Connect an MT5 account with login + investor password + server (via MetaApi),
-- in addition to the Expert Advisor. The password itself is never stored here:
-- it is sent once to MetaApi, which keeps a read-only terminal connection.
alter table public.accounts
  add column connection_type text not null default 'ea'
    check (connection_type in ('ea', 'metaapi')),
  add column metaapi_account_id text unique,
  add column metaapi_region text check (char_length(metaapi_region) <= 40),
  add column connection_state text
    check (connection_state in ('connecting', 'connected', 'error', 'disconnected')),
  add column connection_error text check (char_length(connection_error) <= 300),
  -- True when MetaApi confirms the investor (read-only) password was used.
  add column investor_mode boolean,
  add column last_pull_at timestamptz,
  add column last_deal_time timestamptz;

-- These columns are server-owned: the existing column grants for `authenticated`
-- (name, broker, starting_balance, resync_requested_at) are deliberately unchanged.
