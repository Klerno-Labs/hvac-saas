import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { marketingMetadata } from '@/lib/marketing/seo'
import { plans } from '@/lib/marketing/site'
import { FaqAccordion } from '../_components/faq-accordion'
import styles from './workflow.module.css'

export const metadata = marketingMetadata({
  title: 'HVAC Invoicing Software for Small Service Businesses',
  description: 'Keep HVAC jobs, approved estimates, invoices and customer payments connected. Explore FieldClose invoicing, clear pricing and a 14-day free trial.',
  path: '/hvac-invoicing-software',
})

const steps = [
  { title: 'Start with the job', text: 'Open the customer’s job and create an invoice, or convert an accepted estimate into a draft. The accepted scope, line items, tax and total carry into that draft.' },
  { title: 'Review before sending', text: 'Check the customer, completed work, quantities, prices and due date. Resolve any deposit or adjusted-balance warning before sending a payment request.' },
  { title: 'Share the invoice', text: 'Send the invoice and check for any email delivery warning. The customer can open it through their private portal link and use online checkout when your Stripe account is ready.' },
  { title: 'Confirm the payment', text: 'Follow the invoice’s payment status. A customer returning from checkout is not the same as a confirmed payment; some methods need time to finish processing.' },
]

const faqs = [
  { q: 'What does HVAC invoicing software do?', a: 'It keeps the bill for a service job with the customer and work records. In FieldClose, you can create invoices, convert accepted estimates into drafts, provide a customer portal and collect eligible invoice payments through a connected Stripe account.' },
  { q: 'Can I invoice from my phone?', a: 'FieldClose is a web app you can open in a phone, tablet or desktop browser. Invoice and payment operations require an internet connection. You do not need to install a native mobile app.' },
  { q: 'Can a customer pay a deposit or part of an invoice?', a: 'Self-service checkout currently collects the full invoice amount. It does not let a customer choose a partial amount or pay a deposit. If an outstanding balance differs from the invoice total, that checkout is blocked for review. Check the payment guide before using a workflow that requires staged payments.' },
  { q: 'Does FieldClose sync invoices with QuickBooks or Xero?', a: 'There is no direct QuickBooks or Xero sync. Owners can download available customer, job, invoice and payment CSV exports and review the mapping with their accountant. These summary exports are not a complete backup of every workspace record.' },
  { q: 'Are payment processing fees part of the subscription?', a: 'No. The software subscription is separate from customer payment processing. Stripe processing charges and any platform fee configured for your account apply separately. Available payment methods and payout timing depend on your Stripe account and configuration.' },
  { q: 'Can I try the invoice workflow before subscribing?', a: 'Yes. The public product tour shows a sample workflow without an account. New accounts have a 14-day trial with no credit card required at signup. Use the trial to check your customer records, invoice format and payment setup before asking real customers to pay.' },
]

export default function HvacInvoicingPage() {
  return <main id="marketing-content" tabIndex={-1} className={styles.page}>
    <div className="shell">
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">HVAC invoicing software</span></nav>
      <header className={styles.hero}>
        <div>
          <p className="eyebrow">For small residential HVAC shops</p>
          <h1 className={styles.headline}>HVAC invoicing software.<br />Keep the job with the bill.</h1>
          <p className={styles.intro}>When the service visit is finished, the paperwork should have a clear next step. FieldClose connects customer records, approved estimates and invoices so you can review the work, send the bill and follow its payment status in one place.</p>
          <div className={styles.actions}><Link href="/demo" className="button">Explore the product tour <ArrowRight size={18} aria-hidden="true" /></Link><Link href="/pricing" className="button secondary">See pricing</Link></div>
          <p className={styles.note}>Starter ${plans[0].price}/month · 14-day trial · No card required at signup</p>
        </div>
        <figure className={styles.example}>
          <figcaption>Illustrative invoice · sample amounts</figcaption>
          <div className={styles.exampleHeader}><strong>Residential service</strong><span className={styles.badge}>Draft for review</span></div>
          <dl><div><dt>Customer</dt><dd>Alex Sample</dd></div><div><dt>Job reference</dt><dd>Service visit FC-1042</dd></div><div><dt>Diagnostic visit</dt><dd>$95.00</dd></div><div><dt>Approved repair</dt><dd>$180.00</dd></div><div><dt>Example tax</dt><dd>$0.00</dd></div><div className={styles.total}><dt>Invoice total</dt><dd>$275.00</dd></div></dl>
          <p>Illustration only. Use your actual scope, pricing and applicable tax rules. Sending an invoice does not collect a payment.</p>
        </figure>
      </header>

      <section className={styles.section} aria-labelledby="invoice-workflow">
        <p className="eyebrow">From completed work to confirmed payment</p>
        <h2 id="invoice-workflow" className={styles.sectionTitle}>One record to follow through.</h2>
        <p className={styles.sectionIntro}>For a repair approved during a residential service visit, start with the customer and job you already have. Review the invoice before it reaches the customer, then keep the collection status with the work.</p>
        <ol className={styles.steps}>{steps.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        <p className={styles.note}><Link href="/help/invoices-and-payments">Read the full invoice and payment guide</Link></p>
      </section>

      <section className={styles.section} aria-labelledby="invoice-fit">
        <h2 id="invoice-fit" className={styles.sectionTitle}>Choose the fit for your shop.</h2>
        <div className={styles.columns}>
          <div><h3>A connected workflow helps when…</h3><ul><li>You copy the same customer and service details into separate estimates and invoices.</li><li>The office needs to find the job behind an unpaid invoice.</li><li>You want customers to view their invoices and eligible payment options through a private portal.</li><li>You want a web app your small team can use from the office or jobsite.</li></ul></div>
          <div><h3>Check these details in your trial.</h3><ul><li>Create an invoice for a sample service visit and review every line, amount and due date.</li><li>Verify Stripe onboarding and email delivery before sending real payment requests.</li><li>Confirm that full-invoice checkout matches your business; deposits and staged payments need a different process.</li><li>Review the CSV exports with your accountant if you need to move data into accounting software.</li></ul></div>
        </div>
      </section>

      <aside className={styles.resource} aria-labelledby="invoice-template">
        <div><p className="eyebrow">A useful starting point</p><h2 id="invoice-template" className={styles.sectionTitle}>Need an HVAC invoice template?</h2><p>Start with the information a service invoice needs: your business and customer, job reference, work performed, line items, applicable tax, amount due and payment terms.</p></div>
        <div><div className={styles.actions}><a href="/resources/hvac-invoice-template" className="button secondary">Use the free invoice template <ArrowRight size={18} aria-hidden="true" /></a></div><p><a className={styles.textLink} href="/resources">Browse all business resources</a></p></div>
      </aside>

      <section className={`${styles.section} ${styles.faq}`} aria-labelledby="invoice-questions"><h2 id="invoice-questions" className={styles.sectionTitle}>Questions about HVAC invoicing.</h2><FaqAccordion faqs={faqs} /></section>

      <section className={styles.next} aria-labelledby="invoice-next"><div><p className="eyebrow">Try it with the way you work</p><h2 id="invoice-next" className={styles.sectionTitle}>Take a sample job through billing.</h2><p>Explore the demo first, then use a 14-day trial to check FieldClose against your own shop’s workflow. Starter is ${plans[0].price}/month; Pro is ${plans[1].price}/month. Processing fees are separate.</p></div><div className={styles.actions}><a href="/signup?trade=hvac" className="button">Start free trial <ArrowRight size={18} aria-hidden="true" /></a></div></section>
      <nav aria-label="Related invoicing resources" className={styles.related}><a href="/hvac-estimating-software">HVAC estimating software</a><a href="/resources/hvac-estimate-template">Free HVAC estimate template</a><Link href="/help/exports-and-accounting">Exports and accounting</Link><Link href="/pricing">Compare plans and fees</Link></nav>
    </div>
  </main>
}
