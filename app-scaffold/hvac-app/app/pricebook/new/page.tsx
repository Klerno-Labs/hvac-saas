import { requireActiveSubscription } from '@/lib/session'
import { PriceBookForm } from './form'

export default async function NewPriceBookItemPage() {
  await requireActiveSubscription()

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <PriceBookForm />
    </main>
  )
}
