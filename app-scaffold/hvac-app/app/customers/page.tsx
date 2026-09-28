import { customerAccessWhere } from '@/lib/mutation-access'
import { canDo } from '@/lib/permissions'
import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Pagination } from '@/app/components/pagination'
import { SearchInput } from '@/app/components/search-input'

const PAGE_SIZE = 20

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const context = await requireActiveSubscription()
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const q = params.q?.trim() || ''

  const where: Record<string, unknown> = customerAccessWhere(context)

  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { companyName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [customers, totalCount] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.customer.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const spParams: Record<string, string> = {}
  if (q) spParams.q = q

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        {canDo(context.role, 'manageCustomers') && <div className="flex gap-3 flex-wrap"><Link href="/settings/import" className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}>Import CSV</Link><Link href="/customers/new" className={cn(buttonVariants(), 'no-underline')}>
          Add customer
        </Link></div>}
      </div>

      <SearchInput
        action="/customers"
        defaultValue={q}
        placeholder="Search by name, company, phone, or email..."
      />

      {customers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {q ? 'No customers match your search.' : 'No customers yet. Add your first customer to get started.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {customers.map((customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}` as never} className="no-underline text-inherit">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold">{customer.firstName} {customer.lastName || ''}</span>
                        {customer.companyName && (
                          <span className="text-muted-foreground ml-2 text-sm">{customer.companyName}</span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground shrink-0">{customer.phone || customer.email || ''}</span>
                    </div>
                    {customer.city && customer.state && (
                      <p className="text-xs text-muted-foreground mt-1">{customer.city}, {customer.state}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination currentPage={page} totalPages={totalPages} basePath="/customers" searchParams={spParams} />
        </>
      )}
    </main>
  )
}
