import { Metadata } from 'next'
import { NavHeader } from '@/app/components/nav-header'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How FieldClose collects, uses, and protects your data.',
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <article className="max-w-3xl mx-auto px-4 py-16 prose prose-slate dark:prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: July 22, 2026</p>

        <h2>1. Overview</h2>
        <p>
          Pegrio LLC (&quot;we&quot;, &quot;us&quot;) operates FieldClose, a quote-to-payment platform for HVAC businesses. This policy explains what data we collect, why we collect it, and how we protect it.
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
          <li><strong>OpenAI</strong> — used to generate estimate draft text. We send job title and customer name only; no payment or financial data.</li>
          <li><strong>Hosting provider (Vercel)</strong> — application hosting and database storage.</li>
          <li><strong>Legal authorities</strong> — only when compelled by valid legal process.</li>
        </ul>

        <h2>5. Data Security</h2>
        <ul>
          <li>All data is encrypted in transit (TLS 1.3) and at rest (database-level encryption)</li>
          <li>Passwords are hashed with bcrypt (never reversible)</li>
          <li>Multi-tenant architecture — your data is isolated from other organizations via row-level access controls</li>
          <li>Regular security audits and dependency vulnerability scanning</li>
          <li>Access to production data is restricted and logged via an audit trail</li>
        </ul>

        <h2>6. Data Retention</h2>
        <p>
          Your data is retained for as long as your account is active. After account cancellation, we retain data for 90 days to allow for reactivation, after which it is permanently deleted. You may request earlier deletion by emailing support@fieldclose.app.
        </p>

        <h2>7. Your Rights</h2>
        <ul>
          <li><strong>Access</strong> — export all your data from Settings → Export at any time</li>
          <li><strong>Correction</strong> — edit any data within the app</li>
          <li><strong>Deletion</strong> — request complete data deletion via email</li>
          <li><strong>Opt-out</strong> — unsubscribe from non-essential emails at any time</li>
        </ul>

        <h2>8. Cookies</h2>
        <p>
          We use essential cookies for authentication (session token) and security (CSRF protection). We do not use third-party tracking cookies or advertising networks. Analytics are collected via privacy-respecting first-party methods.
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
