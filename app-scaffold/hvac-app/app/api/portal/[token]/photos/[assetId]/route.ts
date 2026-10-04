import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { photoError, privatePhotoResponse } from '@/lib/photo-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  try {
    const { token, assetId } = await params
    if (!/^[a-f0-9]{64}$/.test(token)) return photoError('Photo not found', 404)
    const context = await validatePortalToken(token)
    if (!context) return photoError('Photo not found', 404)
    const asset = await db.proofOfWorkAsset.findFirst({
      where: {
        id: assetId,
        organizationId: context.organizationId,
        job: {
          organizationId: context.organizationId,
          customer: { id: context.customerId, organizationId: context.organizationId, deletedAt: null },
        },
      },
    })
    if (!asset) return photoError('Photo not found', 404)
    return privatePhotoResponse(asset)
  } catch {
    console.error('[photo-read] Portal photo authorization is unavailable')
    return photoError('Photo is temporarily unavailable', 503)
  }
}
