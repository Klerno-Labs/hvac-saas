import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CheckCircle2, Wrench } from 'lucide-react';
import { PlanCards } from '@/app/(marketing)/_components/plan-cards';
import { serviceTrade } from '@/lib/marketing/trades';
import { signupUrl } from '@/lib/marketing/site';

const workflow = [
  ['Estimate', 'A clear scope.\nA customer approval.'],
  ['Job', 'The details your\nteam needs.'],
  ['Invoice', 'Work completed.\nInvoice ready.'],
  ['Payment', 'A simple way\nto settle up.'],
];

export function HomePageContent({ statsBar }: { statsBar?: React.ReactNode }) {
  return (
    <main id="marketing-content" tabIndex={-1}>
      <section className="hero shell">
        <div className="hero-copy">
          <h1>{serviceTrade.name} software.<br />Less paperwork.</h1>
          <p className="hero-description">For small residential service businesses. Get from estimate to paid without losing the details.<br className="desktop-break" /> Customers, jobs, estimates, and invoices together.</p>
          <div className="hero-actions"><Link href="/demo" className="button secondary">Try the product tour <ArrowRight size={20} aria-hidden="true" /></Link></div>
        </div>
        <div className="hero-aside">
          <p className="eyebrow">A connected workflow<br />for {serviceTrade.audience}.</p>
          <p className="hero-promise">Keep customers, jobs,<br className="desktop-break" /> estimates, and invoices<br className="desktop-break" /> together.</p>
          <a href={signupUrl} className="button">Start free trial <ArrowUpRight size={22} aria-hidden="true" /></a>
          <p className="hero-note">14-day trial. No card. No sales call.</p>
        </div>
      </section>

      <section id="how-it-works" className="workflow-band" aria-labelledby="workflow-title">
        <div className="shell workflow-inner">
          <div className="workflow-copy">
            <h2 id="workflow-title" className="eyebrow">One workflow. From estimate to paid.</h2>
            <ol className="workflow-steps">
              {workflow.map(([title, description], index) => (
                <li key={title}><span className="step-number">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>
              ))}
            </ol>
          </div>
          <figure className="invoice-example">
            <figcaption className="eyebrow">Example invoice</figcaption>
            <div className="invoice-paper">
              <div className="invoice-top"><span className="brand invoice-brand"><Wrench size={21} aria-hidden="true" />FieldClose<span className="brand-dot">.</span></span><span className="invoice-status"><CheckCircle2 size={14} aria-hidden="true" />Viewed</span></div>
              <div className="invoice-item"><div><strong>{serviceTrade.service}</strong><p>{serviceTrade.serviceDetail}</p></div><strong>$125.00</strong></div>
              <div className="invoice-total"><span>Amount due</span><strong>$125.00</strong></div>
              <dl className="invoice-meta"><div><dt>Invoice #</dt><dd>FC-1042</dd></div><div><dt>Service</dt><dd>{serviceTrade.serviceDetail}</dd></div><div><dt>Customer</dt><dd>Alex Sample</dd></div></dl>
            </div>
          </figure>
        </div>
      </section>
      {statsBar}
      <section className="section shell self-service-section"><div><p className="eyebrow">Start on your schedule</p><h2>Take a look.<br />Make it your own.</h2><p>Explore an example job, then set up your own shop with a clear next step at every stage.</p></div><div className="self-service-links"><Link href="/demo"><span>01 / Explore</span><h3>Walk through a sample job</h3><p>See the steps from an estimate to a confirmed payment. No account needed.</p><ArrowUpRight aria-hidden="true" /></Link><Link href="/help/getting-started"><span>02 / Set up</span><h3>Bring your business along</h3><p>Follow the setup guide for customers, service prices and payments.</p><ArrowUpRight aria-hidden="true" /></Link><Link href="/tools/paperwork-calculator"><span>03 / Decide</span><h3>Put a number on paperwork</h3><p>Use your own workload to explore a goal for reducing admin time.</p><ArrowUpRight aria-hidden="true" /></Link></div></section>
      <section className="section shell benefit-inner">
        <div><p className="eyebrow">Built around the work</p><h2>Your office and your field crew.<br />On the same page.</h2></div>
        <ul>{[serviceTrade.recordLabel, 'Estimates, jobs, and invoices connected', 'Online customer approval and payment'].map(text => <li key={text}><CheckCircle2 size={20} aria-hidden="true" />{text}</li>)}</ul>
      </section>
      <section className="section shell search-entry-section"><div className="section-heading"><div><p className="eyebrow">Built for the next job</p><h2>Clear estimates.<br />Complete invoices.</h2></div><p>See how FieldClose handles the work, or start with a free template you can use today.</p></div><div className="resource-grid"><Link className="resource-card" href="/hvac-estimating-software"><span className="eyebrow">Before the job</span><h3>HVAC estimating software <ArrowUpRight size={22} aria-hidden="true" /></h3><p>Build an itemized scope, share it for approval, and keep the accepted estimate connected to the job.</p></Link><Link className="resource-card" href="/hvac-invoicing-software"><span className="eyebrow">After the work</span><h3>HVAC invoicing software <ArrowUpRight size={22} aria-hidden="true" /></h3><p>Turn the estimate into a draft invoice, review the details, and give customers an online payment path.</p></Link><Link className="resource-card" href="/resources"><span className="eyebrow">Free resources</span><h3>Templates and calculators <ArrowUpRight size={22} aria-hidden="true" /></h3><p>Print an estimate or invoice, work through job pricing, and evaluate software on your own terms.</p></Link></div></section>
      <section className="plans-section"><div className="section shell"><div className="section-heading"><div><p className="eyebrow">Room to grow</p><h2>A plan for your shop.</h2></div><p>Start with the core workflow. Add team access and collections automation as your operation grows.</p></div><PlanCards /><p className="section-link"><Link href="/pricing">Compare plans and billing details <ArrowRight size={16} aria-hidden="true" /></Link></p></div></section>
      <section className="final-cta shell"><div><p className="eyebrow">Make the next job simpler</p><h2>Good work.<br />A clean finish.</h2></div><div><p>Try FieldClose with the way your shop actually runs.</p><a className="button" href={signupUrl}>Start free trial <ArrowUpRight size={20} aria-hidden="true" /></a></div></section>
    </main>
  );
}
