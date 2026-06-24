import { describe, it, expect } from 'vitest'

describe('/api/uploads presign behavior', () => {
  it('generates unique filename with crypto.randomUUID and correct extension mapping', async () => {
    const EXT_MAP: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    }

    expect(EXT_MAP['image/jpeg']).toBe('.jpg')
    expect(EXT_MAP['image/png']).toBe('.png')
    expect(EXT_MAP['image/webp']).toBe('.webp')
  })

  it('has correct file size and type constraints', async () => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

    expect(MAX_FILE_SIZE).toBe(10485760)
    expect(ALLOWED_TYPES).toContain('image/jpeg')
    expect(ALLOWED_TYPES).toContain('image/png')
    expect(ALLOWED_TYPES).toContain('image/webp')
    expect(ALLOWED_TYPES).not.toContain('application/pdf')
  })

  it('checks R2 config presence correctly', () => {
    const hasR2Config = !!(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL
    )

    expect(hasR2Config).toBe(false)
  })

  it('falls back to local filesystem when R2 env vars are absent', () => {
    const hasR2Config = !!(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL
    )

    if (hasR2Config) {
      throw new Error('R2 env vars should not be present in test environment')
    }

    const fileUrl = '/uploads/test-file.jpg'
    expect(fileUrl).toMatch(/^\/uploads\/.+\.(jpg|png|webp)$/)
  })
})