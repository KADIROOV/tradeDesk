import type { Deps } from './handlers.js'
import { DEFAULT_ORIGINS } from './http.js'
import { createMetaApi } from './metaapi.js'
import { SupabaseStore } from './supabaseStore.js'

let cached: Deps | null | undefined

export function allowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS
  return env
    ? env
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_ORIGINS
}

/** Built once per warm instance. Returns null until the deployment has its env vars. */
export function productionDeps(): Deps | null {
  if (cached !== undefined) return cached
  const url = process.env.SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pepper = process.env.SYNC_KEY_PEPPER
  if (!url || !service || !pepper || pepper.length < 32) {
    cached = null
    return cached
  }
  cached = {
    store: new SupabaseStore(url, service),
    pepper,
    allowedOrigins: allowedOrigins(),
    apiUrl: process.env.PUBLIC_APP_URL ?? 'https://tradezdesk.vercel.app',
    metaapi: process.env.METAAPI_TOKEN ? createMetaApi(process.env.METAAPI_TOKEN) : null,
    cronSecret: process.env.CRON_SECRET,
  }
  return cached
}
