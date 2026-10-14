import type { Metadata } from 'next'
export const metadata: Metadata = {title: 'Payment status', robots: {index: false, follow: false}}
/** Legacy return links carry no customer credential. Never disclose an invoice
 * simply because a visitor knows its identifier. New links return to the portal. */
export default function PaymentReturnPage() {
  return <main className="min-h-screen flex items-center justify-center p-6"><div className="max-w-md rounded-xl border bg-card p-8"><h1 className="text-2xl font-bold">Check your payment in your customer portal</h1><p className="mt-4 text-muted-foreground">Open the secure invoice link your service provider sent you to see the latest payment status. Some payment methods take time to settle.</p><p className="mt-4 text-muted-foreground">If you no longer have that link, contact your service provider for a new one.</p></div></main>
}
