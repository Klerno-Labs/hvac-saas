# FieldClose search acquisition work — 2026-10-04

## Publication status

Implementation is validated in a local production build. It is **not yet published**. The public domain still serves the existing Vercel Hobby deployment; the OVH migration remains unfinished. The owner previously required no Vercel. A publication choice is pending: OVH only, or a temporary update on the existing free project. No paid plan, advertising campaign, new tracking provider or production DNS change was made.

## Verified baseline

Read from the existing verified `https://fieldclose.app/` Google Search Console property on October 4 using the owner's current session:

- Performance, selected three-month range: June 30–September 29, 2026; 1 click, 87 impressions, 1.1% CTR, average position 5.8. Low sample size; not a meaningful commercial keyword ranking benchmark.
- Only visible query row: `field close`, 25 impressions, 0 clicks. Query rows do not expose all aggregate traffic.
- Sitemap: success, 17 discovered URLs, submitted September 18, last read October 2.
- Indexing report, last updated September 20: 2 indexed, 6 not indexed. Five discovered/not indexed examples: forgot-password, login, privacy, signup, terms. Authentication pages should stay out of the index; this is not evidence all six exclusions need fixing.
- Core Web Vitals: no field data. PageSpeed request hit a provider quota; no performance score is claimed.
- Ahrefs connector returned insufficient plan; no subscription upgrade was requested or purchased.
- Existing live Vercel analytics script returned 404. Search Console is verified; visitor and funnel-event receipt is not verified. Existing application events record completed signups and onboarding, but are not attributable acquisition analytics.

## Shipped in the candidate

- Homepage names the HVAC software audience and links to useful product and resource pages.
- New substantial estimating and invoicing pages reflect supported workflows and limitations.
- Resource hub, free printable invoice and estimate builders, margin/markup job pricing calculator, and software evaluation checklist.
- 24 unique sitemap URLs (17 prior + 7 new), with no invented modification dates.
- Complete per-page canonical, Open Graph, Twitter image/title metadata; truthful organization/site/software/offers and breadcrumb schemas. No invented reviews, ratings, traffic numbers or savings claims.
- Public pages no longer query the authenticated shell; homepage, landing pages, templates, calculator, resources, help and pricing pre-render statically. Demo remains dynamic because it accepts trade/plan query parameters.
- Authenticated sections keep session providers, navigation, trial banner, offline synchronization and existing access guards. No database/auth/payment semantics changed.
- Private/API routes consistently use noindex and private/no-store. Public authentication forms can expose their noindex to crawlers.
- New public routes enter the existing privacy-safe analytics allowlist. Unconfigured Vercel page-view script now requires explicit activation; default is off. Input values, private paths and token URLs are not sent by these tools.

## Verification

- Production Next.js build passed; public static output verified.
- Typecheck passed.
- 112 test files / 1,570 tests passed, including 102 focused access/cache checks, 63 SEO/marketing checks and 14 template/calculator math checks (subsets overlap the full total).
- Local production crawl: 24/24 sitemap pages HTTP 200, one H1, self-canonical and parseable JSON-LD; 27 linked public paths checked, no broken links. See `local-crawl.json`.
- Private dashboard redirects to login with noindex/private caching. Unknown resource returns 404. Local health is 503 because this preview has no configured database; this is not a production health assertion.
- Browser reviewed desktop resource hub/template and 390px mobile homepage/template/calculator. Invoice example totals $315; invalid 100% margin rejected; reset restores valid example.
- Chrome print preview visually verified: sample invoice is one page with all three line items and $315 total; 35 numbered verification notes paginate into two pages, with note 35 and the final total visible on page two. No blank website pages were retained. Both print dialogs were canceled; no physical print was sent.

## Next steps after approved publication

1. Run the same public crawl against `https://fieldclose.app` and confirm actual cache headers, canonicals, support destination and new routes.
2. Submit the updated existing sitemap in Search Console. Inspect and request indexing for the homepage, resource hub and two product pages. A submission is not a guarantee of indexing.
3. Check Bing's existing property and sitemap if the owner session provides access. Preserve Google/Bing verification values through migration.
4. Establish no-cost, host-independent measurement with explicit public-route boundaries and verified receipt. Do not enable a global SPA tracker over customer portal/payment tokens.
5. Compare 28-day query/page impressions, clicks and index coverage against this baseline. Separate branded demand from searches about HVAC workflows. Combine with completed trial/onboarding counts; do not equate clicks with customers.
6. Improve pages based on actual queries and support feedback. Add original customer examples only with permission. Expand into another trade only after its workflows/examples are validated.

## Research informing the work

- Jobber HVAC software and free invoice tool: https://www.getjobber.com/industries/hvac/ and https://www.getjobber.com/free-tools/invoice-generator/hvac/
- Housecall Pro HVAC software and estimating: https://www.housecallpro.com/industries/hvac-software/ and https://www.housecallpro.com/industries/hvac-software/estimating/
- ServiceTitan HVAC billing: https://www.servicetitan.com/industries/hvac-software/billing
- Workiz HVAC: https://www.workiz.com/industries/hvac/
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google AI search guidance: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google documentation updates: https://developers.google.com/search/updates (FAQ rich results retired; no promised benefit from FAQ schema or llms.txt)

Traffic growth requires publication, crawling, useful content and evidence over time. This implementation does not establish rankings, acquisition volume, an unattended marketing system or unrestricted application launch readiness.

## Dependency audit follow-up

The first independent CI run passed build, unit and PostgreSQL integration checks, then failed the production dependency audit. A newly reviewed braces advisory (GHSA-vfj7-8cjw-p6xm; updated October 2) affects deeply nested glob patterns; no patched braces version was listed. The production dependency path came through the shadcn development CLI. Application source uses only its build-time CSS import, with no runtime JavaScript imports.

Moved the same locked shadcn 4.3.0 package to development dependencies and regenerated lockfile classification; **zero package versions changed**. `npm audit --omit=dev --audit-level=high` now reports zero vulnerabilities. The unpatched transitive package remains in development tooling; this is runtime packaging correction, not an upstream vulnerability fix. OVH staging must prune development dependencies after building and validate the resulting production install. The audit gate was not weakened.
