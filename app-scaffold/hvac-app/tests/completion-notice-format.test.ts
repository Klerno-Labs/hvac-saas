import { describe, it, expect } from 'vitest'
import { formatNoticeChannels } from '@/lib/format-notice-channels'

describe('formatNoticeChannels', () => {
  it('formats email and sms', () => {
    expect(formatNoticeChannels('email,sms')).toBe('email and SMS')
  })

  it('formats email only', () => {
    expect(formatNoticeChannels('email')).toBe('email')
  })

  it('formats sms only', () => {
    expect(formatNoticeChannels('sms')).toBe('SMS')
  })

  it('handles null', () => {
    expect(formatNoticeChannels(null)).toBe('no channels')
  })

  it('handles empty string', () => {
    expect(formatNoticeChannels('')).toBe('no channels')
  })
})
