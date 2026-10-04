import { z } from 'zod'

export const DEFAULT_SUPPORT_EMAIL = 'support@fieldclose.app'
const supportEmailSchema = z.string().trim().max(254).email()

/** Public contact configuration shared by server pages and browser help content. */
export function resolveSupportEmail(value: string | undefined): string {
  const parsed = supportEmailSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_SUPPORT_EMAIL
}

// Next.js embeds this public value at build time. Rebuild after changing it.
export const supportEmail = resolveSupportEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL)

export function supportMailto(subject?: string): string {
  const recipient = encodeURIComponent(supportEmail).replace(/%40/g, '@')
  return `mailto:${recipient}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
}
