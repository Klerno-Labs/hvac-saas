import { db } from '@/lib/db'
import { randomBytes } from 'crypto'

type PortalContext = {
  customerId: string
  organizationId: string
  customerName: string
  organizationName: string
}

/**
 * Validate a portal token and return the customer/org context.
 * Returns null if the token is invalid, expired, or revoked.
 */
export async function validatePortalToken(token: string): Promise<PortalContext | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const portalToken = await db.portalToken.findUnique({
    where: { token },
    include: {
      customer: { select: { id: true, organizationId: true, deletedAt: true, firstName: true, lastName: true } },
      organization: { select: { id: true, name: true } },
    },
  })

  if (!portalToken) return null
  if (portalToken.revokedAt) return null
  if (portalToken.expiresAt <= new Date()) return null
  // The schema has separate customer/org foreign keys. Do not grant access for
  // a legacy inconsistent row or keep a deleted customer's capability active.
  if (portalToken.customer.organizationId !== portalToken.organizationId || portalToken.customer.deletedAt) return null

  return {
    customerId: portalToken.customerId,
    organizationId: portalToken.organizationId,
    customerName: [portalToken.customer.firstName, portalToken.customer.lastName].filter(Boolean).join(' '),
    organizationName: portalToken.organization.name,
  }
}

/**
 * Generate a secure random portal token string.
 */
export function generateTokenString(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Default portal token expiration: 30 days from now.
 */
export function defaultTokenExpiry(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}

/**
 * Get or create a valid portal token for a customer and return the portal URL.
 * Reuses an existing non-expired, non-revoked token if one exists.
 */
export async function getOrCreatePortalUrl(
  organizationId: string,
  customerId: string,
): Promise<string> {
  const customer = await db.customer.findFirst({ where: { id: customerId, organizationId, deletedAt: null }, select: { id: true } })
  if (!customer) throw new Error('Customer not found in your organization')
  const existing = await db.portalToken.findFirst({
    where: {
      organizationId,
      customerId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  const token = existing?.token ?? await (async () => {
    const newToken = generateTokenString()
    await db.portalToken.create({
      data: {
        token: newToken,
        organizationId,
        customerId,
        expiresAt: defaultTokenExpiry(),
      },
    })
    return newToken
  })()

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return `${appUrl}/portal/${token}`
}
