export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { MAX_PHOTO_BYTES, PHOTO_SIZE_LIMIT, PHOTO_CONTENT_TYPES } from '@/lib/photo-upload'
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

  const hasR2Config = !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_BASE_URL
  )

  if (!hasR2Config && process.env.VERCEL === '1') {
    return NextResponse.json(
      { error: 'Photo storage is not configured. Contact your administrator.' },
      { status: 503 },
    )
  }

  if (hasR2Config) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')

    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })

    const key = `uploads/${uniqueName}`

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: file.type,
      ContentLength: file.size,
      Body: Buffer.from(await file.arrayBuffer()),
    })

    try {
      await r2Client.send(command)
    } catch (error) {
      console.error('[uploads] Object storage upload failed', error)
      return NextResponse.json({ error: 'Photo upload failed. Please try again.' }, { status: 503 })
    }
    const fileUrl = `${process.env.R2_PUBLIC_BASE_URL}/${key}`

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

    return NextResponse.json({ fileUrl, id: asset.id })
  }

  console.warn('R2 env vars not configured, falling back to local filesystem')
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadsDir, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(uploadsDir, uniqueName), buffer)

  const fileUrl = `/uploads/${uniqueName}`

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

  return NextResponse.json({ id: asset.id, fileUrl })
}
