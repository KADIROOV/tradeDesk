import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eaSetFileText, utf16leWithBom } from '../src/lib/mt5/setFile.js'

describe('EA .set preset', () => {
  const text = eaSetFileText('https://tradezdesk.vercel.app', `tdk_${'a'.repeat(43)}`)

  it('sets the URL and key with CRLF lines', () => {
    expect(text).toContain('ApiUrl=https://tradezdesk.vercel.app\r\n')
    expect(text).toContain(`SyncKey=tdk_${'a'.repeat(43)}\r\n`)
  })

  it('only names inputs that exist in the EA source', () => {
    const src = readFileSync(join(process.cwd(), 'mt5', 'TradeDeskSync.mq5'), 'utf8')
    const inputs = [...src.matchAll(/^input\s+\w+\s+(\w+)\s*=/gm)].map((m) => m[1])
    const names = text
      .split('\r\n')
      .filter((l) => l && !l.startsWith(';'))
      .map((l) => l.split('=')[0])
    for (const n of names) expect(inputs).toContain(n)
  })

  it('encodes UTF-16LE with a BOM', () => {
    const bytes = utf16leWithBom('Ab')
    expect([...bytes]).toEqual([0xff, 0xfe, 0x41, 0x00, 0x62, 0x00])
  })
})
