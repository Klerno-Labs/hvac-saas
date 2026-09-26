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
          <h1>Less paperwork.<br />More paid work.</h1>
          <p className="hero-description">Get from estimate to paid without losing the details.<br className="desktop-break" /> Customers, jobs, estimates, and invoices together.</p>
        </div>
        <div className="hero-aside">
          <p className="eyebrow">A connected workflow<br />for {serviceTrade.audience}.</p>
          <p className="hero-promise">Keep customers, jobs,<br className="desktop-break" /> estimates, and invoices<br className="desktop-break" /> together.</p>
          <a href={signupUrl} className="button">Start free trial <ArrowUpRight size={22} aria-hidden="true" /></a>
          <p className="hero-note">14-day trial. No credit card required.</p>
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
      <section className="section shell benefit-inner">
        <div><p className="eyebrow">Built around the work</p><h2>Your office and your field crew.<br />On the same page.</h2></div>
        <ul>{[serviceTrade.recordLabel, 'Estimates, jobs, and invoices connected', 'Online customer approval and payment'].map(text => <li key={text}><CheckCircle2 size={20} aria-hidden="true" />{text}</li>)}</ul>
      </section>
      <section className="plans-section"><div className="section shell"><div className="section-heading"><div><p className="eyebrow">Room to grow</p><h2>A plan for your shop.</h2></div><p>Start with the core workflow. Add team access and collections automation as your operation grows.</p></div><PlanCards /><p className="section-link"><Link href="/pricing">Compare plans and billing details <ArrowRight size={16} aria-hidden="true" /></Link></p></div></section>
      <section className="final-cta shell"><div><p className="eyebrow">Make the next job simpler</p><h2>Good work.<br />A clean finish.</h2></div><div><p>Try FieldClose with the way your shop actually runs.</p><a className="button" href={signupUrl}>Start free trial <ArrowUpRight size={20} aria-hidden="true" /></a></div></section>
    </main>
  );
}
