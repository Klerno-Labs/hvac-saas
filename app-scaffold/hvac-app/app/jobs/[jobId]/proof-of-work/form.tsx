'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { recordProofOfWork } from './actions'
import { saveJobSignature } from './signature-actions'
import { enqueueWrite } from '@/lib/offline-queue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SignaturePad } from '@/components/signature-pad'

type InitialData = {
  workSummary: string
  materialsUsed: string
  completionNotes: string
  technicianName: string
}

type UploadedPhoto = {
  id: string
  fileUrl: string
}

type ExistingAsset = {
  id: string
  fileUrl: string
  fileType: string
}

export function ProofOfWorkForm({
  jobId,
  initialData,
  existingAssets = [],
}: {
  jobId: string
  initialData: InitialData
  existingAssets?: ExistingAsset[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>(
    existingAssets.map((a) => ({ id: a.id, fileUrl: a.fileUrl }))
  )
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  const [signerName, setSignerName] = useState('')
  const [useTypedSignature, setUseTypedSignature] = useState(false)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadError(null)
    setUploading(true)

    const newPhotos: UploadedPhoto[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setUploadError(`"${file.name}" is not a supported image type. Use JPG, PNG, or WebP.`)
        continue
      }

      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`"${file.name}" exceeds the 10 MB limit.`)
        continue
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('jobId', jobId)

      try {
        const res = await fetch('/api/uploads', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json()
          setUploadError(data.error || `Failed to upload "${file.name}"`)
          continue
        }

        const data = await res.json()

        if (data.presignedUrl) {
          const putRes = await fetch(data.presignedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          })
          if (!putRes.ok) {
            setUploadError(`Failed to upload "${file.name}" to storage`)
            continue
          }
        }

        newPhotos.push({ id: data.id, fileUrl: data.fileUrl })
      } catch {
        setUploadError(`Network error uploading "${file.name}"`)
      }
    }

    if (newPhotos.length > 0) {
      setUploadedPhotos((prev) => [...prev, ...newPhotos])
    }

    setUploading(false)

    // Reset file input so the same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setQueued(false)
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    if (!navigator.onLine) {
      try {
        await enqueueWrite({
          type: 'job_notes',
          jobId,
          workSummary: formData.get('workSummary') as string,
          materialsUsed: (formData.get('materialsUsed') as string) || undefined,
          completionNotes: (formData.get('completionNotes') as string) || undefined,
          technicianName: (formData.get('technicianName') as string) || undefined,
        })
        setQueued(true)
      } catch {
        setError('Could not save offline — check browser storage permissions.')
      }
      setLoading(false)
      return
    }

    const result = await recordProofOfWork(jobId, formData)

    if (!result.success) {
      setError(result.error)
      setLoading(false)
      return
    }

    let finalSignatureDataUrl = signatureDataUrl
    if (useTypedSignature && signerName) {
      finalSignatureDataUrl = generateTypedSignatureUrl(signerName)
    }

    if (finalSignatureDataUrl && signerName) {
      const signatureFormData = new FormData()
      signatureFormData.append('signerName', signerName)
      signatureFormData.append('signatureDataUrl', finalSignatureDataUrl)

      const signatureResult = await saveJobSignature(jobId, signatureFormData)
      if (!signatureResult.success) {
        setError(`Proof of work saved, but signature failed: ${signatureResult.error}`)
        setLoading(false)
        return
      }
    }

    router.push(`/jobs/${jobId}`)
  }

  function handleSignatureCapture(dataUrl: string) {
    setSignatureDataUrl(dataUrl)
  }

  function generateTypedSignatureUrl(name: string): string {
    if (!name) return ''
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    canvas.width = 400
    canvas.height = 100

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = 'italic 24px cursive, "Brush Script MT", "Comic Sans MS"'
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, canvas.width / 2, canvas.height / 2)

    return canvas.toDataURL('image/png')
  }

  return (
    <>
      {error && (
        <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>
      )}
      {queued && (
        <div className="text-sm text-amber-700 mb-4 p-3 bg-amber-50 rounded-lg">
          Notes saved offline — photos unavailable without connection. Will sync when connected.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workSummary">Summary of work performed *</Label>
          <Textarea
            id="workSummary"
            name="workSummary"
            required
            rows={4}
            defaultValue={initialData.workSummary}
            placeholder="Describe the work completed on this job..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="materialsUsed">Materials used</Label>
          <Textarea
            id="materialsUsed"
            name="materialsUsed"
            rows={2}
            defaultValue={initialData.materialsUsed}
            placeholder="List materials, parts, or supplies used..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="technicianName">Technician name</Label>
          <Input
            id="technicianName"
            name="technicianName"
            type="text"
            defaultValue={initialData.technicianName}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="completionNotes">Completion notes</Label>
          <Textarea
            id="completionNotes"
            name="completionNotes"
            rows={2}
            defaultValue={initialData.completionNotes}
            placeholder="Any internal notes about job completion..."
          />
        </div>

        {/* Photo upload section */}
        <div className="space-y-2">
          <Label htmlFor="photos">Proof-of-work photos</Label>
          <Input
            ref={fileInputRef}
            id="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            onChange={handleFileUpload}
            disabled={uploading}
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            JPG, PNG, or WebP. Max 10 MB per file.
          </p>
          {uploading && (
            <p className="text-sm text-muted-foreground">Uploading...</p>
          )}
          {uploadError && (
            <p className="text-sm text-destructive">{uploadError}</p>
          )}
        </div>

        {uploadedPhotos.length > 0 && (
          <div className="space-y-2">
            <Label>Uploaded photos ({uploadedPhotos.length})</Label>
            <div className="grid grid-cols-3 gap-2">
              {uploadedPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-lg overflow-hidden border bg-muted"
                >
                  <img
                    src={photo.fileUrl}
                    alt="Proof of work"
                    className="object-cover w-full h-full"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Button type="submit" disabled={loading || uploading} className="mt-2">
          {loading ? 'Saving...' : 'Record completion'}
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t space-y-4">
        <h3 className="font-medium">Customer signature (optional)</h3>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useTypedSignature"
              checked={useTypedSignature}
              onChange={(e) => setUseTypedSignature(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="useTypedSignature" className="text-sm">
              Use typed name instead of drawing
            </Label>
          </div>

          {useTypedSignature ? (
            <div className="space-y-2">
              <Label htmlFor="signerNameTyped">Type customer name</Label>
              <Input
                id="signerNameTyped"
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Customer name"
                disabled={loading}
              />
              {signerName && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                  <p className="text-xl italic font-handwriting" style={{ fontFamily: 'cursive, Brush Script MT, Comic Sans MS' }}>{signerName}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Typed names will be saved as a signature with timestamp
              </p>
            </div>
          ) : (
            <SignaturePad
              onSignatureCapture={handleSignatureCapture}
              disabled={loading || uploading}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="signerName">Signer name *</Label>
            <Input
              id="signerName"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Full name of person signing"
              disabled={loading}
              required={!!signatureDataUrl || useTypedSignature}
            />
          </div>
        </div>
      </div>
    </>
  )
}
