# FieldClose search acquisition work — 2026-10-04

## Publication status

Implementation is validated locally, in independent CI and on **protected OVH staging** at revision `3b95bf8d2181dd330c60cffc3ad8ea9f083e5dbc`. It is **not yet published to the public site**. The public domain still serves the existing Vercel Hobby deployment; the OVH migration remains unfinished. The owner previously required no Vercel. A publication choice is pending: OVH only, or a temporary update on the existing free project. No paid plan, advertising campaign, new tracking provider or production DNS change was made. Staging deliberately requires authentication and sends noindex; it cannot acquire search traffic.

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
- Authenticated sections keep session providers, navigation, trial banner and existing access guards. The browser-only offline synchronizer remains a singleton in the root layout, avoiding duplicate queue drains during section navigation while preserving static server rendering. No database/auth/payment semantics changed.
- Private/API routes consistently use noindex and private/no-store. Public authentication forms can expose their noindex to crawlers.
- New public routes enter the existing privacy-safe analytics allowlist. Unconfigured Vercel page-view script now requires explicit activation; default is off. Input values, private paths and token URLs are not sent by these tools.
- First-party signup attribution needs no provider or schema migration: a known public landing path and coarse source category survive in the same browser tab for at most 30 minutes, then are validated and attached only to a successful email/password signup event. Raw URLs, queries, search terms and form entries are excluded; DNT/GPC, expiry, blocked storage and invite/token signup are handled. Privacy disclosure distinguishes temporary browser context from account-linked event records.
- A read-only operator report groups existing signup and onboarding events by validated acquisition context. It uses a bounded, parameterized database query, returns no personal records, and labels missing legacy attribution separately. It does not count visitors or claim conversion rates; OAuth signup and historical backfill are outside this measurement. See `docs/acquisition-measurement.md`.

## Verification

- Production Next.js build passed; public static output verified.
- Typecheck passed.
- Final local unit suite: 114 test files / 1,633 tests passed. Earlier focused checks included 102 access/cache checks, 63 SEO/marketing checks and 14 template/calculator math checks; the attribution and reporting additions include privacy, expiry, malformed-input and operator-report checks (subsets overlap the full total).
- Local production crawl: 24/24 sitemap pages HTTP 200, one H1, self-canonical and parseable JSON-LD; 27 linked public paths checked, no broken links. See `local-crawl.json`.
- Private dashboard redirects to login with noindex/private caching. Unknown resource returns 404. Local health is 503 because this preview has no configured database; this is not a production health assertion.
- Browser reviewed desktop resource hub/template and 390px mobile homepage/template/calculator. Invoice example totals $315; invalid 100% margin rejected; reset restores valid example.
- Chrome print preview visually verified: sample invoice is one page with all three line items and $315 total; 35 numbered verification notes paginate into two pages, with note 35 and the final total visible on page two. No blank website pages were retained. Both print dialogs were canceled; no physical print was sent.
- Final code `3b95bf8d2181dd330c60cffc3ad8ea9f083e5dbc` passed independent CI: 1,633 unit tests, 135 PostgreSQL integration tests, typecheck, production build, zero production dependency vulnerabilities, and startup after pruning development dependencies. The new real-PostgreSQL report fixture verifies joins to earlier signup events, UTC window boundaries, malformed metadata exclusion, aggregate-only output and unchanged database records. [CI run](https://github.com/Klerno-Labs/hvac-saas/actions/runs/37232745117).
- OVH staging passed its hardened production-only canary and final HTTPS checks: 24/24 sitemap pages returned 200 with matching staging canonicals; 23 served cached static output and the query-driven demo remained dynamic. Existing synthetic sign-in and all nine checked protected pages passed. Basic Auth, noindex, synthetic database, disabled scheduler and outbound-provider isolation were preserved. The earlier runtime repair exercised rollback successfully. `375a8cd` and `aada925` remain available as previous releases. See `staging-deployment.json` for the earlier deployment and `staging-acquisition-deployment.json` for the final attribution release.
- Actual receipt verified on deployed staging: one synthetic signup submitted through the application's HTTPS server action created one account/event containing only the approved acquisition version, landing path and source. The production-only read-only report moved from zero to one attributed signup, then returned to zero after cleanup limited to that new user and event. No workspace, real customer, provider message or payment was involved. The empty post-cleanup baseline is not real traffic.
- Browser navigation from the rebuilt resource hub to signup worked and added the optional attribution form field. The local preview remains at `http://localhost:3210/resources`; `resource-hub.jpg` shows the delivered layout.

## Next steps after approved publication

1. Run the same public crawl against `https://fieldclose.app` and confirm actual cache headers, canonicals, support destination and new routes.
2. Submit the updated existing sitemap in Search Console. Inspect and request indexing for the homepage, resource hub and two product pages. A submission is not a guarantee of indexing.
3. Check Bing's existing property and sitemap if the owner session provides access. Preserve Google/Bing verification values through migration.
4. Verify first-party signup attribution receipt in the public release and run the operator report. Visitor denominators remain unmeasured; establish a bounded host-independent visitor count only if needed. Do not enable a global SPA tracker over customer portal/payment tokens.
5. Compare 28-day query/page impressions, clicks and index coverage against this baseline. Separate branded demand from searches about HVAC workflows. Combine with completed trial/onboarding counts; do not equate clicks with customers.
6. Improve pages based on actual queries and support feedback. Add original customer examples only with permission. Expand into another trade only after its workflows/examples are validated.

## Acquisition priorities

The current sample is too small to forecast traffic. Competitor research shows established HVAC products pairing workflow-specific product pages with practical free tools. The new pages follow that useful pattern while describing FieldClose's actual scope. The first objective is qualified trials from small HVAC businesses, not unrelated visits.

| Search intent | Destination | Useful next step |
| --- | --- | --- |
| HVAC estimating software | `/hvac-estimating-software` | Review the workflow, try the demo, choose a trial |
| HVAC invoicing software | `/hvac-invoicing-software` | Review invoice/payment limits and start a trial |
| HVAC invoice or estimate template | Respective `/resources/` template | Build and print a document, then explore saved customer/job workflows |
| HVAC job pricing, margin and markup | `/tools/hvac-job-pricing-calculator` | Understand the calculation and explore the estimating workflow |
| Choosing software for a small HVAC business | `/resources/hvac-software-checklist` | Evaluate operational requirements and try the demo |

These are target intents, not measured keyword volumes or ranking claims. After publication, first verify discovery and indexing. When impressions appear, use actual query/page pairs to improve unclear titles, missing answers and internal links. Judge acquisition by completed accounts and workspaces as well as search clicks. Original customer examples, accurate workflow documentation and useful tools are appropriate sources of earned references; no links, reviews or outreach have been purchased or fabricated. Avoid publishing near-duplicate pages for every city or trade.

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

Moved the same locked shadcn 4.3.0 package to development dependencies and regenerated lockfile classification; **zero package versions changed**. `npm audit --omit=dev --audit-level=high` now reports zero vulnerabilities. The unpatched transitive package remains in development tooling; this is runtime packaging correction, not an upstream vulnerability fix. OVH staging pruned development dependencies after building and validated the resulting production install; TypeScript, shadcn, braces and micromatch remained absent after startup. The audit gate was not weakened.

The pruned Linux runtime check caught Next.js attempting to install TypeScript when loading `next.config.ts`; the hardened service could not become healthy. Staging was rolled back to `aada925` and its health, gate and synthetic sign-in reverified. Converted the unchanged configuration to native `next.config.mjs`, removing that runtime compiler requirement. CI now prunes development dependencies and starts the compiled application, verifies public pages, anonymous access boundaries and database health, and rejects silent reinstallation of build-only packages. This catches a packaging failure that build-only CI did not exercise.

Runtime correction `375a8cd198f6a37e06b066c496e17588b150c681` passed [independent CI](https://github.com/Klerno-Labs/hvac-saas/actions/runs/37231567174), including 1,570 unit tests, 134 PostgreSQL integration tests, typecheck, production build, production dependency audit and the new production-only startup check. The earlier failed runtime was not accepted as the staged release. The subsequent attribution/reporting revision `3b95bf8` passed the expanded final CI listed above.
