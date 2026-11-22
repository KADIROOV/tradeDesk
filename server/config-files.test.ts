import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vercel and npm parse these strictly; a UTF-8 byte-order mark breaks deployments.
const files = [
  'package.json',
  'vercel.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.server.json',
  'public/manifest.webmanifest',
]

describe('deployment config files', () => {
  for (const f of files) {
    it(`${f} has no BOM and is valid JSON`, () => {
      const text = readFileSync(join(process.cwd(), f), 'utf8')
      expect(text.charCodeAt(0)).not.toBe(0xfeff)
      if (!f.startsWith('tsconfig')) expect(() => JSON.parse(text)).not.toThrow()
    })
  }
})
