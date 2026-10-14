import { marketingMetadata } from '@/lib/marketing/seo'
import { siteUrl } from '@/lib/marketing/site'
import { serviceTrade } from '@/lib/marketing/trades'
import { isTradeId } from '@/lib/trades'
import { DemoTour } from './tour'

export const metadata = marketingMetadata({ title: "Interactive HVAC Software Demo", description: "Try a sample FieldClose workflow: schedule a job, price an estimate, preview customer approval, create an invoice, and simulate payment confirmation.", path: '/demo' })

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ trade?: string | string[]; plan?: string | string[] }> }) {
  const query = await searchParams
  const tradeId = isTradeId(query.trade) ? query.trade : serviceTrade.id
  const plan = query.plan === 'starter' || query.plan === 'pro' ? query.plan : undefined
  return <DemoTour tradeId={tradeId} plan={plan} />
}
