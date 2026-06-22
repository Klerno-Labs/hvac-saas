import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PortalLinkSection } from './portal-link'
import { DeleteCustomerButton } from './delete-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { organizationId } = await requireActiveSubscription()
  const { customerId } = await params

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
    include: {
      jobs: { orderBy: { createdAt: 'desc' }, take: 20 },
      equipment: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!customer) {
    notFound()
  }

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <Link href="/customers" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; All customers
      </Link>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-2xl">{customer.firstName} {customer.lastName || ''}</CardTitle>
            {customer.companyName && <p className="text-sm text-muted-foreground">{customer.companyName}</p>}
          </div>
          <Link href={`/customers/${customer.id}/edit` as never} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}>
            Edit
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium">{customer.phone || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{customer.email || '—'}</p>
            </div>
          </div>

          {(customer.addressLine1 || customer.city) && (
            <div>
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="text-sm">
                {customer.addressLine1 && <>{customer.addressLine1}<br /></>}
                {customer.addressLine2 && <>{customer.addressLine2}<br /></>}
                {[customer.city, customer.state].filter(Boolean).join(', ')}
                {customer.postalCode && ` ${customer.postalCode}`}
              </p>
            </div>
          )}

          {customer.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{customer.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground">Sales tax</p>
            <p className="text-sm font-medium">
              {customer.taxExempt ? 'Exempt — no tax applied to invoices' : 'Standard (taxed per line item settings)'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Equipment</h2>
        <Link href={`/customers/${customer.id}/equipment/new` as never} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}>
          + Add equipment
        </Link>
      </div>

      {customer.equipment.length === 0 ? (
        <Card className="mb-6">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No equipment recorded. Track HVAC units to enable service history and warranty tracking.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 mb-6">
          {customer.equipment.map((eq) => {
            const title = [eq.make, eq.model].filter(Boolean).join(' ') || eq.type
            return (
              <Link key={eq.id} href={`/customers/${customer.id}/equipment/${eq.id}` as never} className="no-underline text-inherit">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium text-sm">{title}</span>
                        {eq.serial && <span className="text-xs text-muted-foreground ml-2">SN: {eq.serial}</span>}
                      </div>
                      <Badge variant="outline" className="text-xs">{eq.type.replace('_', ' ')}</Badge>
                    </div>
                    {eq.locationOnProperty && (
                      <p className="text-xs text-muted-foreground mt-1">{eq.locationOnProperty}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Jobs</h2>
        <Link href={`/jobs/new?customerId=${customer.id}` as never} className={cn(buttonVariants({ size: 'sm' }), 'no-underline')}>
          New job
        </Link>
      </div>

      {customer.jobs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No jobs yet for this customer.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 mb-6">
          {customer.jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}` as never} className="no-underline text-inherit">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{job.title}</span>
                    <Badge variant={job.status === 'completed' ? 'default' : job.status === 'cancelled' ? 'destructive' : 'secondary'}>
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  {job.scheduledFor && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Scheduled: {new Date(job.scheduledFor).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Customer portal</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalLinkSection customerId={customer.id} />
        </CardContent>
      </Card>

      <Card className="mt-6 border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Deleting a customer hides them from your lists. Existing jobs and invoices are preserved.
          </p>
          <DeleteCustomerButton customerId={customer.id} />
        </CardContent>
      </Card>
    </main>
  )
}
