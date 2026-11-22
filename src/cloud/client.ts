import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Browser Supabase client (anon key + the user's session; Row Level Security
 * enforces access). Null when the deployment has no Supabase config, in which
 * case the app runs fully on-device as before.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    : null

export const cloudEnabled = supabase !== null

/** Base URL of the sync API (same origin as the app). */
export const apiBase =
  typeof window !== 'undefined' ? window.location.origin : 'https://tradezdesk.vercel.app'

/** Login + password connection needs a paid MetaApi token; hidden unless switched on. */
export const passwordConnectEnabled = import.meta.env.VITE_PASSWORD_CONNECT === '1'
