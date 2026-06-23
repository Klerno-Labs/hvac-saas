import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import { TechnicianRoster } from './technician-roster'

export default async function TechniciansSettingsPage() {
  const { organizationId } = await requireAuth()

  const technicians = await db.technician.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      active: true,
      _count: { select: { jobs: { where: { technicianId: { not: null } } } } },
    },
  })

  const mapped = technicians.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    active: t.active,
    assignedCount: t._count.jobs,
  }))

  return (
    <main className="max-w-[900px] mx-auto px-4 py-8">
      <a href="/settings" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        &larr; Settings
      </a>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Technicians</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Manage the technician roster used as columns on the dispatch board. Deactivate a
        technician to hide them from the board without losing their assignment history.
      </p>

      <TechnicianRoster technicians={mapped} />
    </main>
  )
}
