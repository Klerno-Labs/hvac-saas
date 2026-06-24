import { validatePortalToken } from '@/lib/portal'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function PortalJobPage({ params }: { params: Promise<{ token: string; jobId: string }> }) {
  const { token, jobId } = await params

  const ctx = await validatePortalToken(token)
  if (!ctx) {
    notFound()
  }

  const job = await db.job.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.organizationId,
      customer: { id: ctx.customerId },
    },
    include: {
      signatures: { orderBy: { signedAt: 'desc' } },
      assets: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!job) {
    notFound()
  }

  return (
    <main>
      <div className="mx-auto max-w-175">
        <Link href={`/portal/${token}`} className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
          &larr; Back to portal
        </Link>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-2xl">{job.title}</CardTitle>
            <CardDescription>{ctx.organizationName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={statusVariant(job.status)}>{job.status.replace('_', ' ')}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-sm font-medium">
                  {job.completedAt ? new Date(job.completedAt).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>

            {job.workSummary && (
              <div>
                <p className="text-xs text-muted-foreground">Work summary</p>
                <p className="text-sm whitespace-pre-wrap">{job.workSummary}</p>
              </div>
            )}

            {job.materialsUsed && (
              <div>
                <p className="text-xs text-muted-foreground">Materials used</p>
                <p className="text-sm">{job.materialsUsed}</p>
              </div>
            )}

            {job.technicianName && (
              <div>
                <p className="text-xs text-muted-foreground">Technician</p>
                <p className="text-sm">{job.technicianName}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signatures */}
        {job.signatures.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Signature{job.signatures.length > 1 ? 's' : ''}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {job.signatures.map((signature) => (
                  <div key={signature.id} className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium">{signature.signerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(signature.signedAt).toLocaleString()}
                      </p>
                    </div>
                    <img
                      src={signature.signatureImageUrl}
                      alt={`Signature by ${signature.signerName}`}
                      className="max-h-20 bg-white rounded border p-1"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Photos */}
        {job.assets.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Photos ({job.assets.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {job.assets.map((asset) => (
                  <a
                    key={asset.id}
                    href={asset.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square rounded-lg overflow-hidden border bg-muted block"
                  >
                    <img
                      src={asset.fileUrl}
                      alt="Proof of work"
                      className="object-cover w-full h-full hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed': return 'default'
    case 'cancelled': return 'destructive'
    case 'in_progress': return 'outline'
    default: return 'secondary'
  }
}