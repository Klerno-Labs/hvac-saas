import { helpArticles, type HelpArticle, type HelpCategory } from './articles'

const stopWords = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'for', 'how', 'i', 'in', 'is', 'it', 'my', 'of', 'on', 'the', 'to', 'with'])
function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
function articleText(article: HelpArticle): string {
  return article.sections.map(section => [section.title, ...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.bullets ?? [])].join(' ')).join(' ')
}

/** Local search needs no account, network request, or external search provider. */
export function searchHelpArticles(query: string, category?: HelpCategory): HelpArticle[] {
  const terms = normalize(query.slice(0, 200)).split(' ').filter(term => term && !stopWords.has(term)).slice(0, 12)
  return helpArticles.flatMap((article, index) => {
    if (category && article.category !== category) return []
    if (!terms.length) return [{ article, score: 0, index }]
    const title = normalize(article.title)
    const description = normalize(`${article.summary} ${article.category} ${article.keywords.join(' ')}`)
    const body = normalize(articleText(article))
    let score = 0
    for (const term of terms) {
      // Common singular/plural wording should find the same workflow.
      const needle = term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : term
      if (title.includes(needle)) score += 8
      else if (description.includes(needle)) score += 4
      else if (body.includes(needle)) score += 1
      else return []
    }
    return [{ article, score, index }]
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(result => result.article)
}
