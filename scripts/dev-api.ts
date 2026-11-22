/**
 * Local sync API on http://localhost:3000 backed by the in-memory store, for
 * testing the EA, the simulator and the integration script without Supabase.
 *
 *   npm run dev:api        → prints a ready-to-use sync key
 */
import { createServer } from 'node:http'
import { handleHeartbeat, handleSync, route, type Deps } from '../server/handlers.js'
import { generateSyncKey, hashSyncKey } from '../server/keys.js'
import { MemoryStore } from '../server/memoryStore.js'

const PORT = Number(process.env.PORT ?? 3000)
const store = new MemoryStore()
const pepper = 'local-dev-pepper-local-dev-pepper-0000'
const accountId = store.addAccount('00000000-0000-4000-8000-000000000001')
const key = generateSyncKey()
await store.createKey(accountId, hashSyncKey(key, pepper), key.slice(0, 10))
const deps: Deps = {
  store,
  pepper,
  allowedOrigins: ['http://localhost:5173'],
  apiUrl: `http://localhost:${PORT}`,
}
const routes: Record<string, (r: Request) => Promise<Response>> = {
  '/api/mt5/sync': route(handleSync, () => deps, deps.allowedOrigins),
  '/api/mt5/heartbeat': route(handleHeartbeat, () => deps, deps.allowedOrigins),
}

createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const handler = routes[(req.url ?? '').split('?')[0]]
  if (!handler) {
    res.writeHead(404).end()
    return
  }
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  const response = await handler(
    new Request(`http://localhost:${PORT}${req.url}`, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    }),
  )
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(await response.text())
  const trades = [...store.trades.values()]
  console.log(
    `${req.method} ${req.url} → ${response.status} · deals ${store.deals.size} · trades ${trades.length} · net ${trades.reduce((s, t) => s + t.net_profit, 0).toFixed(2)}`,
  )
}).listen(PORT, () => {
  console.log(`In-memory sync API on http://localhost:${PORT}`)
  console.log(`Sync key: ${key}`)
})
