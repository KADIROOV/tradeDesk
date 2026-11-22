/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** '1' when the MetaApi password connection is configured (METAAPI_TOKEN on the server). */
  readonly VITE_PASSWORD_CONNECT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
