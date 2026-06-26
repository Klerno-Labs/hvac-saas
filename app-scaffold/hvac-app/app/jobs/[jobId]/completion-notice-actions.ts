'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendJobCompleteNotice } from '@/lib/job-complete-notice'

export async function resendCompletionNotice(jobId: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: 'Not authenticated.' }
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) {
    return { error: 'No organization membership found.' }
  }

  const organizationId = membership.organizationId

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true },
  })
  if (!job) {
    return { error: 'Job not found.' }
  }

  await db.job.update({
    where: { id: jobId },
    data: { completionNoticeSentAt: null },
  })

  const result = await sendJobCompleteNotice(jobId, organizationId)
  return { sent: result.sent, channels: result.channels }
}
