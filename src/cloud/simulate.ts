import { simulateDeals } from '@/lib/mt5/simulate'
import { apiBase } from './client'
import { createAccount, createKey, revokeKey, useCloud } from './store'

const SIM_NAME = 'Simulator (test data)'
const SIM_LOGIN = 900000001

/**
 * Exercise the real sync pipeline from the browser: a separate "Simulator"
 * account gets a temporary key, simulated deals are POSTed to /api/mt5/sync
 * exactly like the EA does (one trade every ~2 s), then the key is revoked.
 */
export async function runSimulation(trades: number, onProgress: (done: number) => void) {
  let account = useCloud.getState().accounts.find((a) => a.name === SIM_NAME)
  if (!account)
    account = await createAccount({ name: SIM_NAME, broker: 'Simulated', starting_balance: 10000 })
  const key = await createKey(account.id, 'simulator', true)
  const send = async (path: string, body: unknown) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': key.key },
      body: JSON.stringify(body),
    })
    if (!res.ok)
      throw new Error(
        ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`,
      )
    return res.json() as Promise<unknown>
  }
  try {
    const now = Math.floor(Date.now() / 1000)
    const startTicket = 5_000_000 + Math.floor((Date.now() / 1000) % 1_000_000) * 20
    const all = simulateDeals({
      startTicket,
      startTime: now - trades * 90,
      trades,
      spacing: 60,
      deposit: account.balance === null ? 10000 : undefined,
    })
    let balance = Number(account.balance ?? 0)
    // Send the deposit (if any) and then one position at a time, like a live terminal.
    const byPosition = new Map<number, typeof all>()
    for (const d of all)
      byPosition.set(d.position_id, [...(byPosition.get(d.position_id) ?? []), d])
    let done = 0
    for (const [, deals] of byPosition) {
      balance += deals.reduce((s, d) => s + d.profit + d.commission + d.swap + d.fee, 0)
      const snapshot = {
        login: SIM_LOGIN,
        server: 'TradeDesk-Simulator',
        currency: 'USD',
        leverage: 500,
        balance: Math.round(balance * 100) / 100,
        equity: Math.round(balance * 100) / 100,
      }
      await send('/api/mt5/heartbeat', { account: snapshot, ea_version: 'simulator' })
      await send('/api/mt5/sync', { account: snapshot, deals, ea_version: 'simulator' })
      if (deals[0].position_id > 0) onProgress(++done)
      await new Promise((r) => window.setTimeout(r, 1800))
    }
  } finally {
    await revokeKey(key.id).catch(() => undefined)
  }
  return account.id
}
