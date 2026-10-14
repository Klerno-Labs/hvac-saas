'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Search, X } from 'lucide-react'
import { helpCategories, type HelpCategory } from '@/lib/help/articles'
import { searchHelpArticles } from '@/lib/help/search'
import styles from './help.module.css'

export function HelpSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<HelpCategory | undefined>()
  const searchInput = useRef<HTMLInputElement>(null)
  const articles = searchHelpArticles(query, category)
  const searching = query.trim().length > 0 || !!category

  function clearFilters() {
    setQuery('')
    setCategory(undefined)
    searchInput.current?.focus()
  }

  return <section aria-label="Find help articles" className={styles.searchSection}>
    <form role="search" onSubmit={event => event.preventDefault()}>
      <label className={styles.searchLabel} htmlFor="help-search">What do you need help with?</label>
      <div className={styles.searchBox}>
        <Search size={23} aria-hidden="true" />
        <input ref={searchInput} id="help-search" type="search" value={query} maxLength={200}
          onChange={event => setQuery(event.target.value)} placeholder="Try “invoice”, “import”, or “password”"
          aria-describedby="help-search-tip" aria-controls="help-results" autoComplete="off" />
        {query && <button type="button" className={styles.clearSearch} aria-label="Clear search" onClick={() => { setQuery(''); searchInput.current?.focus() }}><X size={20} aria-hidden="true" /></button>}
      </div>
      <p id="help-search-tip" className={styles.searchTip}>Search instructions and common issues, or browse a topic below.</p>
    </form>
    <div className={styles.filters} role="group" aria-label="Filter by topic">
      <button type="button" aria-pressed={!category} onClick={() => setCategory(undefined)}>All topics</button>
      {helpCategories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <div className={styles.resultsHeading}>
      <h2>{searching ? 'Search results' : 'Browse the guides'}</h2>
      <p role="status" aria-live="polite" aria-atomic="true">{articles.length} {articles.length === 1 ? 'article' : 'articles'}{category ? ` · ${category}` : ''}</p>
    </div>
    <div id="help-results">
      {articles.length ? <ul className={styles.articleGrid}>
        {articles.map(article => <li key={article.slug}>
          <Link href={`/help/${article.slug}`} className={styles.articleCard}>
            <span className={styles.cardCategory}>{article.category}</span>
            <h3>{article.title}<ArrowUpRight size={22} aria-hidden="true" /></h3>
            <p>{article.summary}</p>
            <span className={styles.cardAudience}>{article.audience}</span>
          </Link>
        </li>)}
      </ul> : <div className={styles.emptyState}>
        <h3>No articles found</h3>
        <p>Try a shorter phrase such as “payment” or “team”, or clear your filters to browse every guide.</p>
        <button type="button" className={styles.resetButton} onClick={clearFilters}>Clear search and filters</button>
        <Link href="/help/account-and-password#support">Contact support with your question</Link>
      </div>}
    </div>
  </section>
}
