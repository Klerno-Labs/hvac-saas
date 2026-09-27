# Known issues and release gates

Status recorded on September 26, 2026. Local implementation and a successful build do not establish production readiness. The current self-service work is described in [self-service-launch.md](self-service-launch.md); earlier checks remain historical evidence for their recorded revisions.

## Production blockers

| Area | Last observed state | Required before release |
| --- | --- | --- |
| Database | Production `/api/health` returned 503. The configured host `db.kcrwvvxhcncbemgvtodl.supabase.co` returned NXDOMAIN/ENOTFOUND. The project was not accessible from the authenticated Supabase account. | Locate the existing project and its owner, restore access/connectivity, establish a recoverable backup, and inspect actual schema and migration history. Do not replace or seed the production database as a shortcut. |
| Deployment | `fieldclose.app` still serves the earlier production deployment. The protected self-service candidate at `3e766a6` is Ready without promotion; its public/access checks passed while database health remains 503. See the release receipt. | Validate the final revision against the intended environment and complete the release gates before assigning production traffic. |
| Payments | Configured Stripe credentials and subscription prices are test mode. No FieldClose webhook endpoint was registered during preflight. | Configure matching live account/price credentials, separately signed platform and Connect endpoints, and verify the relevant subscription and customer-payment events. Test-mode success does not certify live collection. |
| Email | Resend integration exists; delivery to a real authorized recipient has not been verified for this release. | Verify sender/domain configuration and reset, invitation, estimate, invoice, and reminder delivery. Establish failure/bounce monitoring. |
| Photos | R2 was not configured in the inspected production project. | Configure storage and verify upload, retrieval, access policy, and failure behavior. Production uploads fail clearly when storage is unavailable. |
| Scheduled work and SMS | New production candidates are configured with `SCHEDULED_TASKS_ENABLED=false`. Twilio was not configured during preflight. | Keep scheduled work paused until database and delivery checks pass. Verify cron authorization and real outcomes, configure SMS if offered, and assign someone to investigate failures. |

Environment values were cleaned up during the prior release preparation, but environment changes only affect newly created deployments. They do not repair the missing database. See [the deployment sequence](deployment-guide.md), [Vercel configuration](deploy-vercel.md), and [the recorded release](release-2026-09-26.md).

## Current product boundaries

- **Payment amounts:** portal checkout collects a full invoice amount. Adjusted balances, deposits, and existing estimate payments require deliberate reconciliation; automatic estimate conversion stops when those amounts are present. There is no self-service refund flow in the app.
- **Accounting:** direct QuickBooks and Xero connections are unavailable. Owner CSV exports cover customer, job, invoice, and payment summaries. They are not a complete workspace backup; exports over 50,000 records fail rather than silently truncate.
- **Offline work:** only supported job-status and proof-of-work text updates queue locally. Photos, signatures, approvals, payments, and field-view quick actions require connectivity. Verify saved changes after reconnecting; browser storage is not a backup.
- **Files:** proof-of-work photos support JPG, PNG, and WebP up to 4 MB per file. Storage configuration and access-policy review remain deployment responsibilities.
- **Membership:** an account uses one workspace context. Invitation acceptance rejects a different recipient email and ambiguous membership in another business. Starter permits one team member; plan and role restrictions still apply.
- **Trades:** reusable trade profiles personalize examples, wording, and drafts. They do not provide specialized inspection, permit, refrigerant, pesticide, or other regulatory workflows. Representative trade pilots remain necessary.
- **AI:** generated scope and unpriced draft items require human review and business-set prices. OpenAI was unconfigured in the production preflight; local template fallback is available.
- **Automation:** provider acceptance is not proof that a message reached an inbox or phone. Appointment reminder recovery does not promise exactly-once external delivery. Keep an operational owner for retries, partial delivery, and provider uncertainty; see [delivery guarantees](auth-entry-hardening.md).

## Implemented locally, still requiring release verification

The original scaffold gaps for auth/onboarding, password reset, customer/job workflows, search and pagination on core lists, proof-of-work uploads, scoped access, and estimate-to-invoice conversion have implementation and regression coverage. Document numbers now use organization locking and collision-aware allocation rather than the old unguarded count-based approach. Email status actions and team invitations expose delivery failure and explicit retry.

The new public tour, searchable Help Center, plan chooser, paperwork calculator, persistent setup guide, customer import screen, and service-price creation screen are present in the working application. None of these statements certifies the deployed integrations or all possible tenant-access paths. Retain targeted access, concurrency, browser, and operational verification for each release.

Custom public funnel events are disabled unless `NEXT_PUBLIC_ENABLE_FUNNEL_EVENTS=true`. The current Vercel account is Hobby; custom-event collection requires an eligible plan and explicit enablement. Public page views are separate from custom events. No paid acquisition or outbound marketing campaign was launched as part of this work.
