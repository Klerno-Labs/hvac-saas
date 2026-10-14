'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { sendTeamInviteEmail } from '@/lib/email'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { isSubscriptionActive } from '@/lib/billing'
import { VALID_ROLES } from '@/lib/permissions'

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email').max(254),
  role: z.enum(VALID_ROLES),
})

type ActionResult = { success: true } | { success: false; error: string }
type InviteResult = { success: true; delivery: 'sent' | 'failed' | 'unconfirmed' } | { success: false; error: string }
type InvitationToSend = { id: string; email: string; token: string }

async function deliverInvitation(invite: InvitationToSend, orgName: string, inviterName: string): Promise<InviteResult> {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  try {
    const delivery = await sendTeamInviteEmail({
      to: invite.email, orgName, inviterName,
      signupUrl: `${appUrl}/invite/${invite.token}`,
    })
    return { success: true, delivery: delivery.success ? 'sent' : delivery.retryable === true ? 'failed' : 'unconfirmed' }
  } catch {
    // The invitation still exists. Keep its recipient, role, token and expiry
    // intact so an owner can explicitly retry, without logging a private link.
    console.error('Team invitation email delivery failed')
    return { success: true, delivery: 'unconfirmed' }
  }
}

export async function inviteTeamMember(formData: FormData): Promise<InviteResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { success: false, error: adminResult.error }
  const { userId, userEmail, organizationId } = adminResult.context
  const parsed = inviteSchema.safeParse({ email: formData.get('email'), role: formData.get('role') || 'technician' })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const { email, role } = parsed.data

  try {
    const prepared = await db.$transaction(async tx => {
      // The organization lock also serializes duplicate invitations and seat
      // checks. Acceptance uses this same lock when claiming a team seat.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      const org = await tx.organization.findUnique({ where: { id: organizationId } })
      if (!org) return { success: false as const, error: 'Organization not found' }
      if (org.readOnlyAt || !isSubscriptionActive(org)) return { success: false as const, error: 'Update your subscription in Billing before inviting team members.' }
      const existingUser = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
      if (existingUser && await tx.organizationMember.findFirst({ where: { userId: existingUser.id, organizationId } })) {
        return { success: false as const, error: 'This user is already a member of your organization' }
      }
      const existingInvite = await tx.teamInvite.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      })
      if (existingInvite) return { success: false as const, error: 'A pending invitation already exists for this email. Use Resend invitation below to send it again.' }
      const currentMemberCount = await tx.organizationMember.count({ where: { organizationId } })
      const pendingInviteCount = await tx.teamInvite.count({ where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } } })
      if (org.plan === 'STARTER' && currentMemberCount + pendingInviteCount >= 1) {
        return { success: false as const, error: 'Starter plan is limited to 1 team member. Upgrade to Pro to add more team members.' }
      }
      const invite = await tx.teamInvite.create({ data: {
        organizationId, email, role, token: randomBytes(32).toString('hex'), invitedBy: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      } })
      await trackEvent({ organizationId, userId, eventName: 'team_member_invited', entityType: 'team_invite', entityId: invite.id, metadataJson: { email, role } }, tx)
      await logAudit({ organizationId, actorId: userId, eventType: 'team_member_invited', targetType: 'team_invite', targetId: invite.id, metadata: { email, role } }, tx)
      return { success: true as const, invite, orgName: org.name }
    })
    if (!prepared.success) return prepared
    return deliverInvitation(prepared.invite, prepared.orgName, userEmail || 'a team member')
  } catch {
    return { success: false, error: 'We could not create this invitation. Refresh and try again.' }
  }
}

export async function resendTeamInvitation(inviteId: string): Promise<InviteResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { success: false, error: adminResult.error }
  if (typeof inviteId !== 'string' || !inviteId || inviteId.length > 200) return { success: false, error: 'Invalid invitation' }
  const { userEmail, organizationId, userId } = adminResult.context
  try {
    const prepared = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      const org = await tx.organization.findUnique({ where: { id: organizationId } })
      if (!org) return { success: false as const, error: 'Organization not found' }
      if (org.readOnlyAt || !isSubscriptionActive(org)) return { success: false as const, error: 'Update your subscription in Billing before resending invitations.' }
      const invite = await tx.teamInvite.findFirst({ where: { id: inviteId, organizationId } })
      if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
        return { success: false as const, error: 'This invitation is no longer pending. Refresh the team list and create a new invitation if needed.' }
      }
      if (org.plan === 'STARTER' && await tx.organizationMember.count({ where: { organizationId } }) >= 1) {
        return { success: false as const, error: 'Upgrade to Pro before adding another team member.' }
      }
      // Never take the recipient, role or token from the retry request, and do
      // not renew an expired/revoked invitation by changing its expiry.
      return { success: true as const, invite, orgName: org.name }
    })
    if (!prepared.success) return prepared
    const delivered = await deliverInvitation(prepared.invite, prepared.orgName, userEmail || 'a team member')
    try {
      await logAudit({ organizationId, actorId: userId, eventType: 'team_invite_email_retried', targetType: 'team_invite', targetId: prepared.invite.id,
        metadata: { delivery: delivered.success ? delivered.delivery : 'failed' } })
    } catch {
      console.error('Team invitation retry audit could not be recorded')
    }
    return delivered
  } catch {
    return { success: false, error: 'We could not resend this invitation. Refresh and try again.' }
  }
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { success: false, error: adminResult.error }

  const { userId, organizationId } = adminResult.context

  const member = await db.organizationMember.findFirst({
    where: { id: memberId, organizationId },
  })
  if (!member) return { success: false, error: 'Member not found' }
  if (member.userId === userId) return { success: false, error: 'You cannot remove yourself' }

  await db.organizationMember.delete({ where: { id: memberId } })

  await logAudit({
    organizationId, actorId: userId,
    eventType: 'team_member_removed',
    targetType: 'organization_member',
    targetId: memberId,
  })

  return { success: true }
}
