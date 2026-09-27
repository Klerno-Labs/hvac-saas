# FieldClose production release — September 27, 2026

User requested deployment of all current changes. Promoted the integrated application and marketing pages to https://fieldclose.app using the existing Vercel fieldclose project.

Deployment: `dpl_EDUtYCYk46GJUnWRnUSPJhCamz3A`
Candidate: https://fieldclose-59m6f7gd9-hatfield-legacy-trusts-projects.vercel.app

The release includes the current workspace SEO, error recovery, support-link, and previously committed application changes. Deployment used the working tree, including uncommitted files. It did not deploy the standalone marketing template over the application.

## Validation

- TypeScript check and 1,132 unit tests passed.
- 96 integration tests passed against a newly created local disposable test database.
- Vercel clean installation and production build passed.
- Production migration status is current; no production migration was needed or run.
- Candidate checks passed for database health, public metadata, login redirects, and rejection of unauthenticated scheduled requests.
- After promotion, all 17 sitemap URLs returned HTTP 200 without redirects, one matching canonical URL, one H1, and indexable metadata. All 17 have incoming internal links from the crawled public pages.
- Signup, login and password recovery each return their own canonical, noindex, and one H1.
- Live database health passed, and the provider alias API confirmed the exact deployment above serves fieldclose.app.

Scheduled tasks remain disabled (`SCHEDULED_TASKS_ENABLED=false`) in the release. This deployment does not certify live payment processing, provider delivery, or alert receipt. Ahrefs must crawl again before its saved issue report reflects these fixes.
