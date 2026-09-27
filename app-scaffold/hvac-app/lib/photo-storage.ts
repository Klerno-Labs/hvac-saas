import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readFile } from 'fs/promises'
import path from 'path'
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from '@/lib/photo-upload'

export const PRIVATE_PHOTO_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
}

export function r2PhotoConfig() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  return accountId && accessKeyId && secretAccessKey && bucket
    ? { accountId, accessKeyId, secretAccessKey, bucket }
    : null
}

export function photoObjectKey(organizationId: string, jobId: string, filename: string) {
  const segment = (id: string) => encodeURIComponent(id).replace(/\./g, '%2E')
  return `private/${segment(organizationId)}/${segment(jobId)}/${filename}`
}

export function localPhotoPath(key: string) {
  return path.join(process.cwd(), '.data', 'private-photos', key)
}

export function photoError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: PRIVATE_PHOTO_HEADERS })
}

type StoredPhoto = {
  organizationId: string
  jobId: string
  fileUrl: string
  fileType: string
  fileSize: number | null
}

/** Called only after the asset and its job have passed the caller's access check. */
export async function privatePhotoResponse(asset: StoredPhoto) {
  if (!PHOTO_CONTENT_TYPES.includes(asset.fileType) || (asset.fileSize ?? 0) > MAX_PHOTO_BYTES) {
    return photoError('Photo not found', 404)
  }
  const config = r2PhotoConfig()
  const local = asset.fileUrl.startsWith('local-private://photos/')
  const prefix = local ? 'local-private://photos/' : config ? `r2://${config.bucket}/` : null
  if (!prefix || (local && process.env.VERCEL === '1')) return photoError('Photo storage is unavailable', 503)

  const keyPrefix = photoObjectKey(asset.organizationId, asset.jobId, '')
  const fullPrefix = `${prefix}${keyPrefix}`
  // Bind the stored object to the authorized row's organization AND job. Never
  // follow an arbitrary URI, switch buckets, or normalize traversal segments.
  const filename = asset.fileUrl.startsWith(fullPrefix) ? asset.fileUrl.slice(fullPrefix.length) : ''
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename)) return photoError('Photo not found', 404)
  const key = `${keyPrefix}${filename}`

  let client: S3Client | undefined
  try {
    let bytes: Uint8Array
    if (local) {
      bytes = await readFile(localPhotoPath(key))
    } else {
      if (!config) return photoError('Photo storage is unavailable', 503)
      client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      })
      const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
      if (!object.Body) return photoError('Photo not found', 404)
      const reader = object.Body.transformToWebStream().getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        if ((object.ContentLength ?? 0) > MAX_PHOTO_BYTES) {
          await reader.cancel()
          return photoError('Photo not found', 404)
        }
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_PHOTO_BYTES) {
            await reader.cancel()
            return photoError('Photo not found', 404)
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
      bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
    }
    if (bytes.length > MAX_PHOTO_BYTES) return photoError('Photo not found', 404)
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...PRIVATE_PHOTO_HEADERS,
        'Content-Type': asset.fileType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `inline; filename="job-photo.${filename.split('.').pop()}"`,
      },
    })
  } catch {
    // Provider errors can contain object names or signed request details.
    console.error('[photo-read] Private photo storage read failed')
    return photoError('Photo is temporarily unavailable', 503)
  } finally {
    client?.destroy()
  }
}
