import { requireActiveSubscription } from '@/lib/session'
import ImportForm from './form'

export default async function PriceBookImportPage() {
  await requireActiveSubscription()

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Import price book</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Paste your CSV below or upload a file. Expected header row:
      </p>
      <pre className="text-xs bg-muted p-3 rounded-md mb-6 overflow-x-auto">
        {`name,category,description,flatPrice,cost,imageUrl`}
      </pre>
      <ImportForm />
    </main>
  )
}
