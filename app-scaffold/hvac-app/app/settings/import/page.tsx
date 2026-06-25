import { requireAuth } from '@/lib/session'
import { ImportClient } from './import-client'

export default async function ImportPage() {
  const { organization } = await requireAuth()

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Import data</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>
      <ImportClient />
    </main>
  )
}
