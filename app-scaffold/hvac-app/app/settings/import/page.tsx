import { requireAuth } from '@/lib/session'
import { ENTITY_SPECS } from '@/lib/csv-import/specs'
import { ImportTool } from './import-client'

export default async function ImportPage() {
  await requireAuth()

  const entityOptions = Object.values(ENTITY_SPECS).map((s) => ({
    key: s.key,
    label: s.label,
    dedupeKey: s.dedupeKey,
    fields: s.fields.map((f) => ({ key: f.key, label: f.label, required: f.required })),
  }))

  return (
    <main className="max-w-[1100px] mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Import data</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-import from a competitor&apos;s CSV export. Owner-only. Records are
          scoped to your organization.
        </p>
      </div>

      <ImportTool entityOptions={entityOptions} />
    </main>
  )
}
