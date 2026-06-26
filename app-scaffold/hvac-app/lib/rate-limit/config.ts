export interface RateLimitPreset {
  windowMs: number
  maxRequests: number
}

export const RL = {
  login: { windowMs: 15 * 60 * 1000, maxRequests: 10 } satisfies RateLimitPreset,
  passwordReset: { windowMs: 60 * 60 * 1000, maxRequests: 5 } satisfies RateLimitPreset,
  portalToken: { windowMs: 60 * 1000, maxRequests: 30 } satisfies RateLimitPreset,
  publicPay: { windowMs: 60 * 1000, maxRequests: 5 } satisfies RateLimitPreset,
} as const
