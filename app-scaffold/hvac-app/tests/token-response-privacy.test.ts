import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
describe('token-bearing response privacy', () => {
  it.each(['/reviews/secret', '/invite/secret', '/reset-password?token=secret', '/login?invite=secret', '/signup?invite=secret', '/api/auth/callback/github?code=secret', '/portal/secret'])('does not cache, index, or leak referrers from %s', path => {
    const response = middleware(new NextRequest(`https://app.fieldclose.app${path}`))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})
