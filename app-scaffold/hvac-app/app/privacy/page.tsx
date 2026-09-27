import { Metadata } from 'next'
import { PublicHeader } from '@/app/components/public-header'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How FieldClose collects, uses, and protects your data.',
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <article className="max-w-3xl mx-auto px-4 py-16 prose prose-slate dark:prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: September 26, 2026</p>

        <h2>1. Overview</h2>
        <p>
          Pegrio LLC (&quot;we&quot;, &quot;us&quot;) operates FieldClose, a quote-to-payment platform for service businesses. This policy explains what data we collect, why we collect it, and how we protect it.
        </p>

        <h2>2. Data We Collect</h2>
        <h3>Account Data</h3>
        <ul>
          <li>Name, email address, password (bcrypt-hashed, never stored in plaintext)</li>
          <li>Organization name and role assignments</li>
        </ul>
        <h3>Business Data You Input</h3>
        <ul>
          <li>Customer contact information (name, address, phone, email)</li>
          <li>Job details, estimates, and invoices</li>
          <li>Payment records processed through Stripe</li>
          <li>Equipment and inventory records</li>
        </ul>
        <h3>Technical Data</h3>
        <ul>
          <li>IP address, browser type, and usage logs</li>
          <li>Cookies for authentication (session tokens via NextAuth)</li>
        </ul>

        <h2>3. How We Use Your Data</h2>
        <ul>
          <li>To provide and maintain the Service (authentication, job tracking, invoicing)</li>
          <li>To process payments via Stripe (we never see or store your card number)</li>
          <li>To send service notifications (estimate approvals, payment confirmations)</li>
          <li>To provide customer support</li>
          <li>To improve the Service through aggregated analytics</li>
        </ul>

        <h2>4. Data Sharing</h2>
        <p>We do not sell your data. We share data only with:</p>
        <ul>
          <li><strong>Stripe</strong> — payment processing. Card data goes directly to Stripe via their secure elements, never touching our servers.</li>
          <li><strong>OpenAI</strong> — used to generate estimate draft text. When you request a draft, we send the job title, job notes, customer name, and selected trade context. Review job notes before requesting an AI draft; payment card details are not included.</li>
          <li><strong>Vercel</strong> — application hosting and the public-page analytics described below.</li>
          <li><strong>Supabase</strong> — storage of account and business records in the configured database.</li>
          <li><strong>Resend</strong> — recipient addresses and message content for transactional email, such as invitations, password recovery and customer documents.</li>
          <li><strong>Twilio</strong> — phone numbers and message content when SMS delivery is configured and used.</li>
          <li><strong>Cloudflare R2</strong> — uploaded job photos and other supported files when file storage is configured.</li>
          <li><strong>Sentry</strong> — application error diagnostics when error monitoring is configured.</li>
          <li><strong>Legal authorities</strong> — only when compelled by valid legal process.</li>
        </ul>

        <h2>5. Data Security</h2>
        <ul>
          <li>The hosted application uses HTTPS to protect browser connections</li>
          <li>Passwords are hashed with bcrypt (never reversible)</li>
          <li>Server-side organization and role checks restrict access to business records</li>
          <li>Dependency vulnerability scanning is part of the release checks</li>
          <li>Selected security, administrative and payment actions are recorded in an application audit trail</li>
        </ul>

        <h2>6. Data Retention</h2>
        <p>
          Account and business records are retained while your account is active. Canceling a subscription does not automatically delete those records. Email support@fieldclose.app to request deletion or to ask about retained records and backups. Deletion requests require account verification and review of records that must be retained; we will confirm the scope and timing of the request.
        </p>

        <h2>7. Your Rights</h2>
        <ul>
          <li><strong>Access</strong> — organization owners can export customers, jobs, invoices, and payments as CSV from Settings. Contact support for additional data requests</li>
          <li><strong>Correction</strong> — edit supported records within the app, subject to your role and the record&apos;s status; contact support for other corrections</li>
          <li><strong>Deletion</strong> — request deletion via email as described above</li>
          <li><strong>Opt-out</strong> — unsubscribe from non-essential emails at any time</li>
        </ul>

        <h2>8. Cookies</h2>
        <p>
          We use essential cookies for authentication (session token) and security (CSRF protection). We do not use third-party tracking cookies or advertising networks. On public product, pricing, tour, calculator and help pages, Vercel Analytics may collect page views and fixed interaction events, such as opening the tour or clicking signup. Our event payloads exclude form entries, help search text, customer records and URL queries or fragments. These events are disabled when the browser signals Do Not Track or Global Privacy Control.
        </p>

        <h2>9. Children&apos;s Privacy</h2>
        <p>
          The Service is a business-to-business tool and is not intended for individuals under 18. We do not knowingly collect data from minors.
        </p>

        <h2>10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy as the Service evolves. Material changes will be communicated via email at least 30 days before taking effect.
        </p>

        <h2>11. Contact</h2>
        <p>
          Privacy questions? Email <a href="mailto:support@fieldclose.app">support@fieldclose.app</a>.
        </p>

        <hr className="my-8" />
        <p className="text-sm text-muted-foreground">© 2026 Pegrio LLC. FieldClose is a Pegrio LLC product.</p>
      </article>
    </div>
  )
}
