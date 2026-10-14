import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * GET /api/health
 *
 * Production health check endpoint.
 * Returns service status, database connectivity, and env configuration status.
 * Does not expose secrets or sensitive details.
 */
export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {}

  // Database connectivity
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = { status: 'ok' }
  } catch {
    checks.database = { status: 'error', message: 'Database connection failed' }
  }

  // Required environment variables (presence only, never values)
  const requiredEnvVars = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'AUTH_URL',
  ]
  const optionalEnvVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PUBLISHABLE_KEY',
    'APP_URL',
    'OPENAI_API_KEY',
    'COLLECTIONS_CRON_SECRET',
    'AUTH_GITHUB_ID',
    'AUTH_GITHUB_SECRET',
  ]

  const missingRequired = requiredEnvVars.filter((v) => !process.env[v])
  const configuredOptional = optionalEnvVars.filter((v) => !!process.env[v])

  checks.env = {
    status: missingRequired.length === 0 ? 'ok' : 'error',
    message: missingRequired.length > 0
      ? `Missing required: ${missingRequired.join(', ')}`
      : undefined,
  }

  // Integration readiness (presence only)
  checks.stripe = {
    status: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured',
  }
  checks.auth = {
    status: process.env.AUTH_SECRET && process.env.AUTH_SECRET !== 'replace-me-with-openssl-rand-base64-32'
      ? 'configured'
      : 'needs_configuration',
  }

  // Optional integrations are reported separately and must not take a
  // healthy application out of service before they have been configured.
  const allOk = checks.database.status === 'ok' && checks.env.status === 'ok' && checks.auth.status === 'configured'

  return NextResponse.json({
    ok: allOk,
    service: 'hvac-app',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    checks,
    optionalConfigured: configuredOptional.length,
  }, { status: allOk ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
