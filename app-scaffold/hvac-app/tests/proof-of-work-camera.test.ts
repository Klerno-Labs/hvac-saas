import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

describe('proof-of-work photo input', () => {
  it('has capture="environment" to open camera on mobile', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../app/jobs/[jobId]/proof-of-work/form.tsx'),
      'utf-8'
    )
    expect(src).toContain('capture="environment"')
  })
})

describe('robert ingest removal', () => {
  it('robert-client and ingest routes are deleted', () => {
    const base = path.resolve(__dirname, '..')
    expect(existsSync(path.join(base, 'lib/robert-client.ts'))).toBe(false)
    expect(existsSync(path.join(base, 'app/api/internal/order-ingest/route.ts'))).toBe(false)
    expect(existsSync(path.join(base, 'app/api/internal/lead-ingest/route.ts'))).toBe(false)
  })
})
