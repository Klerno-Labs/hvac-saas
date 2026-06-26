'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendJobCompleteNotice } from '@/lib/job-complete-notice'

export async function resendCompletionNotice(
  jobId: string,
): Promise<{ sent: boolean; channels: string } | { error: string }> {
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

  const { organizationId } = membership

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true },
  })

  if (!job) {
    return { error: 'Job not found.' }
  }

  await db.job.updateMany({
    where: { id: jobId, organizationId },
    data: { completionNoticeSentAt: null },
  })

  try {
    return await sendJobCompleteNotice(jobId, organizationId)
  } catch {
    return { error: 'Failed to send completion notice.' }
  }
}
