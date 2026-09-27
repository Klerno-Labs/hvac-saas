import { Metadata } from 'next'
import { PublicHeader } from '@/app/components/public-header'

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'FieldClose 30-day satisfaction guarantee and refund terms.',
  robots: { index: true, follow: true },
}

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <article className="max-w-3xl mx-auto px-4 py-16 prose prose-slate dark:prose-invert">
        <h1>Refund Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: September 26, 2026</p>

        <h2>30-Day Satisfaction Guarantee</h2>
        <p>
          We stand behind FieldClose. If you&apos;re not satisfied within your first 30 days of a paid subscription, contact us at <a href="mailto:support@fieldclose.app">support@fieldclose.app</a> and we&apos;ll refund your first month&apos;s subscription fee — no questions asked.
        </p>

        <h2>Monthly Subscriptions</h2>
        <ul>
          <li>You can cancel your subscription at any time from Settings → Billing</li>
          <li>Cancellation takes effect at the end of your current billing period</li>
          <li>You maintain full access to the Service until the end of the billing period</li>
          <li>Partial-month refunds are not offered for mid-cycle cancellations after the 30-day guarantee window</li>
        </ul>

        <h2>Free Trial</h2>
        <p>
          The 14-day free trial requires no credit card. If you do not subscribe before the trial ends, your account is suspended — no charges, no action required.
        </p>

        <h2>Payment Processing Fees</h2>
        <p>
          Customer invoice payments are processed by Stripe. Processing fees depend on the payment method and your Stripe pricing. Stripe generally does not return original processing fees when a successful payment is refunded; a bank payout is not required for that rule to apply. See <a href="https://docs.stripe.com/refunds">Stripe&apos;s refund documentation</a> for details. Customer invoice refunds are separate from FieldClose subscription refunds.
        </p>

        <h2>How to Request a Refund</h2>
        <ol>
          <li>Email <a href="mailto:support@fieldclose.app">support@fieldclose.app</a> with your account email and &quot;Refund Request&quot; in the subject line</li>
          <li>Include the date you subscribed and your organization name</li>
          <li>We process approved refunds within 5 business days back to your original payment method</li>
        </ol>

        <h2>Account Data After Cancellation</h2>
        <p>
          Canceling a subscription does not automatically delete business records. Contact support to request an export or deletion, and see our <a href="/privacy">Privacy Policy</a> for the request process.
        </p>

        <hr className="my-8" />
        <p className="text-sm text-muted-foreground">© 2026 Pegrio LLC. FieldClose is a Pegrio LLC product.</p>
      </article>
    </div>
  )
}
