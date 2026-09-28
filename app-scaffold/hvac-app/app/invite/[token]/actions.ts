'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { VALID_ROLES } from '@/lib/permissions'
import { isSubscriptionActive } from '@/lib/billing'

type Result = { success: true } | { success: false; error: string }

export async function acceptInvite(token: string): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return { success: false, error: 'Invalid invitation' }
  const userId = session.user.id
  try {
    return await db.$transaction(async tx => {
      // One account currently has one active workspace context. Serializing on
      // the user also prevents two different invitations being accepted at once.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } })
      const invite = await tx.teamInvite.findUnique({ where: { token }, include: { organization: true } })
      if (!invite || !user?.email) return { success: false, error: 'Invalid invitation' }
      if (user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
        return { success: false, error: 'Sign in with the email address this invitation was sent to.' }
      }
      const existing = await tx.organizationMember.findFirst({ where: { userId } })
      if (invite.acceptedAt) {
        return existing?.organizationId === invite.organizationId
          ? { success: true }
          : { success: false, error: 'This invitation has already been accepted' }
      }
      if (invite.expiresAt <= new Date()) return { success: false, error: 'This invitation has expired' }
      if (existing && existing.organizationId !== invite.organizationId) return { success: false, error: 'Your account already belongs to another workspace. Ask the owner to invite a separate work email.' }
      if (!(VALID_ROLES as readonly string[]).includes(invite.role) && invite.role !== 'member') return { success: false, error: 'This invitation has an invalid role. Ask the owner for a new invitation.' }
      if (invite.organization.readOnlyAt || !isSubscriptionActive(invite.organization)) return { success: false, error: 'This workspace is inactive. Ask its owner to update billing before joining.' }
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${invite.organizationId} FOR UPDATE`
      if (!existing && invite.organization.plan === 'STARTER' && await tx.organizationMember.count({ where: { organizationId: invite.organizationId } }) >= 1) {
        return { success: false, error: 'This workspace has no available team seats. Ask its owner to upgrade before joining.' }
      }
      const now = new Date()
      const claimed = await tx.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now } })
      if (claimed.count !== 1) return { success: false, error: 'This invitation is no longer available. Refresh and try again.' }
      if (!existing) {
        const member = await tx.organizationMember.create({ data: { organizationId: invite.organizationId, userId, role: invite.role, acceptedAt: now } })
        await trackEvent({ organizationId: invite.organizationId, userId, eventName: 'team_member_joined', entityType: 'organization_member', entityId: member.id }, tx)
        await logAudit({ organizationId: invite.organizationId, actorId: userId, eventType: 'team_member_joined', targetType: 'organization_member', targetId: member.id, metadata: { role: invite.role } }, tx)
      }
      return { success: true }
    })
  } catch {
    return { success: false, error: 'We could not accept this invitation. Please refresh and try again.' }
  }
}
