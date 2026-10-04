import { jobAccessWhere } from '@/lib/mutation-access'
import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/app/components/pagination'
import { SearchInput } from '@/app/components/search-input'

const PAGE_SIZE = 20

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const context = await requirePageCapability('editPricing')
  const { organizationId } = context
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const q = params.q?.trim() || ''

  const where: Record<string, unknown> = { organizationId, job: jobAccessWhere(context) }

  if (q) {
    where.OR = [
      { estimateNumber: { contains: q, mode: 'insensitive' } },
      { job: { customer: { firstName: { contains: q, mode: 'insensitive' } } } },
      { job: { customer: { lastName: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  const [estimates, totalCount] = await Promise.all([
    db.estimate.findMany({
      where,
      include: { job: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.estimate.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const spParams: Record<string, string> = {}
  if (q) spParams.q = q

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Estimates</h1>
      </div>

      <SearchInput
        action="/estimates"
        defaultValue={q}
        placeholder="Search by estimate number or customer name..."
      />

      {estimates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {q ? 'No estimates match your search.' : 'No estimates yet. Create an estimate from a job detail page.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {estimates.map((est) => (
              <Link key={est.id} href={`/estimates/${est.id}` as never} className="no-underline text-inherit">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
                      <div className="min-w-0 truncate">
                        <span className="font-semibold">#{est.estimateNumber}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {est.job.title} — {est.job.customer.firstName} {est.job.customer.lastName || ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-semibold">{formatCents(est.totalCents)}</span>
                        <Badge variant={est.status === 'accepted' ? 'default' : est.status === 'declined' ? 'destructive' : 'secondary'}>
                          {est.status}
                        </Badge>
                      </div>
                    </div>
                    {est.aiDraftUsed && (
                      <p className="text-xs text-muted-foreground mt-1">AI-assisted draft</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} basePath="/estimates" searchParams={spParams} />
        </>
      )}
    </main>
  )
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}
