import { formatDateOnly, isDueDatePast } from '@/lib/format'
import { requirePageCapability } from '@/lib/session'
import { db } from '@/lib/db'
import Link from 'next/link'
import { ReminderStatusForm } from './status-form'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default async function RemindersPage() {
  const { organizationId, organization } = await requirePageCapability('manageJobs')

  const reminders = await db.reminder.findMany({
    where: { organizationId },
    include: {
      job: { select: { id: true, title: true } },
      customer: { select: { id: true, firstName: true, lastName: true } },
      estimate: { select: { id: true, estimateNumber: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
  })

  const openReminders = reminders.filter((r) => r.status === 'open')
  const closedReminders = reminders.filter((r) => r.status !== 'open')

  return (
    <main className="max-w-[1200px] mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reminders</h1>
        <Link href="/reminders/new" className={cn(buttonVariants(), 'no-underline')}>New reminder</Link>
      </div>

      {reminders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No reminders yet. Create one to track follow-ups.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {openReminders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-base font-semibold mb-3">Open ({openReminders.length})</h2>
              <div className="space-y-2">
                {openReminders.map((rem) => (
                  <ReminderCard key={rem.id} reminder={rem} timezone={organization.timezone} />
                ))}
              </div>
            </div>
          )}

          {closedReminders.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3 text-muted-foreground">Resolved ({closedReminders.length})</h2>
              <div className="space-y-2">
                {closedReminders.map((rem) => (
                  <ReminderCard key={rem.id} reminder={rem} timezone={organization.timezone} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}

type ReminderWithRelations = {
  id: string
  title: string
  notes: string | null
  reminderType: string
  status: string
  dueAt: Date | null
  createdAt: Date
  job: { id: string; title: string } | null
  customer: { id: string; firstName: string; lastName: string | null } | null
  estimate: { id: string; estimateNumber: string } | null
  invoice: { id: string; invoiceNumber: string } | null
}

function ReminderCard({ reminder, timezone }: { reminder: ReminderWithRelations; timezone?: string | null }) {
  const isOpen = reminder.status === 'open'
  const isOverdue = isOpen && reminder.dueAt && isDueDatePast(reminder.dueAt, new Date(), timezone)

  return (
    <Card className={cn(
      'transition-shadow',
      !isOpen && 'opacity-60',
      isOverdue && 'border-l-4 border-l-amber-500',
    )}>
      <CardContent className="py-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm">{reminder.title}</span>
              <Badge variant={reminder.status === 'open' ? 'outline' : reminder.status === 'completed' ? 'default' : 'secondary'}>
                {reminder.status}
              </Badge>
              {isOverdue && <span className="text-xs text-amber-600 font-semibold">Overdue</span>}
            </div>

            <div className="flex gap-3 text-xs text-muted-foreground">
              {reminder.dueAt && <span>Due: {formatDateOnly(reminder.dueAt)}</span>}
              <span>{reminder.reminderType.replace(/_/g, ' ')}</span>
            </div>

            {reminder.notes && <p className="text-sm mt-1">{reminder.notes}</p>}

            <div className="flex gap-3 mt-2 text-xs">
              {reminder.job && (
                <Link href={`/jobs/${reminder.job.id}` as never} className="text-primary hover:underline">
                  Job: {reminder.job.title}
                </Link>
              )}
              {reminder.customer && (
                <Link href={`/customers/${reminder.customer.id}` as never} className="text-primary hover:underline">
                  {reminder.customer.firstName} {reminder.customer.lastName || ''}
                </Link>
              )}
              {reminder.estimate && (
                <Link href={`/estimates/${reminder.estimate.id}` as never} className="text-primary hover:underline">
                  Est #{reminder.estimate.estimateNumber}
                </Link>
              )}
              {reminder.invoice && (
                <Link href={`/invoices/${reminder.invoice.id}` as never} className="text-primary hover:underline">
                  Inv #{reminder.invoice.invoiceNumber}
                </Link>
              )}
            </div>
          </div>

          {isOpen && (
            <div className="ml-3 shrink-0">
              <ReminderStatusForm reminderId={reminder.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
