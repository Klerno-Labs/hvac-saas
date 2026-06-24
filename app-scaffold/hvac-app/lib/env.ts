/**
 * Environment variable validation for production deployment.
 *
 * Call validateEnv() at startup or in health checks to verify
 * that required configuration is present.
 */

type EnvCheckResult = {
  valid: boolean
  missing: string[]
  warnings: string[]
}

const REQUIRED_VARS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_URL',
] as const

const RECOMMENDED_VARS = [
  { name: 'APP_URL', reason: 'Used for redirect URLs in Stripe and portal links' },
  { name: 'STRIPE_SECRET_KEY', reason: 'Required for payment collection' },
  { name: 'STRIPE_WEBHOOK_SECRET', reason: 'Required for payment webhook verification' },
  { name: 'STRIPE_PUBLISHABLE_KEY', reason: 'Required for client-side Stripe integration' },
] as const

const INSECURE_DEFAULTS: Record<string, string> = {
  AUTH_SECRET: 'replace-me-with-openssl-rand-base64-32',
}

export function validateEnv(): EnvCheckResult {
  const missing: string[] = []
  const warnings: string[] = []

  // Check required vars
  for (const v of REQUIRED_VARS) {
    if (!process.env[v]) {
      missing.push(v)
    }
  }

  // Check for insecure defaults
  for (const [key, insecureValue] of Object.entries(INSECURE_DEFAULTS)) {
    if (process.env[key] === insecureValue) {
      warnings.push(`${key} is using an insecure default value`)
    }
  }

  // Check recommended vars
  for (const { name, reason } of RECOMMENDED_VARS) {
    if (!process.env[name]) {
      warnings.push(`${name} not set — ${reason}`)
    }
  }

  // Production-specific checks
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      warnings.push('STRIPE_WEBHOOK_SECRET not set — webhooks will reject in production')
    }
    if (!process.env.COLLECTIONS_CRON_SECRET) {
      warnings.push('COLLECTIONS_CRON_SECRET not set — collections API endpoint is unprotected')
    }
    if (!process.env.PLATFORM_ADMIN_EMAILS) {
      warnings.push('PLATFORM_ADMIN_EMAILS not set — Stripe dead-letter admin view (/admin/stripe-dead-letter) will be inaccessible')
    }
  }

  // Stripe webhook retry queue — recommended for the dead-letter/replay feature.
  if (!process.env.PLATFORM_ADMIN_EMAILS) {
    warnings.push('PLATFORM_ADMIN_EMAILS not set — platform-admin tools (Stripe dead-letter queue) have no authorized operators')
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}
