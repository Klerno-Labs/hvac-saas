import { requireActiveSubscription } from '@/lib/session'
import { ImportForm } from './form'

export default async function PriceBookImportPage() {
  await requireActiveSubscription()

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Import price book</h1>
        <p className="text-muted-foreground mt-1">
          Paste CSV or upload a file to bulk-load flat-rate items. Existing items matched by name
          are updated in place — re-running an import is safe.
        </p>
      </div>
      <ImportForm />
    </main>
  )
}
