# Next steps

This is a release and operating sequence for the existing application, not a plan to rebuild the original scaffold. See [current blockers](known-issues.md) and [self-service release scope](self-service-launch.md).

## Before promotion

1. **Connect the separately authorized fresh database.** The original Supabase project remains inaccessible and its contents are unknown. The owner created new `fieldclose` project `lcdammkhivlabinxmzja`, with the original connection preserved as encrypted `LEGACY_DATABASE_URL`. Supabase reports Healthy and an empty public schema. Secure connection setup and migration remain pending; see [activation](production-activation.md). Do not seed synthetic users or overwrite an existing database.
2. **Establish the recovery path.** Verify the new project identity and that its application schema is empty before deploying all migrations. Capture schema and migration history, take a backup, and demonstrate restoration on an isolated database. If any existing application tables are found, stop the fresh-install path and inspect/rehearse reconciliation, especially `0005_reconcile_product_schema`. The old project is not assumed deleted or empty.
3. **Validate the final revision.** Run the repository's clean install, typecheck, unit and disposable-database integration suites, production build, and dependency review. Exercise the public tour/Help search, signup choices, setup recovery states, imports, pricing, invitation retry, and owner/technician flows on desktop and mobile. Record results against the exact final commit rather than reusing older test totals.
4. **Complete integration checks.** Configure and validate live Stripe credentials/prices and both webhook scopes, verified email delivery, and photo storage. Verify SMS only if it will be offered. Confirm live account status and payment evidence through the actual app; a checkout redirect or test transaction is insufficient.
5. **Complete environment verification of the current candidate.** The protected `3e766a6` candidate is Ready and its public/access checks passed; database health remains 503. See [the release receipt](release-2026-09-26.md). Keep new candidates unpromoted and scheduled work paused until their target database, protected workflows, and integrations pass the documented checks. Follow [deployment-guide.md](deployment-guide.md) and [deploy-vercel.md](deploy-vercel.md).

## Controlled launch

- Assign an owner for database recovery, payment failures, email/SMS delivery, storage issues, and failed scheduled work. Confirm the support mailbox is monitored.
- Promote the verified revision, check public and protected routes, and review production logs. Enable scheduled work only after the prerequisites pass and a deployment includes the enabled environment value. Keep one scheduler per workflow.
- Leave `NEXT_PUBLIC_ENABLE_FUNNEL_EVENTS` disabled on the current Hobby account. If an eligible analytics plan is chosen, explicitly enable the flag, redeploy, and verify sanitized events. Signup clicks are not completed accounts; tour simulation is not product activation.
- Observe a limited operator pilot from customer creation through confirmed live payment. Record blocked steps, errors, completion rates, and support requests before expanding to another trade or buying traffic.

## Improvements after measured use

Prioritize from actual failures and operator feedback: durable message delivery/recovery, deposits and partial-balance reconciliation, fuller exports, and real accounting integrations. Add specialized trade workflows only after discovery with operators in that trade. Public self-service content reduces avoidable questions; it does not eliminate incident handling, support ownership, or prove growth and retention.
