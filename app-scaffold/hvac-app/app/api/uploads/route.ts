export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
  }

  const organizationId = membership.organizationId

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
    where: { id: jobId, organizationId },
  })
  if (!job) {
    return NextResponse.json({ error: 'Job not found in your organization' }, { status: 404 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Accepted: jpg, png, webp' },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 10 MB.' },
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

  let fileUrl: string

  if (hasR2Config) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

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
    })

    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 })

    const buffer = Buffer.from(await file.arrayBuffer())
    await fetch(presignedUrl, {
      method: 'PUT',
      body: buffer,
      headers: { 'Content-Type': file.type },
    })

    fileUrl = `${process.env.R2_PUBLIC_BASE_URL}/${key}`
  } else {
    console.warn('R2 env vars not configured, falling back to local filesystem')
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadsDir, uniqueName), buffer)

    fileUrl = `/uploads/${uniqueName}`
  }

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