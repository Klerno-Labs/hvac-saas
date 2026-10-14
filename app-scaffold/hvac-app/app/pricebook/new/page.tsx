import Link from 'next/link'
import { requirePageCapability } from '@/lib/session'
import PriceBookForm from './form'
export default async function NewPriceBookItemPage() {
  await requirePageCapability('editPricing')
  return <main className="workspace-page max-w-2xl!"><div className="workspace-heading"><div><p className="workspace-kicker">Your services, your prices</p><h1>Add a price book item</h1><p>Save a service once, then use it when building estimates.</p></div></div><div className="workspace-panel p-6"><PriceBookForm /></div><Link href="/pricebook" className="inline-block mt-6 underline">Back to price book</Link></main>
}
