import type { Metadata } from 'next';
import { FaqAccordion } from '../_components/faq-accordion';
import { pricingFaqs, siteUrl, signupUrl, supportEmail } from '@/lib/marketing/site';
const faqs = [
 {q: 'Does FieldClose work on a phone?', a: 'FieldClose is a web app you can open from a phone, tablet, or computer. Use it in the field for customer information, job details, estimates, and invoices. Payment and sync operations require a connection.'},
 {q: 'Can customers approve an estimate online?', a: 'Yes. Send an estimate and your customer can review it through their customer portal. Keep the approved scope connected to the job and invoice.'},
 {q: 'How do customers pay?', a: 'Connect your Stripe account, then send customers to their invoice payment page. Availability of payment methods, processing fees, and payout timing depend on your Stripe account and configuration. A completed checkout is not always a settled payment.'},
 {q: 'What should I prepare before getting started?', a: 'Have your business details and a sample customer or job ready. Set up your organization, try an estimate, and review your payment settings before using the app for real customer payments.'},
 ...pricingFaqs,
];
export const metadata: Metadata = {title: 'Help & FAQ', description: 'Answers about FieldClose trials, plans, mobile use, customer approvals, and payments.', alternates: {canonical: `${siteUrl}/faq`}};
export default function FaqPage() {
 return <main id="marketing-content" tabIndex={-1}><section className="section shell narrow"><div className="page-heading"><p className="eyebrow">A little clarity</p><h1>Questions before<br />your first job?</h1><p>Here are the details that help you get started.</p></div><FaqAccordion faqs={faqs} /><div className="contact-strip"><div><h2>Still have a question?</h2><a href={`mailto:${supportEmail}`}>{supportEmail}</a></div><a href={signupUrl} className="button">Start free trial</a></div></section><script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({'@context':'https://schema.org','@type':'FAQPage',mainEntity:faqs.map(f=>({'@type':'Question',name:f.q,acceptedAnswer:{'@type':'Answer',text:f.a}}))}).replace(/</g,'\\u003c')}} /></main>;
}
