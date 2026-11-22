import { DEAL_ENTRY, DEAL_TYPE, isTradeDeal, type Mt5Deal } from './types.js'

const EPS = 1e-8

export interface BuiltTrade {
  position_id: number
  /** 0 for the first trade of a position; increments after each netting reversal. */
  leg: number
  status: 'open' | 'closed'
  symbol: string
  direction: 'long' | 'short'
  /** Total entry volume (lots). */
  volume: number
  closed_volume: number
  open_time: string
  close_time: string | null
  /** Volume-weighted average entry price; null when the entry is older than the synced history. */
  open_price: number | null
  close_price: number | null
  initial_sl: number | null
  tp: number | null
  commission: number
  swap: number
  fee: number
  gross_profit: number
  net_profit: number
  ticket_in: number | null
  ticket_out: number[]
  magic: number
  comment: string
  r_multiple: number | null
  /** False when the opening deals were outside the synced history window. */
  history_complete: boolean
}

interface Leg {
  direction: 'long' | 'short'
  entryVol: number
  entryNotional: number
  exitVol: number
  exitNotional: number
  openVol: number
  openTime: number
  closeTime: number | null
  initialSl: number | null
  firstSeenSl: number | null
  tp: number | null
  commission: number
  swap: number
  fee: number
  profit: number
  ticketIn: number | null
  ticketOut: number[]
  magic: number
  comment: string
  complete: boolean
}

const order = (d: Mt5Deal) => d.time_msc ?? d.time * 1000

function newLeg(direction: 'long' | 'short', d: Mt5Deal, complete: boolean): Leg {
  return {
    direction,
    entryVol: 0,
    entryNotional: 0,
    exitVol: 0,
    exitNotional: 0,
    openVol: 0,
    openTime: order(d),
    closeTime: null,
    initialSl: null,
    firstSeenSl: null,
    tp: null,
    commission: 0,
    swap: 0,
    fee: 0,
    profit: 0,
    ticketIn: null,
    ticketOut: [],
    magic: d.magic,
    comment: d.comment,
    complete,
  }
}

function addEntry(leg: Leg, d: Mt5Deal, volume: number) {
  if (leg.ticketIn === null) leg.ticketIn = d.ticket
  leg.entryVol += volume
  leg.entryNotional += volume * d.price
  leg.openVol += volume
  if (leg.initialSl === null && d.sl > 0) leg.initialSl = d.sl
  if (leg.tp === null && d.tp > 0) leg.tp = d.tp
  if (!leg.comment && d.comment) leg.comment = d.comment
}

function addExit(leg: Leg, d: Mt5Deal, volume: number) {
  leg.exitVol += volume
  leg.exitNotional += volume * d.price
  leg.openVol -= volume
  leg.closeTime = order(d)
  leg.ticketOut.push(d.ticket)
  if (leg.firstSeenSl === null && d.sl > 0) leg.firstSeenSl = d.sl
}

function addCosts(leg: Leg, d: Mt5Deal, share: number, includeProfit: boolean) {
  leg.commission += d.commission * share
  leg.fee += d.fee * share
  if (includeProfit) {
    leg.profit += d.profit
    leg.swap += d.swap
  }
}

const round = (v: number, dp = 8) => Math.round(v * 10 ** dp) / 10 ** dp
const money = (v: number) => Math.round(v * 100) / 100

function finish(positionId: number, index: number, symbol: string, leg: Leg): BuiltTrade {
  const closed = leg.openVol <= EPS && leg.exitVol > EPS
  const openPrice = leg.entryVol > EPS ? leg.entryNotional / leg.entryVol : null
  const closePrice = leg.exitVol > EPS ? leg.exitNotional / leg.exitVol : null
  const sl = leg.initialSl ?? leg.firstSeenSl
  let r: number | null = null
  if (closed && openPrice !== null && closePrice !== null && sl !== null) {
    const risk = Math.abs(openPrice - sl)
    // A stop at or beyond entry (already at break-even) carries no initial risk to measure.
    const sign = leg.direction === 'long' ? 1 : -1
    const stopOnLossSide = (openPrice - sl) * sign > 0
    if (risk > EPS && stopOnLossSide) r = round(((closePrice - openPrice) * sign) / risk, 4)
  }
  const net = leg.profit + leg.commission + leg.swap + leg.fee
  return {
    position_id: positionId,
    leg: index,
    status: closed ? 'closed' : 'open',
    symbol,
    direction: leg.direction,
    volume: round(leg.complete ? leg.entryVol : Math.max(leg.entryVol, leg.exitVol)),
    closed_volume: round(leg.exitVol),
    open_time: new Date(leg.openTime).toISOString(),
    close_time: closed && leg.closeTime !== null ? new Date(leg.closeTime).toISOString() : null,
    open_price: openPrice === null ? null : round(openPrice),
    close_price: closePrice === null ? null : round(closePrice),
    initial_sl: sl,
    tp: leg.tp,
    commission: money(leg.commission),
    swap: money(leg.swap),
    fee: money(leg.fee),
    gross_profit: money(leg.profit),
    net_profit: money(net),
    ticket_in: leg.ticketIn,
    ticket_out: leg.ticketOut,
    magic: leg.magic,
    comment: leg.comment,
    r_multiple: r,
    history_complete: leg.complete,
  }
}

/**
 * Turn raw MT5 deals into trades.
 *
 * Deals are grouped by POSITION_ID. Within a position:
 *  - IN deals open or scale in (volume-weighted entry price);
 *  - OUT and OUT_BY deals close part or all of it (partial closes, close-by);
 *  - an INOUT deal (netting reversal) closes the open volume and opens the
 *    remainder in the opposite direction as a new leg of the same position.
 * Balance, credit and other non-trading deals are ignored here.
 */
export function buildTrades(deals: Mt5Deal[]): BuiltTrade[] {
  const byPosition = new Map<number, Mt5Deal[]>()
  for (const d of deals) {
    if (!isTradeDeal(d) || d.position_id <= 0) continue
    const list = byPosition.get(d.position_id) ?? []
    list.push(d)
    byPosition.set(d.position_id, list)
  }

  const out: BuiltTrade[] = []
  for (const [positionId, list] of byPosition) {
    // Duplicate deliveries of the same ticket must not double count.
    const unique = [...new Map(list.map((d) => [d.ticket, d])).values()].sort(
      (a, b) => order(a) - order(b) || a.ticket - b.ticket,
    )
    const symbol = unique[0].symbol
    const legs: Leg[] = []
    let leg: Leg | null = null

    for (const d of unique) {
      const sideOfDeal: 'long' | 'short' = d.type === DEAL_TYPE.BUY ? 'long' : 'short'
      const opposite: 'long' | 'short' = sideOfDeal === 'long' ? 'short' : 'long'

      if (d.entry === DEAL_ENTRY.IN) {
        if (!leg || leg.openVol <= EPS) {
          leg = newLeg(sideOfDeal, d, true)
          legs.push(leg)
        }
        addEntry(leg, d, d.volume)
        addCosts(leg, d, 1, true)
      } else if (d.entry === DEAL_ENTRY.OUT || d.entry === DEAL_ENTRY.OUT_BY) {
        if (!leg || leg.openVol <= EPS) {
          // The opening deals are older than the synced history.
          leg = newLeg(opposite, d, false)
          leg.openVol = d.volume
          legs.push(leg)
        }
        addExit(leg, d, d.volume)
        addCosts(leg, d, 1, true)
      } else if (d.entry === DEAL_ENTRY.INOUT) {
        if (!leg || leg.openVol <= EPS) {
          // Reversal with an unknown prior leg: treat the whole deal as a new entry.
          leg = newLeg(sideOfDeal, d, true)
          legs.push(leg)
          addEntry(leg, d, d.volume)
          addCosts(leg, d, 1, true)
          continue
        }
        const closing = Math.min(leg.openVol, d.volume)
        const opening = d.volume - closing
        const closeShare = d.volume > 0 ? closing / d.volume : 1
        addExit(leg, d, closing)
        // Realised profit and swap belong to the leg being closed; commission and fees are split by volume.
        addCosts(leg, d, closeShare, true)
        if (opening > EPS) {
          leg = newLeg(sideOfDeal, d, true)
          legs.push(leg)
          addEntry(leg, d, opening)
          addCosts(leg, d, 1 - closeShare, false)
        }
      }
    }
    legs.forEach((l, i) => out.push(finish(positionId, i, symbol, l)))
  }
  return out.sort(
    (a, b) =>
      a.open_time.localeCompare(b.open_time) || a.position_id - b.position_id || a.leg - b.leg,
  )
}
