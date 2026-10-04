import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { marketingMetadata, jsonLd } from '@/lib/marketing/seo'
import { resources } from '@/lib/marketing/resources'
import { siteUrl } from '@/lib/marketing/site'
import { Breadcrumbs } from '../_components/breadcrumbs'

export const metadata = marketingMetadata({ title: 'Free HVAC Templates, Calculators & Guides', description: 'Free printable HVAC invoice and estimate templates, job pricing and paperwork calculators, and a practical software evaluation checklist. No email required.', path: '/resources' })

export default function ResourcesPage() {
  return <main id="marketing-content" tabIndex={-1} className="section shell">
    <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Resources', path: '/resources' }]} />
    <header className="page-heading"><p className="eyebrow">Useful before you sign up</p><h1>A sharper toolkit<br />for your HVAC shop.</h1><p>Price a job. Write a clearer estimate. Send a more complete invoice. These tools are free to use, with no account or email required.</p></header>
    <div className="resource-grid">{resources.map(resource => <Link className="resource-card" href={resource.path} key={resource.path}><span className="eyebrow">{resource.type}</span><h2>{resource.title} <ArrowUpRight size={24} aria-hidden="true" /></h2><p>{resource.description}</p><span className="resource-card-action">Open resource →</span></Link>)}</div>
    <section className="resource-next"><div><p className="eyebrow">When separate documents get in the way</p><h2>Keep the work connected.</h2><p>FieldClose connects customer records, estimates, jobs and invoices. Explore the workflow with sample data before setting up your shop.</p></div><Link className="button" href="/demo">Try the product tour <ArrowUpRight size={20} aria-hidden="true" /></Link></section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'FieldClose HVAC resources', url: `${siteUrl}/resources`, mainEntity: { '@type': 'ItemList', itemListElement: resources.map((resource, index) => ({ '@type': 'ListItem', position: index + 1, name: resource.title, url: `${siteUrl}${resource.path}` })) } }) }} />
  </main>
}
