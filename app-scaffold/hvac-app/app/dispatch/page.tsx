import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'
import { DispatchBoard } from './board'

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { organizationId, role } = await requireActiveSubscription()
  const params = await searchParams

  const dateStr = params.date ?? new Date().toISOString().slice(0, 10)
  const [y, m, d] = dateStr.split('-').map(Number)
  const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0)
  const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999)

  const [members, boardJobs, unscheduledJobs] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { acceptedAt: 'asc' },
    }),
    db.job.findMany({
      where: {
        organizationId,
        technicianId: { not: null },
        scheduledFor: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ['cancelled', 'completed'] },
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { scheduledFor: 'asc' },
    }),
    db.job.findMany({
      where: {
        organizationId,
        technicianId: null,
        status: { notIn: ['cancelled', 'completed'] },
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6">
      <DispatchBoard
        date={dateStr}
        members={members.map((m) => ({
          id: m.user.id,
          name: m.user.name ?? m.user.email ?? 'Unnamed',
        }))}
        boardJobs={boardJobs.map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          scheduledFor: j.scheduledFor?.toISOString() ?? null,
          technicianId: j.technicianId,
          customerName: [j.customer.firstName, j.customer.lastName].filter(Boolean).join(' '),
        }))}
        unscheduledJobs={unscheduledJobs.map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          scheduledFor: null,
          technicianId: null,
          customerName: [j.customer.firstName, j.customer.lastName].filter(Boolean).join(' '),
        }))}
        canDispatch={role !== 'member'}
      />
    </main>
  )
}
