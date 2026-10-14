import { Metadata } from 'next'
import { PublicHeader } from '@/app/components/public-header'
import { supportEmail, supportMailto } from '@/lib/support'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read the FieldClose terms of service, including account responsibilities, subscriptions, acceptable use, cancellation, and service availability.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <article className="max-w-3xl mx-auto px-4 py-16 prose prose-slate dark:prose-invert">
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: September 26, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By creating an account or using FieldClose (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. The Service is provided by Pegrio LLC (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
        </p>

        <h2>2. Description of Service</h2>
        <p>
          FieldClose is a quote-to-payment platform for service businesses. The Service includes estimate creation, job tracking, invoicing, payment collection, customer management, and related features.
        </p>

        <h2>3. Accounts &amp; Billing</h2>
        <p>
          You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials. Subscription fees are billed monthly in advance. We use Stripe as our payment processor; your card information is never stored on our servers.
        </p>

        <h2>4. Free Trial</h2>
        <p>
          New accounts receive a 14-day free trial unless an eligible offer provides a longer period. No credit card is required to start a trial. When a trial expires, workspace features require a paid subscription. A trial does not automatically become a paid subscription; you choose whether to subscribe in Billing. If you choose to subscribe before the trial ends, review the charge shown at checkout before paying.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any illegal purpose</li>
          <li>Upload malicious code or attempt to breach security</li>
          <li>Resell or sublicense access without written permission</li>
          <li>Scrape or automate data extraction beyond the provided API</li>
          <li>Use the Service to process payments for fraudulent transactions</li>
        </ul>

        <h2>6. Data &amp; Privacy</h2>
        <p>
          We collect and store data you provide (customer information, job details, invoices) solely to operate the Service. See our <a href="/privacy">Privacy Policy</a> for details. You retain ownership of all data you enter. You may export your data at any time from Settings.
        </p>

        <h2>7. Service Availability</h2>
        <p>
          We strive for 99.9% uptime but do not guarantee uninterrupted service. Scheduled maintenance will be announced in advance when possible. We are not liable for downtime caused by factors beyond our control (hosting provider outages, natural disasters, etc.).
        </p>

        <h2>8. Intellectual Property</h2>
        <p>
          The Service, including its design, code, branding, and features, is the intellectual property of Pegrio LLC. You retain all rights to the data you input.
        </p>

        <h2>9. Termination</h2>
        <p>
          You may manage cancellation from Settings → Billing. Review the effective cancellation date in the billing portal. Canceling a subscription does not automatically delete business records; see our <a href="/privacy">Privacy Policy</a> for deletion requests. We reserve the right to suspend accounts that violate these Terms.
        </p>

        <h2>10. Limitation of Liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. Pegrio LLC shall not be liable for indirect, incidental, or consequential damages, including lost revenue, arising from your use of the Service. Our total liability shall not exceed the amount you paid in the 12 months preceding the claim.
        </p>

        <h2>11. Refunds</h2>
        <p>
          See our <a href="/refund-policy">Refund Policy</a> for details on our 30-day satisfaction guarantee.
        </p>

        <h2>12. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be communicated via email at least 30 days before taking effect. Continued use of the Service after changes take effect constitutes acceptance.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions about these Terms? Email us at <a href={supportMailto()}>{supportEmail}</a>.
        </p>

        <hr className="my-8" />
        <p className="text-sm text-muted-foreground">© 2026 Pegrio LLC. FieldClose is a Pegrio LLC product.</p>
      </article>
    </div>
  )
}
