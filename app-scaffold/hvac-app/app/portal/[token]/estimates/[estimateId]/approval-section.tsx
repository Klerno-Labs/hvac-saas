'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { approveEstimate, declineEstimate } from './approval-actions'

type Mode = 'idle' | 'approving' | 'declining' | 'submitted'

export function ApprovalSection({
  token,
  estimateId,
  status,
  decisionByName,
  acceptedAt,
  declinedAt,
}: {
  token: string
  estimateId: string
  status: string
  decisionByName: string | null
  acceptedAt: Date | string | null
  declinedAt: Date | string | null
}) {
  const router = useRouter()
  const [signatureMethod, setSignatureMethod] = useState<'drawn' | 'typed'>('drawn')
  const [mode, setMode] = useState<Mode>('idle')
  const [signerName, setSignerName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const hasSignedRef = useRef(false)

  // Set up canvas drawing
  useEffect(() => {
    if (mode !== 'approving' || signatureMethod !== 'drawn') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      hasSignedRef.current = false
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#0f172a'
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [mode, signatureMethod])

  function getEventPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = getEventPos(e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPointRef.current) return
    const pos = getEventPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPointRef.current = pos
    hasSignedRef.current = true
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasSignedRef.current = false
  }

  async function handleApprove() {
    setError(null)
    if (!signerName.trim()) return setError('Please type your full name')
    if (signatureMethod === 'drawn' && (!hasSignedRef.current || !canvasRef.current)) return setError('Please sign in the box above or use your typed name')
    setLoading(true)
    try {
      let dataUrl: string
      if (signatureMethod === 'typed') {
        const canvas = document.createElement('canvas')
        canvas.width = 1000
        canvas.height = 160
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Could not create signature')
        ctx.font = 'italic 48px Georgia, serif'
        ctx.fillStyle = '#0f172a'
        ctx.fillText(signerName.trim(), 20, 96, 960)
        dataUrl = canvas.toDataURL('image/png')
      } else {
        dataUrl = canvasRef.current!.toDataURL('image/png')
      }
      const result = await approveEstimate(token, estimateId, { signerName: signerName.trim(), signatureDataUrl: dataUrl, signatureMethod })
      if (result.success) { setMode('submitted'); router.refresh() }
      else setError(result.error)
    } catch { setError('The connection was interrupted. Please try again.') }
    finally { setLoading(false) }
  }

  async function handleDecline() {
    setError(null)
    if (!signerName.trim()) return setError('Please type your full name')
    setLoading(true)
    try {
      const result = await declineEstimate(token, estimateId, { signerName: signerName.trim(), reason: reason.trim() || undefined })
      if (result.success) { setMode('submitted'); router.refresh() }
      else setError(result.error)
    } catch { setError('The connection was interrupted. Please try again.') }
    finally { setLoading(false) }
  }

  // Already decided
  if (status === 'accepted') {
    return (
      <Card className="border-emerald-500/40 bg-emerald-50/50">
        <CardContent className="py-6 text-center">
          <p className="text-lg font-semibold text-emerald-700">✓ Approved</p>
          {decisionByName && (
            <p className="text-sm text-muted-foreground mt-1">
              Approved by {decisionByName}
              {acceptedAt && ` on ${new Date(acceptedAt).toLocaleDateString()}`}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (status === 'declined') {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-6 text-center">
          <p className="text-lg font-semibold text-destructive">Declined</p>
          {decisionByName && (
            <p className="text-sm text-muted-foreground mt-1">
              Declined by {decisionByName}
              {declinedAt && ` on ${new Date(declinedAt).toLocaleDateString()}`}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (mode === 'submitted') {
    return (
      <Card role="status" className="border-emerald-500/40 bg-emerald-50/50">
        <CardContent className="py-6 text-center">
          <p className="text-lg font-semibold text-emerald-700">✓ Submitted</p>
          <p className="text-sm text-muted-foreground mt-1">Your decision has been saved. Thank you.</p>
        </CardContent>
      </Card>
    )
  }

  if (status !== 'sent') return null

  if (mode === 'idle') {
    return (
      <Card>
        <CardContent className="py-6 space-y-3">
          <p className="text-sm font-semibold text-center">Ready to move forward?</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setMode('approving')} className="min-h-11 sm:flex-1" size="lg">
              ✓ Approve estimate
            </Button>
            <Button onClick={() => setMode('declining')} variant="outline" className="min-h-11 sm:flex-1" size="lg">
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (mode === 'approving') {
    return (
      <Card>
        <CardContent className="py-6 space-y-4">
          <div>
            <p className="font-semibold mb-1">Approve this estimate</p>
            <p className="text-xs text-muted-foreground">By signing below, you authorize the work described in this estimate.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signerName">Your full name *</Label>
            <Input
              id="signerName"
              maxLength={200}
              autoComplete="name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Type your full legal name"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <p id="signature-label" className="text-sm font-medium">Your signature *</p>
            <div className="flex gap-2" role="group" aria-label="Signature method">
              <Button type="button" variant={signatureMethod === 'drawn' ? 'default' : 'outline'} aria-pressed={signatureMethod === 'drawn'} onClick={() => setSignatureMethod('drawn')}>Draw signature</Button>
              <Button type="button" variant={signatureMethod === 'typed' ? 'default' : 'outline'} aria-pressed={signatureMethod === 'typed'} onClick={() => setSignatureMethod('typed')}>Type signature</Button>
            </div>
            {signatureMethod === 'typed' ? <div className="rounded-lg border bg-white p-4">
              <p className="break-words font-serif text-2xl italic text-slate-900" aria-label="Typed signature preview">{signerName.trim() || 'Your full name'}</p>
              <p className="mt-2 text-xs text-muted-foreground">Submitting uses your typed full name as your signature.</p>
            </div> : (
            <div className="border-2 border-dashed rounded-lg bg-white relative">
              <canvas
                ref={canvasRef}
                aria-labelledby="signature-label"
                className="w-full h-40 touch-none cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              <button
                type="button"
                onClick={clearSignature}
                className="absolute bottom-2 right-2 text-xs text-muted-foreground hover:text-foreground bg-background/80 px-2 py-1 rounded"
              >
                Clear signature
              </button>
            </div>)}
          </div>

          {error && <div role="alert" className="text-sm text-destructive p-2 bg-destructive/10 rounded">{error}</div>}

          <div className="flex gap-2">
            <Button onClick={handleApprove} disabled={loading} className="min-h-11 sm:flex-1">
              {loading ? 'Submitting...' : 'Submit approval'}
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')} disabled={loading}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // declining
  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <div>
          <p className="font-semibold mb-1">Decline this estimate</p>
          <p className="text-xs text-muted-foreground">Let them know why so they can follow up.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signerName">Your full name *</Label>
          <Input
            id="signerName"
              maxLength={200}
              autoComplete="name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Textarea
            id="reason"
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Too expensive, going with another company, etc."
          />
        </div>

        {error && <div role="alert" className="text-sm text-destructive p-2 bg-destructive/10 rounded">{error}</div>}

        <div className="flex gap-2">
          <Button onClick={handleDecline} disabled={loading} variant="destructive" className="min-h-11 sm:flex-1">
            {loading ? 'Submitting...' : 'Submit decline'}
          </Button>
          <Button variant="ghost" onClick={() => setMode('idle')} disabled={loading}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
