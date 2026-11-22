import { MAX_BODY_BYTES } from './schemas.js'

export const DEFAULT_ORIGINS = [
  'https://tradezdesk.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export function corsHeaders(req: Request, allowed: string[]): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !allowed.includes(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-sync-key',
    'access-control-max-age': '600',
    vary: 'origin',
  }
}

/** Browsers must come from an allowed origin. Server-to-server callers (the EA) send no Origin. */
export function assertOrigin(req: Request, allowed: string[]) {
  const origin = req.headers.get('origin')
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'Origin not allowed')
}

export function preflight(req: Request, allowed: string[]): Response {
  const headers = corsHeaders(req, allowed)
  return new Response(null, { status: headers['access-control-allow-origin'] ? 204 : 403, headers })
}

export function json(
  req: Request,
  allowed: string[],
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...corsHeaders(req, allowed),
      ...extra,
    },
  })
}

export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Payload too large')
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Payload too large')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HttpError(400, 'Body must be JSON')
  }
}

export function bearer(req: Request): string {
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  if (!m) throw new HttpError(401, 'Sign in required')
  return m[1].trim()
}
