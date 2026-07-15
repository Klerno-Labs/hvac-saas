import { describe, it, expect } from 'vitest'
import { formatNoticeChannels } from '@/lib/format-notice-channels'

describe('formatNoticeChannels', () => {
  it('formats email and sms as readable text', () => {
    expect(formatNoticeChannels('email,sms')).toBe('email and SMS')
  })

  it('returns single channel as-is', () => {
    expect(formatNoticeChannels('email')).toBe('email')
  })

  it('returns no channels for null', () => {
    expect(formatNoticeChannels(null)).toBe('no channels')
  })

  it('returns no channels for empty string', () => {
    expect(formatNoticeChannels('')).toBe('no channels')
  })

  it('uppercases sms in a single channel', () => {
    expect(formatNoticeChannels('sms')).toBe('SMS')
  })

  it('formats three channels with Oxford comma', () => {
    expect(formatNoticeChannels('email,sms,push')).toBe('email, SMS, and push')
  })
})
