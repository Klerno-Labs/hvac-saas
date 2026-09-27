# Self-service release scope and launch gates

Status: September 26, 2026. The features below are implemented in the local application at `app-scaffold/hvac-app`. Final combined validation and the staged deployment receipt are recorded in [release-2026-09-26.md](release-2026-09-26.md).

## Implemented user journey

| Surface | Current behavior | Boundary |
| --- | --- | --- |
| `/demo` | Interactive sample job → priced estimate → approval → linked invoice → simulated payment. Steps enforce the sample's sequence and can be reset. | Fictional records and prices. No account writes, email, checkout, or real charge. The displayed example remains HVAC; a validated trade query can carry into signup. |
| `/pricing` | Plan comparison and a chooser based on team access and collections needs. Displayed prices come from shared plan definitions. | A recommendation does not purchase or activate a subscription. Checkout and configured Stripe prices must agree. |
| `/tools/paperwork-calculator` | Calculates current and target paperwork time from visitor inputs. | An arithmetic scenario, not measured product savings or a revenue forecast. |
| `/help` and `/help/[slug]` | Local search, topic filters, eight static workflow guides, article contents, related guides, and real app links. | No account required to read. Support is asynchronous email; no chatbot, availability guarantee, or promised resolution time. |
| `/signup` → `/onboarding` | Validated trade and Starter/Pro selection carry into account/business setup. The chosen trade can be reviewed during onboarding. | A selected plan sets trial context; live subscription payment still requires owner checkout and webhook confirmation. |
| `/setup` and `/setup/business` | Persistent owner guide and editable business details. Progress comes from saved business records and verified payment evidence. Inactive owners receive billing recovery actions. | Hiding a checklist or clicking a link does not complete setup. Payment readiness remains separate from the app subscription. |
| `/settings/import` | Customer CSV upload, column mapping, preview of errors/duplicates, explicit import, and a completion report. First name and phone are required. | Adds customers without replacing the list. Matching emails are skipped, including archived customers. A transactional receipt prevents repeating an unchanged completed batch. If a file is edited to fix skipped rows, previously imported rows without email must be removed from the new file; they cannot be matched across changed batches. |
| `/pricebook/new` and `/pricebook/import` | Create real service-price records manually or import the existing service CSV format. | Price-book imports are separate from customer imports and can update an existing item with the same name. Review the import result. |
| Settings → Team | Owner invitations report email submission separately from a saved invite. Active pending invites can be resent. | Retry preserves the stored recipient, role, token, and expiry. Provider acceptance is not inbox delivery. Expired/accepted invitations are not renewed by resend. |

The application and marketing pages share the same origin and preserve authentication, customer portal, and API paths. Header/footer links, FAQ routes, sitemap entries, and indexing rules connect the public surfaces. Optional navigation and trial-banner decoration can fall back if session storage fails, while private page guards continue to fail closed.

## What payment readiness means

Setup requires live configuration, the current connected account's charges/payouts capabilities, and a recent successful live account verification. A failed later status refresh invalidates earlier readiness. The first live-payment step uses durable audit evidence from a signed live payment confirmation, including the matching account and payment-intent identity. Historical payments without mode evidence and test transactions cannot satisfy that step. Neither step proves a bank payout. The exact criteria and seven-day account-verification window are documented in [self-service-setup.md](self-service-setup.md).

## Analytics and privacy

Public page-view analytics are limited to allowlisted public paths; query strings and fragments are removed. Private application, invite, reset, payment, and customer-portal paths are excluded. The client respects Do Not Track and Global Privacy Control.

Custom funnel events are additionally disabled unless `NEXT_PUBLIC_ENABLE_FUNNEL_EVENTS=true`. The inspected Vercel account is Hobby. Vercel documents custom events for Pro and Enterprise, so retain the default-off setting until an eligible plan and explicit activation are in place. This build-time public flag requires redeployment when changed. See [Vercel custom events](https://vercel.com/docs/analytics/custom-events).

When enabled, the fixed events cover signup clicks, tour opening/start/completion, plan recommendation, and calculator use. Payloads contain a public pathname, not form values or private links. These interactions do not prove a completed signup, collected payment, customer retention, or a business outcome.

## Production status and gates

The following is the last recorded production preflight, not a fresh claim of service recovery:

- `https://fieldclose.app` remains on its previous production deployment. The protected self-service candidate at `3e766a6` is Ready, with its URL, access checks and remaining health failure recorded in [the release receipt](release-2026-09-26.md). It has not been promoted.
- `/api/health` returned 503; `db.kcrwvvxhcncbemgvtodl.supabase.co` returned NXDOMAIN/ENOTFOUND. The owner created separate `fieldclose` project `lcdammkhivlabinxmzja`, now Healthy with an empty public schema. The original connection is preserved as encrypted `LEGACY_DATABASE_URL`; its records remain unknown and unrecovered. The active connection still points at the old project. Secure connection setup and migration remain pending; no seed has occurred.
- Stripe is test-only in the inspected environment, with no sandbox webhook endpoints. The separate live account is active and has the intended prices, but its existing FieldClose destinations have the wrong scope/version. Use separate platform and Connect signing secrets and a dedicated FieldClose billing portal; see [live payment activation](live-payments-activation.md).
- `SCHEDULED_TASKS_ENABLED=false` is configured for new production candidates. Keep scheduled execution paused until database and delivery checks pass. Changing a project environment setting does not alter the environment of an already-running deployment.
- Email sender/delivery, SMS if offered, and R2 photo storage remain release gates. Code paths and mocked tests are not evidence of deployed delivery or file persistence.

Follow [the deployment sequence](deployment-guide.md) and [production checklist](launch-checklist.md). The build generates Prisma Client but does not migrate the database. In particular, inspect the actual history before applying or resolving migration `0005`; prepare a compatible rollback or forward recovery. Validate the final revision and deployed services before assigning traffic.

## Policy corrections before promotion

The candidate corrects unsupported automatic 90-day deletion and blanket security claims, identifies the configured database/email/SMS/storage/monitoring providers, and distinguishes a free trial from an owner-initiated paid checkout. These edits do not implement a deletion service or change the existing production policy. Before promotion, reconcile existing customer commitments and the published change-notice requirements, establish a retention/deletion operating process, and review the final policy wording. The existing refund guarantee is preserved; refunds still require operational handling.

## Operating handoff

Before launch, name the people responsible for payment reconciliation, email/SMS failures, storage, failed cron work, support requests, and recovery decisions. Monitor each service independently of `/api/health`; that route checks core connectivity, not complete product readiness. Keep scheduled message recipients and payment tests explicitly authorized.

No ads, outbound marketing campaigns, or automatic growth program were launched by this work. The new pages let visitors explore and help owners get started. Their effect on activation, retention, and revenue needs measurement with real users. Automation still requires ownership when providers fail, work is only partly completed, or customer balances need review.

Implementation details: [Help and invitation recovery](self-service-help.md), [business setup](self-service-setup.md), [access boundaries](access-control.md), [estimate conversion](estimate-to-invoice.md), and [account/delivery recovery](auth-entry-hardening.md). Historical release notes remain in [release-2026-09-26.md](release-2026-09-26.md); their earlier verification totals do not certify this later revision.
