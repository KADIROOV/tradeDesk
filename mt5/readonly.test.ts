import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const raw = readFileSync(join(process.cwd(), 'mt5', 'TradeDeskSync.mq5'), 'utf8')
/** Code only: comments may explain what the EA does NOT do. */
const source = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

describe('TradeDeskSync.mq5 is strictly read-only', () => {
  const forbidden = [
    'OrderSend',
    'OrderSendAsync',
    'OrderCheck',
    'CTrade',
    'Trade.mqh',
    'PositionClose',
    'PositionModify',
    'PositionOpen',
    'OrderModify',
    'OrderDelete',
    'SendFTP',
    'SendMail',
    'TerminalInfo', // nothing about the terminal installation is sent
    'ACCOUNT_PASS',
  ]
  for (const token of forbidden) {
    it(`does not contain ${token}`, () => {
      expect(source.includes(token)).toBe(false)
    })
  }

  it('only talks to the two TradeDesk endpoints', () => {
    expect(source.match(/WebRequest\(/g)).toHaveLength(1)
    expect(source).toContain('"/api/mt5/sync"')
    expect(source).toContain('"/api/mt5/heartbeat"')
  })

  it('sends UTC timestamps and a sync key header, nothing credential-like', () => {
    expect(source).toContain('ServerMscToUtcMsc')
    expect(source).toContain('X-Sync-Key')
    expect(source).not.toMatch(/password/i)
  })

  it('reads only server, currency and company strings from the account', () => {
    const props = [...source.matchAll(/AccountInfoString\((\w+)\)/g)].map((m) => m[1])
    expect(new Set(props)).toEqual(new Set(['ACCOUNT_SERVER', 'ACCOUNT_CURRENCY', 'ACCOUNT_COMPANY']))
  })
})
