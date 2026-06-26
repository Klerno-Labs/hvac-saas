import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { dueForRetry, markProcessed, markFailed } from '@/lib/webhook-store'
import { dispatchEvent } from '../route'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = process.env.WEBHOOK_RETRY_SECRET

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!expectedSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'WEBHOOK_RETRY_SECRET not configured' }, { status: 500 })
  }

  const due = await dueForRetry()
  let processed = 0
  let failed = 0

  for (const stored of due) {
    const meta = (stored.metadata as Record<string, unknown>) ?? {}
    if (!meta.payloadHash) continue

    try {
      const event = await getStripe().events.retrieve(stored.stripeEventId)
      await dispatchEvent(event)
      await markProcessed(stored.id)
      processed++
    } catch (error) {
      await markFailed(stored.id, error)
      failed++
    }
  }

  return NextResponse.json({ processed, failed })
}
