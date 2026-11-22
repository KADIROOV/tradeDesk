/**
 * Row Level Security and privilege tests.
 * Runs every migration in supabase/migrations against an in-process Postgres
 * (PGlite) with minimal stand-ins for Supabase's auth/storage schemas.
 */
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to authenticated;
  grant all on storage.objects to authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
let db: PGlite
let accountA = ''
let accountB = ''
let mt5TradeA = ''
let manualTradeA = ''

async function asUser(uid: string | null) {
  await db.exec('reset role')
  if (uid) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid])
    await db.exec('set role authenticated')
  } else {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await db.exec('set role anon')
  }
}
async function asService() {
  await db.exec('reset role')
}
/** True only when Postgres refuses for a security reason (not for a typo in the test SQL). */
async function rejects(sql: string, params: unknown[] = []) {
  try {
    await db.query(sql, params)
    return false
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/permission denied|row-level security|read-only/i.test(msg)) return true
    throw new Error(`Unexpected error (not a security refusal): ${msg}`, { cause: e })
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  for (const f of readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  }
  // Seed as the service role (bypasses RLS, like the sync API).
  await db.query(
    `insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`,
    [A, B],
  )
  await db.query(`update public.profiles set timezone = 'Asia/Tashkent' where user_id = $1`, [A])
  accountA = (
    await db.query<{ id: string }>(
      `insert into public.accounts (user_id, name, login, server, balance) values ($1, 'XM A', 111, 'XMGlobal-MT5 5', 10500) returning id`,
      [A],
    )
  ).rows[0].id
  accountB = (
    await db.query<{ id: string }>(
      `insert into public.accounts (user_id, name, balance) values ($1, 'XM B', 5000) returning id`,
      [B],
    )
  ).rows[0].id
  await db.query(
    `insert into public.sync_keys (account_id, key_hash, key_prefix) values ($1, 'hash-a', 'tdk_aaaa'), ($2, 'hash-b', 'tdk_bbbb')`,
    [accountA, accountB],
  )
  // 20:30 UTC on 1 Mar is 2 Mar in Tashkent.
  await db.query(
    `insert into public.deals_raw (account_id, deal_ticket, position_id, deal_time, deal_type, entry, profit, payload) values
      ($1, 1, 0, '2026-02-28T09:00:00Z', 2, 0, 10000, '{}'),
      ($1, 2, 7, '2026-03-01T20:00:00Z', 0, 0, 0, '{}'),
      ($1, 3, 7, '2026-03-01T20:30:00Z', 1, 1, 500, '{}'),
      ($2, 1, 9, '2026-03-01T10:00:00Z', 0, 0, 0, '{}')`,
    [accountA, accountB],
  )
  mt5TradeA = (
    await db.query<{ id: string }>(
      `insert into public.trades (user_id, account_id, position_id, symbol, direction, open_time, close_time, open_price, close_price, net_profit, source)
       values ($1, $2, 7, 'XAUUSD', 'long', '2026-03-01T20:00:00Z', '2026-03-01T20:30:00Z', 2000, 2005, 500, 'mt5') returning id`,
      [A, accountA],
    )
  ).rows[0].id
  await db.query(
    `insert into public.trades (user_id, account_id, position_id, symbol, direction, open_time, close_time, net_profit, source)
     values ($1, $2, 9, 'EURUSD', 'short', '2026-03-01T10:00:00Z', '2026-03-01T11:00:00Z', -40, 'mt5')`,
    [B, accountB],
  )
}, 60_000)

describe('isolation between users', () => {
  it('a user sees only their own accounts, trades, deals and keys', async () => {
    await asUser(A)
    expect((await db.query(`select id from public.accounts`)).rows).toHaveLength(1)
    expect((await db.query(`select id from public.trades`)).rows).toHaveLength(1)
    expect((await db.query(`select id from public.deals_raw`)).rows).toHaveLength(3)
    expect((await db.query(`select id, key_prefix from public.sync_keys`)).rows).toEqual([
      expect.objectContaining({ key_prefix: 'tdk_aaaa' }),
    ])
  })
  it('anonymous users see nothing', async () => {
    await asUser(null)
    expect(await rejects(`select * from public.trades`)).toBe(true)
    expect(await rejects(`select * from public.accounts`)).toBe(true)
  })
  it('cannot read another userâ€™s rows even by id', async () => {
    await asUser(A)
    expect(
      (await db.query(`select id from public.accounts where id = $1`, [accountB])).rows,
    ).toHaveLength(0)
  })
  it('cannot write into another userâ€™s account', async () => {
    await asUser(A)
    const r = await db.query(`update public.accounts set name = 'pwned' where id = $1`, [accountB])
    expect(r.affectedRows).toBe(0)
    expect(
      await rejects(
        `insert into public.trades (user_id, account_id, symbol, direction, open_time, source) values ($1, $2, 'X', 'long', now(), 'manual')`,
        [A, accountB],
      ),
    ).toBe(true)
  })
})

describe('sync keys', () => {
  it('the key hash is never readable from the browser', async () => {
    await asUser(A)
    expect(await rejects(`select key_hash from public.sync_keys`)).toBe(true)
  })
  it('the browser cannot create or revoke keys directly', async () => {
    await asUser(A)
    expect(
      await rejects(
        `insert into public.sync_keys (account_id, key_hash, key_prefix) values ($1, 'x', 'y')`,
        [accountA],
      ),
    ).toBe(true)
    expect(await rejects(`update public.sync_keys set revoked_at = now()`)).toBe(true)
  })
})

describe('MT5 trades are read-only except journal fields', () => {
  it('journal fields can be edited', async () => {
    await asUser(A)
    const r = await db.query(
      `update public.trades set notes = 'clean break', setup_tag = 'Breakout', emotion = 'Calm', rating = 4, rules_followed = true, screenshots = '{a/b.png}' where id = $1`,
      [mt5TradeA],
    )
    expect(r.affectedRows).toBe(1)
  })
  it('broker numbers cannot be changed', async () => {
    await asUser(A)
    expect(
      await rejects(`update public.trades set net_profit = 99999 where id = $1`, [mt5TradeA]),
    ).toBe(true)
    expect(
      await rejects(`update public.trades set close_price = 1 where id = $1`, [mt5TradeA]),
    ).toBe(true)
    expect(
      await rejects(`update public.trades set source = 'manual' where id = $1`, [mt5TradeA]),
    ).toBe(true)
  })
  it('MT5 trades cannot be deleted or forged from the browser', async () => {
    await asUser(A)
    const del = await db.query(`delete from public.trades where id = $1`, [mt5TradeA])
    expect(del.affectedRows).toBe(0)
    expect(
      await rejects(
        `insert into public.trades (user_id, account_id, position_id, symbol, direction, open_time, source) values ($1, $2, 99, 'X', 'long', now(), 'mt5')`,
        [A, accountA],
      ),
    ).toBe(true)
  })
  it('the service role (sync API) can update numbers', async () => {
    await asService()
    const r = await db.query(`update public.trades set net_profit = 501 where id = $1`, [mt5TradeA])
    expect(r.affectedRows).toBe(1)
  })
})

describe('manual trades', () => {
  it('can be created, fully edited and deleted by the owner', async () => {
    await asUser(A)
    manualTradeA = (
      await db.query<{ id: string }>(
        `insert into public.trades (user_id, symbol, direction, open_time, close_time, net_profit, source) values ($1, 'NAS100', 'long', now(), now(), 120, 'manual') returning id`,
        [A],
      )
    ).rows[0].id
    expect(
      (await db.query(`update public.trades set net_profit = 130 where id = $1`, [manualTradeA]))
        .affectedRows,
    ).toBe(1)
    expect(
      (await db.query(`delete from public.trades where id = $1`, [manualTradeA])).affectedRows,
    ).toBe(1)
  })
  it('cannot be created for someone else', async () => {
    await asUser(A)
    expect(
      await rejects(
        `insert into public.trades (user_id, symbol, direction, open_time, source) values ($1, 'X', 'long', now(), 'manual')`,
        [B],
      ),
    ).toBe(true)
  })
})

describe('accounts: server-owned columns', () => {
  it('owner can rename, set a starting balance and request a re-sync', async () => {
    await asUser(A)
    const r = await db.query(
      `update public.accounts set name = 'XM main', starting_balance = 10000, resync_requested_at = now() where id = $1`,
      [accountA],
    )
    expect(r.affectedRows).toBe(1)
  })
  it('owner cannot fake balance, equity, login or sync time', async () => {
    await asUser(A)
    expect(
      await rejects(`update public.accounts set balance = 1e9 where id = $1`, [accountA]),
    ).toBe(true)
    expect(await rejects(`update public.accounts set login = 1 where id = $1`, [accountA])).toBe(
      true,
    )
    expect(
      await rejects(`update public.accounts set last_heartbeat_at = now() where id = $1`, [
        accountA,
      ]),
    ).toBe(true)
  })
  it('owner can create an account only for themselves', async () => {
    await asUser(A)
    expect(
      (await db.query(`insert into public.accounts (user_id, name) values ($1, 'Second')`, [A]))
        .affectedRows,
    ).toBe(1)
    expect(
      await rejects(`insert into public.accounts (user_id, name) values ($1, 'Evil')`, [B]),
    ).toBe(true)
  })
  it('raw deals cannot be written from the browser', async () => {
    await asUser(A)
    expect(
      await rejects(
        `insert into public.deals_raw (account_id, deal_ticket, deal_time, deal_type, payload) values ($1, 999, now(), 0, '{}')`,
        [accountA],
      ),
    ).toBe(true)
  })
})

describe('daily_stats view', () => {
  it('buckets by the ownerâ€™s timezone and respects RLS', async () => {
    await asUser(A)
    const rows = (
      await db.query<{
        day: string
        net_pnl: string
        trade_count: number
        deposits: string
        balance_close: string
      }>(
        `select to_char(day, 'YYYY-MM-DD') as day, net_pnl, trade_count, deposits, balance_close from public.daily_stats order by day`,
      )
    ).rows
    // Deposit on 28 Feb; the trade closed 20:30 UTC on 1 Mar = 2 Mar in Tashkent.
    expect(rows.map((r) => r.day)).toEqual(['2026-02-28', '2026-03-02'])
    const mar2 = rows[1]
    expect(Number(mar2.net_pnl)).toBe(501)
    expect(mar2.trade_count).toBe(1)
    expect(Number(mar2.balance_close)).toBe(10500)
    expect(Number(rows[0].deposits)).toBe(10000)
    expect(Number(rows[0].balance_close)).toBe(10000) // 10500 âˆ’ 500 after
  })
})

describe('profiles and storage', () => {
  it('new users get a profile automatically, readable only by them', async () => {
    await asUser(A)
    const rows = (
      await db.query<{ user_id: string; timezone: string }>(
        `select user_id, timezone from public.profiles`,
      )
    ).rows
    expect(rows).toEqual([{ user_id: A, timezone: 'Asia/Tashkent' }])
  })
  it('screenshots are confined to the userâ€™s own folder', async () => {
    await asUser(A)
    expect(
      (
        await db.query(`insert into storage.objects (bucket_id, name) values ('screenshots', $1)`, [
          `${A}/shot.png`,
        ])
      ).affectedRows,
    ).toBe(1)
    expect(
      await rejects(`insert into storage.objects (bucket_id, name) values ('screenshots', $1)`, [
        `${B}/shot.png`,
      ]),
    ).toBe(true)
    await asUser(B)
    expect((await db.query(`select name from storage.objects`)).rows).toHaveLength(0)
  })
})
