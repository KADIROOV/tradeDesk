/**
 * Create or remove a throwaway user + account + sync key on the real database,
 * for running scripts/sync-integration.ts against a deployment.
 *
 *   npx tsx scripts/integration-fixture.ts create .env.local <out-file>
 *   npx tsx scripts/integration-fixture.ts delete .env.local
 *
 * Uses the service role key and the sync-key pepper from the env file. The key
 * is written to <out-file>, never printed. Deleting the user cascades to its
 * account, keys, raw deals and trades.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { generateSyncKey, hashSyncKey, keyDisplayPrefix } from '../server/keys.js'

const [action, envFile, outFile] = process.argv.slice(2)
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const EMAIL = 'integration-test@tradedesk.invalid'
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function findUser() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === EMAIL) ?? null
}

if (action === 'create') {
  let user = await findUser()
  if (!user) {
    const r = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true })
    if (r.error) throw r.error
    user = r.data.user
  }
  const acc = await admin
    .from('accounts')
    .insert({ user_id: user.id, name: 'Integration test', broker: 'Test' })
    .select('id')
    .single()
  if (acc.error) throw acc.error
  const key = generateSyncKey()
  const k = await admin
    .from('sync_keys')
    .insert({
      account_id: acc.data.id,
      key_hash: hashSyncKey(key, env.SYNC_KEY_PEPPER),
      key_prefix: keyDisplayPrefix(key),
      label: 'integration',
    })
  if (k.error) throw k.error
  writeFileSync(outFile, key)
  console.log(`fixture ready: user ${user.id.slice(0, 8)}…, account ${acc.data.id.slice(0, 8)}…`)
} else if (action === 'delete') {
  const user = await findUser()
  if (user) {
    const r = await admin.auth.admin.deleteUser(user.id)
    if (r.error) throw r.error
    console.log('fixture deleted (account, keys, deals and trades cascaded)')
  } else console.log('no fixture to delete')
} else {
  console.error('usage: create|delete <env-file> [out-file]')
  process.exit(2)
}
