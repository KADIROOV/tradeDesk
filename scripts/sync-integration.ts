/**
 * Live integration test for /api/mt5/sync and /api/mt5/heartbeat.
 *
 *   npm run test:sync -- --url https://tradezdesk.vercel.app --key tdk_...
 *
 * Use a key from a TEST account (e.g. the "Simulator" account): the first sync binds
 * the key to the fake MT5 login used here. It posts a batch, re-posts it with
 * duplicates, and checks idempotency and totals against the local trade builder.
 */
import { buildTrades } from '../src/lib/mt5/buildTrades.js'
import { simulateDeals } from '../src/lib/mt5/simulate.js'

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const url = (arg('url', 'http://localhost:3000') ?? '').replace(/\/$/, '')
const key = arg('key') ?? process.env.SYNC_KEY ?? ''
const login = Number(arg('login', '900000002'))
if (!key.startsWith('tdk_')) {
  console.error('Pass --key tdk_… (or SYNC_KEY env) from a test account.')
  process.exit(2)
}

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-key': key },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json }
}

const startTicket = 7_000_000 + (Math.floor(Date.now() / 1000) % 1_000_000) * 10
const deals = simulateDeals({
  startTicket,
  startTime: Math.floor(Date.now() / 1000) - 86_400,
  trades: 8,
  spacing: 1800,
  seed: 42,
})
const expected = buildTrades(deals)
const account = {
  login,
  server: 'TradeDesk-Integration',
  currency: 'USD',
  leverage: 500,
  balance: 10_000,
  equity: 10_000,
}

const hb = await post('/api/mt5/heartbeat', { account, ea_version: 'integration' })
check(
  'heartbeat accepted',
  hb.status === 200,
  `HTTP ${hb.status} ${JSON.stringify(hb.json).slice(0, 120)}`,
)

const first = await post('/api/mt5/sync', { account, deals })
check('first batch accepted', first.status === 200, `HTTP ${first.status}`)
check(
  'every deal stored',
  first.json.stored === deals.length,
  `stored=${String(first.json.stored)} of ${deals.length}`,
)
check(
  'trades built match local builder',
  first.json.trades_upserted === expected.length,
  `${String(first.json.trades_upserted)} vs ${expected.length}`,
)
check(
  'closed trades',
  first.json.closed_trades === expected.filter((t) => t.status === 'closed').length,
)

const again = await post('/api/mt5/sync', { account, deals: [...deals, deals[0], deals[1]] })
check('re-send accepted', again.status === 200)
check('re-send stores nothing new', again.json.stored === 0, `stored=${String(again.json.stored)}`)
check(
  're-send reports duplicates',
  again.json.duplicates === deals.length,
  `duplicates=${String(again.json.duplicates)}`,
)

const bad = await post('/api/mt5/sync', { account, deals: [{ ticket: -1 }] })
check(
  'invalid deal rejected per item',
  bad.status === 400 && bad.json.invalid === 1,
  `HTTP ${bad.status}`,
)

const wrongKey = await fetch(`${url}/api/mt5/sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-sync-key': `tdk_${'x'.repeat(43)}` },
  body: JSON.stringify({ account, deals: [] }),
})
check('unknown key rejected', wrongKey.status === 401, `HTTP ${wrongKey.status}`)

const net = expected.filter((t) => t.status === 'closed').reduce((s, t) => s + t.net_profit, 0)
console.log(`\nExpected net P&L of this batch: ${net.toFixed(2)} across ${expected.length} trades.`)
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
