'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function dismissOnboarding() {
  const access = await requireMutationAccess('manageTeam')
  if (!access.authorized) return
  const { organizationId } = access.context
  await db.organization.update({
    where: { id: organizationId },
    data: { onboardingStatus: 'completed' },
  })
  revalidatePath('/dashboard')
}
