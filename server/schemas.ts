import { z } from 'zod'

export const MAX_DEALS_PER_BATCH = 500
export const MAX_BODY_BYTES = 1_500_000

const finite = z.number()
const ticket = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
// Strip ASCII control characters (code points below 0x20).
const stripControl = (s: string) => [...s].filter((c) => c.charCodeAt(0) >= 0x20).join('')
const shortText = (max: number) =>
  z
    .string()
    .max(max)
    .transform(stripControl)

export const DealSchema = z.object({
  ticket: ticket.refine((v) => v > 0, 'ticket must be positive'),
  order: ticket.default(0),
  position_id: ticket.default(0),
  // UTC epoch seconds, sanity-bounded to 2000-01-01 â€¦ 2100-01-01.
  time: z.number().int().min(946_684_800).max(4_102_444_800),
  time_msc: z.number().int().min(946_684_800_000).max(4_102_444_800_000).optional(),
  type: z.number().int().min(0).max(30),
  entry: z.number().int().min(0).max(3).default(0),
  symbol: shortText(40).default(''),
  volume: finite.min(0).max(1e6).default(0),
  price: finite.min(0).default(0),
  profit: finite.default(0),
  commission: finite.default(0),
  swap: finite.default(0),
  fee: finite.default(0),
  sl: finite.min(0).default(0),
  tp: finite.min(0).default(0),
  magic: z.number().int().default(0),
  comment: shortText(255).default(''),
  reason: z.number().int().min(0).max(100).optional(),
})
export type DealInput = z.infer<typeof DealSchema>

export const AccountSnapshotSchema = z.object({
  login: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  server: shortText(120),
  currency: shortText(10).default('USD'),
  leverage: z.number().int().min(0).max(100_000).optional(),
  balance: finite,
  equity: finite,
  company: shortText(120).optional(),
})
export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>

export const SyncBodySchema = z.object({
  account: AccountSnapshotSchema,
  // Items are validated one by one so a single bad deal does not sink the batch.
  deals: z.array(z.unknown()).max(MAX_DEALS_PER_BATCH),
  ea_version: shortText(40).optional(),
})

export const HeartbeatSchema = z.object({
  account: AccountSnapshotSchema,
  ea_version: shortText(40).optional(),
  queue_size: z.number().int().min(0).optional(),
  last_deal_ticket: ticket.optional(),
})

export const KeysBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    account_id: z.uuid(),
    label: shortText(80).optional(),
    revoke_others: z.boolean().optional(),
  }),
  z.object({ action: z.literal('revoke'), key_id: z.uuid() }),
])

export const RecalculateSchema = z.object({ account_id: z.uuid() })
