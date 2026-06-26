export type RateLimitPreset = {
  max: number
  windowSeconds: number
}

export const RL = {
  login: { max: 10, windowSeconds: 10 * 60 },
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  portalToken: { max: 60, windowSeconds: 60 },
  publicPay: { max: 10, windowSeconds: 60 },
} as const
