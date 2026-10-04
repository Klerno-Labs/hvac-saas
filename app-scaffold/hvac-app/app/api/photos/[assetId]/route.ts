import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { jobAccessWhere } from '@/lib/mutation-access'
import { photoError, privatePhotoResponse } from '@/lib/photo-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return photoError('You must be logged in', 401)
    const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
    if (!membership) return photoError('Photo not found', 404)
    const { assetId } = await params
    const context = { userId: session.user.id, organizationId: membership.organizationId, role: membership.role }
    const asset = await db.proofOfWorkAsset.findFirst({
      where: { id: assetId, organizationId: context.organizationId, job: jobAccessWhere(context) },
    })
    if (!asset) return photoError('Photo not found', 404)
    return privatePhotoResponse(asset)
  } catch {
    console.error('[photo-read] Photo authorization is unavailable')
    return photoError('Photo is temporarily unavailable', 503)
  }
}
