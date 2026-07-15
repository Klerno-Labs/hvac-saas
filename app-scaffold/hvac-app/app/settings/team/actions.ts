'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { sendTeamInviteEmail } from '@/lib/email'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { requirePlan } from '@/lib/billing'
import { VALID_ROLES } from '@/lib/permissions'

const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  role: z.enum(VALID_ROLES),
})

type InviteResult = { success: true } | { success: false; error: string }

export async function inviteTeamMember(formData: FormData): Promise<InviteResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { success: false, error: adminResult.error }

  const { userId, userEmail, organizationId } = adminResult.context

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role') || 'technician',
  })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { email, role } = parsed.data

  // Check if already a member
  const existingUser = await db.user.findUnique({ where: { email } })
  if (existingUser) {
    const existingMember = await db.organizationMember.findFirst({
      where: { userId: existingUser.id, organizationId },
    })
    if (existingMember) return { success: false, error: 'This user is already a member of your organization' }
  }

  // Check for existing pending invite
  const existingInvite = await db.teamInvite.findFirst({
    where: { email, organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
  })
  if (existingInvite) return { success: false, error: 'An invite has already been sent to this email' }

  const token = randomBytes(32).toString('hex')
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  
  if (!org) {
    return { success: false, error: 'Organization not found' }
  }

  const currentMemberCount = await db.organizationMember.count({
    where: { organizationId },
  })
  
  const pendingInviteCount = await db.teamInvite.count({
    where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
  })
  
  const totalSeats = currentMemberCount + pendingInviteCount
  
  if (org.plan === 'STARTER' && totalSeats >= 1) {
    return { success: false, error: 'Starter plan is limited to 1 team member. Upgrade to Pro to add more team members.' }
  }

  await db.teamInvite.create({
    data: {
      organizationId,
      email,
      role,
      token,
      invitedBy: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  })

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  await sendTeamInviteEmail({
    to: email,
    orgName: org?.name || 'your organization',
    inviterName: userEmail || 'a team member',
    signupUrl: `${appUrl}/invite/${token}`,
  })

  await trackEvent({
    organizationId, userId,
    eventName: 'team_member_invited',
    entityType: 'team_invite',
    metadataJson: { email, role },
  })

  await logAudit({
    organizationId, actorId: userId,
    eventType: 'team_member_invited',
    metadata: { email, role },
  })

  return { success: true }
}

export async function removeMember(memberId: string): Promise<InviteResult> {
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
