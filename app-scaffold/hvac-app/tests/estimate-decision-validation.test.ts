import { describe, expect, it } from 'vitest'
import { approveEstimateSchema, declineEstimateSchema } from '@/lib/validations/estimate-decision'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2Z8AAAAASUVORK5CYII='
describe('customer estimate decision validation', () => {
  it('accepts a PNG signature and a trimmed signer name', () => {
    expect(approveEstimateSchema.parse({ signerName: '  Alex Customer  ', signatureDataUrl: png })).toMatchObject({ signerName: 'Alex Customer', signatureMethod: 'drawn' })
  })
  it('records the accessible typed signature method', () => {
    expect(approveEstimateSchema.parse({ signerName: 'Alex Customer', signatureDataUrl: png, signatureMethod: 'typed' }).signatureMethod).toBe('typed')
  })
  it.each(['data:image/svg+xml,<svg onload="alert(1)"/>', 'data:image/png;base64,YWJj', 'https://example.test/signature.png', 'data:image/png;base64,' + 'a'.repeat(250_001)])('rejects invalid or excessive signature data', signatureDataUrl => {
    expect(approveEstimateSchema.safeParse({ signerName: 'Alex Customer', signatureDataUrl }).success).toBe(false)
  })
  it('bounds signer names and decline reasons', () => {
    expect(declineEstimateSchema.safeParse({ signerName: ' ' }).success).toBe(false)
    expect(declineEstimateSchema.safeParse({ signerName: 'A'.repeat(201) }).success).toBe(false)
    expect(declineEstimateSchema.safeParse({ signerName: 'Alex', reason: 'a'.repeat(2001) }).success).toBe(false)
  })
})
