/**
 * Stream simulated MT5 trades into TradeDesk exactly like the EA does, so the
 * live flow (Journal, Dashboard, Calendar updating in real time) can be watched
 * without trading.
 *
 *   npm run sim:mt5 -- --url https://tradezdesk.vercel.app --key tdk_... --trades 10 --every 5
 *
 * Use a key from a separate test account: the first sync binds the key to the
 * fake login below. (Settings → Data has a one-click in-app version.)
 */
import { simulateDeals } from '../src/lib/mt5/simulate.js'

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const url = (arg('url', 'http://localhost:3000') ?? '').replace(/\/$/, '')
const key = arg('key') ?? process.env.SYNC_KEY ?? ''
const trades = Number(arg('trades', '10'))
const every = Number(arg('every', '5'))
if (!key.startsWith('tdk_')) {
  console.error('Pass --key tdk_… from a test account.')
  process.exit(2)
}

const now = Math.floor(Date.now() / 1000)
const deals = simulateDeals({
  startTicket: 8_000_000 + (now % 1_000_000) * 10,
  startTime: now - trades * 120,
  trades,
  spacing: 120,
  deposit: 10_000,
})
const byPosition = new Map<number, typeof deals>()
for (const d of deals) byPosition.set(d.position_id, [...(byPosition.get(d.position_id) ?? []), d])

let balance = 0
for (const [position, batch] of byPosition) {
  balance += batch.reduce((s, d) => s + d.profit + d.commission + d.swap + d.fee, 0)
  const account = {
    login: 900000003,
    server: 'TradeDesk-Simulator',
    currency: 'USD',
    leverage: 500,
    balance: Math.round(balance * 100) / 100,
    equity: Math.round(balance * 100) / 100,
  }
  const res = await fetch(`${url}/api/mt5/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-key': key },
    body: JSON.stringify({ account, deals: batch, ea_version: 'sim-cli' }),
  })
  const json = (await res.json()) as { stored?: number; closed_trades?: number; error?: string }
  console.log(
    res.ok
      ? `${position === 0 ? 'deposit' : `position ${position}`}: stored ${json.stored}, closed trades ${json.closed_trades}, balance ${account.balance}`
      : `HTTP ${res.status}: ${json.error}`,
  )
  if (!res.ok) process.exit(1)
  await new Promise((r) => setTimeout(r, every * 1000))
}
