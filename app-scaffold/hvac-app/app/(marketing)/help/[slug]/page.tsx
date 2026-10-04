import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { getHelpArticle, getRelatedArticles, helpArticles } from '@/lib/help/articles'
import { marketingMetadata } from '@/lib/marketing/seo'
import { supportEmail, supportMailto } from '@/lib/support'
import styles from '../help.module.css'

export const dynamicParams = false
export function generateStaticParams() {
  return helpArticles.map(article => ({ slug: article.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = getHelpArticle((await params).slug)
  if (!article) return { title: 'Article not found', robots: { index: false, follow: false } }
  return marketingMetadata({ title: article.title, description: article.summary, path: `/help/${article.slug}`, article: true })
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getHelpArticle((await params).slug)
  if (!article) notFound()
  const related = getRelatedArticles(article)

  return <main id="marketing-content" tabIndex={-1} className={styles.page}>
    <div className="shell">
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/help"><ArrowLeft size={16} aria-hidden="true" /> Help Center</Link><span aria-hidden="true">/</span><span>{article.category}</span></nav>
      <header className={styles.articleHero}>
        <p className="eyebrow">{article.category} · {article.audience}</p>
        <h1 className={styles.articleTitle}>{article.title}</h1>
        <p className={styles.intro}>{article.summary}</p>
      </header>
      <div className={styles.articleLayout}>
        <aside className={styles.contents}>
          <nav aria-label="On this page"><h2>On this page</h2><ul>{article.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ul></nav>
          <p>App links may ask you to sign in. Available actions depend on your role and plan.</p>
        </aside>
        <article className={styles.articleBody} aria-label={article.title}>
          {article.sections.map(section => <section key={section.id} id={section.id} aria-labelledby={`heading-${section.id}`}>
            <h2 id={`heading-${section.id}`}>{section.title}</h2>
            {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
            {section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}
            {section.links && <div className={styles.actionLinks}>{section.links.map(link => link.href.startsWith('mailto:')
              ? <a key={link.href} href={link.href}>{link.label}<ArrowUpRight size={16} aria-hidden="true" /></a>
              : <Link key={link.href} href={link.href as Route}>{link.label}<ArrowUpRight size={16} aria-hidden="true" /></Link>)}</div>}
          </section>)}
          <aside className={styles.articleSupport} aria-label="More help"><h2>Still need help?</h2><p>Email <a href={supportMailto(`FieldClose help: ${article.title}`)}>{supportEmail}</a> with the steps you tried and the error you saw.</p><Link href="/help/account-and-password#support">See what to include in your message</Link></aside>
        </article>
      </div>
      <section className={styles.related} aria-labelledby="related-title"><div className={styles.resultsHeading}><h2 id="related-title">Keep going</h2><Link href="/help">Browse all guides</Link></div><ul className={styles.relatedGrid}>{related.map(item => <li key={item.slug}><Link className={styles.articleCard} href={`/help/${item.slug}`}><span className={styles.cardCategory}>{item.category}</span><h3>{item.title}<ArrowUpRight size={21} aria-hidden="true" /></h3><p>{item.summary}</p></Link></li>)}</ul></section>
    </div>
  </main>
}
