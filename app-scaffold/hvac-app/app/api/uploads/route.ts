export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requiresRemotePhotoStorage } from '@/lib/deployment-runtime'
import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { MAX_PHOTO_BYTES, PHOTO_SIZE_LIMIT, PHOTO_CONTENT_TYPES } from '@/lib/photo-upload'
import { localPhotoPath, photoObjectKey, r2PhotoConfig } from '@/lib/photo-storage'
import { photoReadUrl } from '@/lib/photo-url'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

export async function POST(request: NextRequest) {
  const access = await requireMutationAccess('fieldWork')
  if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status })
  const { session, userId, organizationId, membership } = access.context

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const jobId = formData.get('jobId')
  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const job = await db.job.findFirst({
    where: { id: jobId, ...jobAccessWhere(access.context) },
  })
  if (!job) {
    return NextResponse.json({ error: 'Job not found in your organization' }, { status: 404 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!PHOTO_CONTENT_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Accepted: jpg, png, webp' },
      { status: 400 }
    )
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${PHOTO_SIZE_LIMIT}.` },
      { status: 400 }
    )
  }

  const ext = EXT_MAP[file.type] || '.jpg'
  const uniqueName = `${crypto.randomUUID()}${ext}`

  const storage = r2PhotoConfig()
  const key = photoObjectKey(organizationId, jobId, uniqueName)

  if (!storage && requiresRemotePhotoStorage()) {
    return NextResponse.json(
      { error: 'Photo storage is not configured. Contact your administrator.' },
      { status: 503 },
    )
  }

  if (storage) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')

    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${storage.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    })

    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ContentType: file.type,
      ContentLength: file.size,
      Body: Buffer.from(await file.arrayBuffer()),
    })

    try {
      await r2Client.send(command)
    } catch {
      console.error('[uploads] Object storage upload failed')
      return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 503 })
    } finally {
      r2Client.destroy()
    }
    const fileUrl = `r2://${storage.bucket}/${key}`

    const asset = await db.proofOfWorkAsset.create({
      data: {
        organizationId,
        jobId,
        fileUrl,
        fileType: file.type,
        fileSize: file.size,
      },
    })

    await trackEvent({
      organizationId,
      userId,
      eventName: 'proof_of_work_photo_uploaded',
      entityType: 'job',
      entityId: jobId,
      metadataJson: { assetId: asset.id, fileType: file.type },
    })

    return NextResponse.json({ fileUrl: photoReadUrl({ id: asset.id, fileUrl }), id: asset.id })
  }

  console.warn('R2 env vars not configured, using private local development storage')
  const destination = localPhotoPath(key)
  const uploadsDir = path.dirname(destination)
  await mkdir(uploadsDir, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(destination, buffer)

  const fileUrl = `local-private://photos/${key}`

  const asset = await db.proofOfWorkAsset.create({
    data: {
      organizationId,
      jobId,
      fileUrl,
      fileType: file.type,
      fileSize: file.size,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'proof_of_work_photo_uploaded',
    entityType: 'job',
    entityId: jobId,
    metadataJson: { assetId: asset.id, fileType: file.type },
  })

  return NextResponse.json({ id: asset.id, fileUrl: photoReadUrl({ id: asset.id, fileUrl }) })
}
