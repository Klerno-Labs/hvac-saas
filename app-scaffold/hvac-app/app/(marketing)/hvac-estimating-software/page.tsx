import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { marketingMetadata } from '@/lib/marketing/seo'
import { plans } from '@/lib/marketing/site'
import { FaqAccordion } from '../_components/faq-accordion'
import styles from '../hvac-invoicing-software/workflow.module.css'

export const metadata = marketingMetadata({
  title: 'HVAC Estimating Software for Small Residential Shops',
  description: 'Build HVAC estimates with your service prices, collect customer approval and turn accepted work into draft invoices. Explore FieldClose and try it free.',
  path: '/hvac-estimating-software',
})

const steps = [
  { title: 'Describe the work', text: 'Create an estimate for the right customer and job. Write a scope that explains the proposed work and what is excluded. Keep the customer’s equipment and service history close at hand.' },
  { title: 'Use your own prices', text: 'Add service items from your price book or enter the actual amounts your shop charges. Check quantities, line totals and tax. An estimate needs a positive total before it can be sent or accepted.' },
  { title: 'Collect the decision', text: 'Send the estimate and check for a delivery warning. Through their private customer portal, the customer can review it, accept with a typed name or drawn signature, or decline.' },
  { title: 'Carry the scope forward', text: 'Convert accepted work into a draft invoice with its scope, line items, tax and total. Review the draft before sending. Conversion does not collect money or automatically complete the job.' },
]

const faqs = [
  { q: 'What is HVAC estimating software?', a: 'HVAC estimating software helps a contractor prepare and track proposed work, line items and prices. FieldClose connects each estimate to a customer and job, supports customer approval through a portal and can turn accepted estimates into draft invoices.' },
  { q: 'Can I use my existing HVAC service prices?', a: 'Yes. Owners can import flat-priced service items through Price book import, using its CSV format, or manage items in the app. Review matching names and amounts before importing: an item that matches an existing name updates that item. Your business remains responsible for its prices.' },
  { q: 'Can customers approve an estimate online?', a: 'Yes. A customer can review a sent estimate through their private portal, then accept with a typed name or drawn signature, or decline. If the scope needs to change, the customer should contact your shop so you can review the details before continuing.' },
  { q: 'Does FieldClose calculate equipment sizing or design an HVAC system?', a: 'No. FieldClose manages the business estimate and approval workflow. It does not replace load calculations, system design, manufacturer instructions, site evaluation or the professional judgment required to specify HVAC equipment and work.' },
  { q: 'Can I turn an approved estimate into an invoice?', a: 'Yes. Create invoice on an accepted estimate copies its approved scope, line items, tax and total into a draft. Reopening conversion uses the linked invoice. If a deposit or pending payment is already recorded against the estimate, conversion stops so the balance can be reconciled first.' },
  { q: 'Do I need AI to create an estimate?', a: 'No. You can write the estimate and enter your prices yourself. Where AI-assisted drafting is available, it is a starting point for review, not automatic pricing or technical advice. Check every suggested description, quantity and price before sending anything to a customer.' },
]

export default function HvacEstimatingPage() {
  return <main id="marketing-content" tabIndex={-1} className={styles.page}>
    <div className="shell">
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">HVAC estimating software</span></nav>
      <header className={styles.hero}>
        <div>
          <p className="eyebrow">For small residential HVAC shops</p>
          <h1 className={styles.headline}>HVAC estimating software.<br />A clear scope. A recorded yes.</h1>
          <p className={styles.intro}>Build an estimate from your service prices, let the customer review the work and keep their decision with the job. FieldClose connects the proposed repair to the invoice you prepare after approval.</p>
          <div className={styles.actions}><Link href="/demo" className="button">Walk through an estimate <ArrowRight size={18} aria-hidden="true" /></Link><Link href="/pricing" className="button secondary">See pricing</Link></div>
          <p className={styles.note}>Starter ${plans[0].price}/month · 14-day trial · No card required at signup</p>
        </div>
        <figure className={styles.example}>
          <figcaption>Illustrative estimate · sample scope</figcaption>
          <div className={styles.exampleHeader}><strong>Thermostat replacement</strong><span className={styles.badge}>For customer review</span></div>
          <div className={styles.scope}>Supply and install the specified compatible thermostat, configure the agreed settings and verify operation. Additional wiring work is excluded and requires a separate estimate.</div>
          <dl><div><dt>Specified thermostat</dt><dd>$140.00</dd></div><div><dt>Installation and setup</dt><dd>$160.00</dd></div><div><dt>Example tax</dt><dd>$0.00</dd></div><div className={styles.total}><dt>Estimate total</dt><dd>$300.00</dd></div></dl>
          <p>Example only; these are not recommended market prices. Confirm compatibility, scope, your actual charges and applicable tax before quoting a real job.</p>
        </figure>
      </header>

      <section className={styles.section} aria-labelledby="estimate-workflow">
        <p className="eyebrow">From proposed work to a reviewed invoice</p>
        <h2 id="estimate-workflow" className={styles.sectionTitle}>Keep the details behind the decision.</h2>
        <p className={styles.sectionIntro}>A residential service visit can turn into a repair that needs customer approval. Use the existing customer and job to record what you propose, how it is priced and what the customer accepts.</p>
        <ol className={styles.steps}>{steps.map((step, index) => <li key={step.title}><span className={styles.stepNumber}>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        <p className={styles.note}><Link href="/help/estimates-and-approvals">Read the full estimate and approval guide</Link></p>
      </section>

      <section className={styles.section} aria-labelledby="estimate-checklist">
        <h2 id="estimate-checklist" className={styles.sectionTitle}>A practical check before you send.</h2>
        <div className={styles.columns}>
          <div><h3>Make the scope understandable.</h3><ul><li>Confirm the customer, service address and equipment involved.</li><li>Name the proposed work and any specified parts or equipment clearly.</li><li>State what is excluded and how you will handle additional work.</li><li>Review quantities, your own prices, applicable tax and the final total.</li></ul></div>
          <div><h3>Make the workflow fit your business.</h3><ul><li>Try a repair estimate with your own service prices during the trial.</li><li>Check how the customer reviews and accepts the estimate in the portal.</li><li>Review the resulting draft invoice before sending a real bill.</li><li>If your work depends on financing, deposits, progress billing or accounting sync, review the current payment and export limitations first.</li></ul></div>
        </div>
        <p className={styles.note}><Link href="/help/invoices-and-payments">Payment and deposit details</Link> · <Link href="/help/exports-and-accounting">Accounting export details</Link></p>
      </section>

      <aside className={styles.resource} aria-labelledby="estimate-template">
        <div><p className="eyebrow">Put your scope on paper first</p><h2 id="estimate-template" className={styles.sectionTitle}>Start with a free HVAC estimate template.</h2><p>Use a structured starting point for your customer details, proposed work and itemized prices. Then decide when a shared customer record and online approval would help your shop.</p></div>
        <div><div className={styles.actions}><a href="/resources/hvac-estimate-template" className="button secondary">Use the free estimate template <ArrowRight size={18} aria-hidden="true" /></a></div><p><a className={styles.textLink} href="/resources">Browse all business resources</a></p></div>
      </aside>

      <section className={`${styles.section} ${styles.faq}`} aria-labelledby="estimate-questions"><h2 id="estimate-questions" className={styles.sectionTitle}>Questions about HVAC estimates.</h2><FaqAccordion faqs={faqs} /></section>

      <section className={styles.next} aria-labelledby="estimate-next"><div><p className="eyebrow">See how it fits</p><h2 id="estimate-next" className={styles.sectionTitle}>Try your next estimate in FieldClose.</h2><p>Explore the public demo, then start a 14-day trial to work through your own sample job. Starter is ${plans[0].price}/month; Pro is ${plans[1].price}/month. Customer payment processing fees are separate.</p></div><div className={styles.actions}><a href="/signup?trade=hvac" className="button">Start free trial <ArrowRight size={18} aria-hidden="true" /></a></div></section>
      <nav aria-label="Related estimating resources" className={styles.related}><a href="/hvac-invoicing-software">HVAC invoicing software</a><a href="/resources/hvac-invoice-template">Free HVAC invoice template</a><Link href="/help/team-and-imports">Import service prices</Link><Link href="/pricing">Compare plans and fees</Link></nav>
    </div>
  </main>
}
