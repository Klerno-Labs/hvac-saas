import Link from 'next/link'
import type { Route } from 'next'
import { breadcrumbSchema, jsonLd } from '@/lib/marketing/seo'

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return <><nav className="resource-breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={item.path}>{index === items.length - 1 ? <span aria-current="page">{item.name}</span> : <Link href={item.path as Route}>{item.name}</Link>}</li>)}</ol></nav><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(items)) }} /></>
}
