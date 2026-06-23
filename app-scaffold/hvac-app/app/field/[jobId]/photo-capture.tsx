'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AssetKind } from '@/lib/validations/field'

type Asset = { id: string; fileUrl: string }

type Props = {
  jobId: string
  beforeAssets: Asset[]
  afterAssets: Asset[]
  generalAssets: Asset[]
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function PhotoCapture({ jobId, beforeAssets, afterAssets, generalAssets }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <PhotoSection
          jobId={jobId}
          kind="before"
          label="Before"
          assets={beforeAssets}
        />
        <PhotoSection
          jobId={jobId}
          kind="after"
          label="After"
          assets={afterAssets}
        />
        {generalAssets.length > 0 && (
          <PhotoSection jobId={jobId} kind="general" label="Other" assets={generalAssets} readOnly />
        )}
      </CardContent>
    </Card>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function PhotoSection({
  jobId,
  kind,
  label,
  assets,
  readOnly = false,
}: {
  jobId: string
  kind: AssetKind
  label: string
  assets: Asset[]
  readOnly?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<Asset[]>(assets)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setError(null)
    setUploading(true)

    const added: Asset[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`"${file.name}" is not a supported image type. Use JPG, PNG, or WebP.`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" exceeds the 10 MB limit.`)
        continue
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('jobId', jobId)
      formData.append('kind', kind)

      try {
        const res = await fetch('/api/uploads', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || `Failed to upload "${file.name}"`)
          continue
        }
        added.push({ id: data.id, fileUrl: data.fileUrl })
      } catch {
        setError(`Network error uploading "${file.name}"`)
      }
    }

    if (added.length > 0) setPhotos((prev) => [...prev, ...added])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label} ({photos.length})</Label>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading...' : 'Add photo'}
          </Button>
        )}
      </div>

      {!readOnly && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          onChange={handleFiles}
          disabled={uploading}
          className="hidden"
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <a
              key={photo.id}
              href={photo.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden border bg-muted block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.fileUrl}
                alt={`${label} photo`}
                className="object-cover w-full h-full"
              />
            </a>
          ))}
        </div>
      ) : (
        !readOnly && <p className="text-xs text-muted-foreground">No {label.toLowerCase()} photos yet.</p>
      )}
    </div>
  )
}
