-- TradeDesk core schema: profiles, MT5 accounts, sync keys, raw deals, trades.
-- Every table has Row Level Security. The browser uses the `authenticated` role;
-- the sync API uses the service role, which bypasses RLS and never trusts a
-- client-supplied user id.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'Asia/Tashkent' check (char_length(timezone) <= 64),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- accounts
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'MT5 account' check (char_length(name) between 1 and 80),
  broker text not null default 'XM' check (char_length(broker) <= 60),
  server text check (char_length(server) <= 120),
  login bigint,
  currency text not null default 'USD' check (char_length(currency) <= 10),
  leverage integer,
  starting_balance numeric(18, 2),
  balance numeric(18, 2),
  equity numeric(18, 2),
  last_sync_at timestamptz,
  last_heartbeat_at timestamptz,
  ea_version text check (char_length(ea_version) <= 40),
  resync_requested_at timestamptz,
  created_at timestamptz not null default now()
);
create index accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------- sync keys
create table public.sync_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- HMAC-SHA256(server pepper, plain key). The plain key is shown once and never stored.
  key_hash text not null unique,
  key_prefix text not null,
  label text check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index sync_keys_account_idx on public.sync_keys (account_id);

-- ---------------------------------------------------------------- raw deals (audit + re-processing)
create table public.deals_raw (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Deal tickets are unique per broker server, so uniqueness is per account.
  deal_ticket bigint not null,
  position_id bigint not null default 0,
  deal_time timestamptz not null,
  deal_type smallint not null,
  entry smallint not null default 0,
  profit numeric(18, 2) not null default 0,
  commission numeric(18, 2) not null default 0,
  swap numeric(18, 2) not null default 0,
  fee numeric(18, 2) not null default 0,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (account_id, deal_ticket)
);
create index deals_raw_position_idx on public.deals_raw (account_id, position_id);
create index deals_raw_time_idx on public.deals_raw (account_id, deal_time);

-- ---------------------------------------------------------------- trades
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  position_id bigint,
  -- A netting reversal keeps the MT5 position id, so one position can hold several legs.
  leg smallint not null default 0,
  ticket_in bigint,
  ticket_out bigint[] not null default '{}',
  symbol text not null check (char_length(symbol) <= 40),
  symbol_raw text check (char_length(symbol_raw) <= 40),
  instrument_group text not null default 'Other'
    check (instrument_group in ('Gold', 'Nasdaq', 'FX', 'Indices', 'Crypto', 'Other')),
  direction text not null check (direction in ('long', 'short')),
  status text not null default 'closed' check (status in ('open', 'closed')),
  volume numeric(18, 4),
  closed_volume numeric(18, 4),
  open_time timestamptz not null,
  close_time timestamptz,
  open_price numeric(20, 8),
  close_price numeric(20, 8),
  sl numeric(20, 8),
  tp numeric(20, 8),
  commission numeric(18, 2) not null default 0,
  swap numeric(18, 2) not null default 0,
  fee numeric(18, 2) not null default 0,
  gross_profit numeric(18, 2) not null default 0,
  net_profit numeric(18, 2) not null default 0,
  r_multiple numeric(12, 4),
  magic bigint,
  comment text check (char_length(comment) <= 255),
  history_complete boolean not null default true,
  source text not null default 'manual' check (source in ('mt5', 'manual', 'csv')),
  -- Journal fields: always editable by the owner.
  notes text check (char_length(notes) <= 20000),
  setup_tag text check (char_length(setup_tag) <= 80),
  emotion text check (char_length(emotion) <= 40),
  rating smallint check (rating between 1 and 5),
  rules_followed boolean,
  screenshots text[] not null default '{}',
  session text check (session in ('asia', 'london', 'newyork', 'overlap', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, position_id, leg),
  constraint mt5_trades_have_position check (
    source <> 'mt5' or (account_id is not null and position_id is not null)
  )
);
create index trades_user_close_idx on public.trades (user_id, close_time desc);
create index trades_account_close_idx on public.trades (account_id, close_time desc);

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trades_touch before update on public.trades
  for each row execute function public.touch_updated_at();

-- Numbers on MT5 trades come from the broker. Owners may journal them
-- (notes, tags, emotion, rating, rules, screenshots) but not rewrite them.
create or replace function public.guard_trade_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- service role / migrations
  end if;
  if new.user_id is distinct from old.user_id
     or new.account_id is distinct from old.account_id
     or new.source is distinct from old.source then
    raise exception 'trade ownership and source are read-only' using errcode = '42501';
  end if;
  if old.source = 'mt5' and (
       new.position_id is distinct from old.position_id
    or new.leg is distinct from old.leg
    or new.ticket_in is distinct from old.ticket_in
    or new.ticket_out is distinct from old.ticket_out
    or new.symbol is distinct from old.symbol
    or new.symbol_raw is distinct from old.symbol_raw
    or new.direction is distinct from old.direction
    or new.status is distinct from old.status
    or new.volume is distinct from old.volume
    or new.closed_volume is distinct from old.closed_volume
    or new.open_time is distinct from old.open_time
    or new.close_time is distinct from old.close_time
    or new.open_price is distinct from old.open_price
    or new.close_price is distinct from old.close_price
    or new.sl is distinct from old.sl
    or new.tp is distinct from old.tp
    or new.commission is distinct from old.commission
    or new.swap is distinct from old.swap
    or new.fee is distinct from old.fee
    or new.gross_profit is distinct from old.gross_profit
    or new.net_profit is distinct from old.net_profit
    or new.r_multiple is distinct from old.r_multiple
    or new.magic is distinct from old.magic
    or new.comment is distinct from old.comment
    or new.history_complete is distinct from old.history_complete
  ) then
    raise exception 'MT5 trade numbers are read-only; only journal fields can change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trades_guard before update on public.trades
  for each row execute function public.guard_trade_update();

-- New users get a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- privileges
-- Nothing is readable anonymously.
revoke all on public.profiles, public.accounts, public.sync_keys, public.deals_raw, public.trades from anon;

-- Accounts: the browser may create and rename accounts, set a starting balance and
-- request a re-sync. Balance, equity, login and sync timestamps are server-owned.
revoke insert, update on public.accounts from authenticated;
grant insert (user_id, name, broker, starting_balance) on public.accounts to authenticated;
grant update (name, broker, starting_balance, resync_requested_at) on public.accounts to authenticated;

-- Sync keys: the hash is never readable; keys are created and revoked by the API.
revoke all on public.sync_keys from authenticated;
grant select (id, account_id, key_prefix, label, created_at, last_used_at, revoked_at)
  on public.sync_keys to authenticated;

-- Raw deals are server-written.
revoke insert, update, delete on public.deals_raw from authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.sync_keys enable row level security;
alter table public.deals_raw enable row level security;
alter table public.trades enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile: create" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own accounts: read" on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own accounts: create" on public.accounts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own accounts: update" on public.accounts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own accounts: delete" on public.accounts
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own sync keys: read" on public.sync_keys
  for select to authenticated using (
    exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );

create policy "own deals: read" on public.deals_raw
  for select to authenticated using (
    exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );

create policy "own trades: read" on public.trades
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own trades: create manual" on public.trades
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and source in ('manual', 'csv')
    and (
      account_id is null
      or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
    )
  );
create policy "own trades: update" on public.trades
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own trades: delete manual" on public.trades
  for delete to authenticated using (user_id = (select auth.uid()) and source <> 'mt5');

-- ---------------------------------------------------------------- daily stats
-- Per account and calendar day in the owner's timezone. security_invoker keeps RLS in force.
create view public.daily_stats with (security_invoker = true) as
with acct as (
  select a.id as account_id, a.balance, coalesce(p.timezone, 'UTC') as tz
  from public.accounts a
  left join public.profiles p on p.user_id = a.user_id
),
cash as (
  select d.account_id,
         (d.deal_time at time zone acct.tz)::date as day,
         sum(d.profit + d.commission + d.swap + d.fee) as cash,
         sum(case when d.deal_type in (2, 3, 5, 6) and d.profit > 0 then d.profit else 0 end) as deposits,
         sum(case when d.deal_type in (2, 3, 5, 6) and d.profit < 0 then -d.profit else 0 end) as withdrawals
  from public.deals_raw d
  join acct using (account_id)
  group by 1, 2
),
closed as (
  select t.account_id,
         (t.close_time at time zone acct.tz)::date as day,
         sum(t.net_profit) as net_pnl,
         count(*) as trade_count,
         count(*) filter (where t.net_profit > 0) as wins,
         count(*) filter (where t.net_profit < 0) as losses
  from public.trades t
  join acct using (account_id)
  where t.status = 'closed' and t.close_time is not null
  group by 1, 2
),
days as (
  select account_id, day from cash
  union
  select account_id, day from closed
)
select days.account_id,
       days.day,
       coalesce(closed.net_pnl, 0)::numeric(18, 2) as net_pnl,
       coalesce(closed.trade_count, 0)::int as trade_count,
       coalesce(closed.wins, 0)::int as wins,
       coalesce(closed.losses, 0)::int as losses,
       coalesce(cash.deposits, 0)::numeric(18, 2) as deposits,
       coalesce(cash.withdrawals, 0)::numeric(18, 2) as withdrawals,
       (acct.balance - coalesce(sum(coalesce(cash.cash, 0)) over (
          partition by days.account_id order by days.day desc
          rows between unbounded preceding and 1 preceding
        ), 0))::numeric(18, 2) as balance_close
from days
join acct using (account_id)
left join cash using (account_id, day)
left join closed using (account_id, day);

grant select on public.daily_stats to authenticated;
revoke all on public.daily_stats from anon;

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.trades, public.accounts;
