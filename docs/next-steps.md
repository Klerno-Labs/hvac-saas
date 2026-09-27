# Next steps

This is a release and operating sequence for the existing application, not a plan to rebuild the original scaffold. See [current blockers](known-issues.md) and [self-service release scope](self-service-launch.md).

## Before promotion

1. **Recover the existing database.** Identify the Supabase project owner, recover project access and a reachable connection, and confirm existing data. Production previously returned 503 because its configured database hostname did not resolve. Do not create an empty replacement, seed, reset, or run development schema commands against production.
2. **Establish the recovery path.** Capture schema and migration history, take a backup, and demonstrate restoration. Rehearse the actual migration path on an isolated representative copy, especially `0005_reconcile_product_schema`; an earlier deployment may already contain some schema changes. Assess rollback compatibility before applying anything.
3. **Validate the final revision.** Run the repository's clean install, typecheck, unit and disposable-database integration suites, production build, and dependency review. Exercise the public tour/Help search, signup choices, setup recovery states, imports, pricing, invitation retry, and owner/technician flows on desktop and mobile. Record results against the exact final commit rather than reusing older test totals.
4. **Complete integration checks.** Configure and validate live Stripe credentials/prices and both webhook scopes, verified email delivery, and photo storage. Verify SMS only if it will be offered. Confirm live account status and payment evidence through the actual app; a checkout redirect or test transaction is insufficient.
5. **Create and verify the current candidate.** The earlier protected `decec78` candidate is not the current self-service release. Keep new candidates unpromoted and scheduled work paused until their target database, protected workflows, and integrations pass the documented checks. Follow [deployment-guide.md](deployment-guide.md) and [deploy-vercel.md](deploy-vercel.md).

## Controlled launch

- Assign an owner for database recovery, payment failures, email/SMS delivery, storage issues, and failed scheduled work. Confirm the support mailbox is monitored.
- Promote the verified revision, check public and protected routes, and review production logs. Enable scheduled work only after the prerequisites pass and a deployment includes the enabled environment value. Keep one scheduler per workflow.
- Leave `NEXT_PUBLIC_ENABLE_FUNNEL_EVENTS` disabled on the current Hobby account. If an eligible analytics plan is chosen, explicitly enable the flag, redeploy, and verify sanitized events. Signup clicks are not completed accounts; tour simulation is not product activation.
- Observe a limited operator pilot from customer creation through confirmed live payment. Record blocked steps, errors, completion rates, and support requests before expanding to another trade or buying traffic.

## Improvements after measured use

Prioritize from actual failures and operator feedback: durable message delivery/recovery, deposits and partial-balance reconciliation, fuller exports, and real accounting integrations. Add specialized trade workflows only after discovery with operators in that trade. Public self-service content reduces avoidable questions; it does not eliminate incident handling, support ownership, or prove growth and retention.
