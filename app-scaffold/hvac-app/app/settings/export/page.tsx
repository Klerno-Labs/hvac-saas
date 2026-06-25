import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function ExportPage() {
  const { organizationId, role } = await requireAuth()

  if (role !== 'owner') {
    return (
      <main>
        <Card className="mx-auto mt-16 max-w-120 text-center">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only organization owners can export data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard" className={cn(buttonVariants())}>
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const [customerCount, jobCount, invoiceCount, paymentCount, auditCount] = await Promise.all([
    db.customer.count({ where: { organizationId, deletedAt: null } }),
    db.job.count({ where: { organizationId } }),
    db.invoice.count({ where: { organizationId } }),
    db.payment.count({ where: { organizationId } }),
    db.auditLog.count({ where: { organizationId } }),
  ])

  const entities = [
    {
      key: 'customers',
      label: 'Customers',
      description: 'All active customer records including contact details and addresses.',
      count: customerCount,
    },
    {
      key: 'jobs',
      label: 'Jobs',
      description: 'All jobs with status, scheduling, and technician assignment.',
      count: jobCount,
    },
    {
      key: 'invoices',
      label: 'Invoices',
      description: 'All invoices with amounts, status, and payment dates.',
      count: invoiceCount,
    },
    {
      key: 'payments',
      label: 'Payments',
      description: 'All confirmed payments with amounts and methods.',
      count: paymentCount,
    },
    {
      key: 'audit',
      label: 'Audit log',
      description: 'Security and admin events. Sensitive metadata is redacted.',
      count: auditCount,
    },
  ]

  return (
    <main>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold">Data export</h1>
      </div>

      <div className="space-y-4">
        {entities.map(({ key, label, description, count }) => (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{label}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                  <p className="text-xs text-muted-foreground mt-1">
                    {count.toLocaleString()} {count === 1 ? 'row' : 'rows'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={`/api/settings/export?entity=${key}&format=csv`}
                    download
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
                  >
                    CSV
                  </a>
                  <a
                    href={`/api/settings/export?entity=${key}&format=json`}
                    download
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
                  >
                    JSON
                  </a>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
          Back to settings
        </Link>
      </div>
    </main>
  )
}
