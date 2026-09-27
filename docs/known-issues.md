# Known issues and release gates

Status recorded on September 26, 2026. Local implementation and a successful build do not establish production readiness. The current self-service work is described in [self-service-launch.md](self-service-launch.md); earlier checks remain historical evidence for their recorded revisions.

## Production blockers

| Area | Last observed state | Required before release |
| --- | --- | --- |
| Database | Separate `fieldclose` project `lcdammkhivlabinxmzja` now connects, has all ten migrations, and has no Prisma schema drift. A post-migration logical backup restored correctly into an isolated local database. SSL enforcement is enabled; all application tables remain empty. The old connection is preserved as encrypted `LEGACY_DATABASE_URL`. | Deploy with the new connection and verify owner/tenant workflows. Continue backup verification as real data is introduced. The original project's data remains unknown and unrecovered; do not claim it was migrated or erase its recovery trail. |
| Deployment | `fieldclose.app` still serves the earlier production deployment. Protected candidate `7878c6f` is Ready with the new database; all 24 hosted checks pass, including health 200. See the release receipt. | Verify the first owner's authenticated workflows and finish provider/operating gates before assigning production traffic. |
| Payments | Production uses the separate Stripe sandbox. The existing live Pegrio LLC account has Payments/Payouts active and correct FieldClose prices. Its two FieldClose webhook destinations are platform-only with the wrong payload version; its default billing portal belongs to another product. | Securely install live keys; reuse the existing live prices; configure separate platform/Connect destinations with the correct events/version and distinct secrets; assign a dedicated FieldClose billing portal; verify signed billing and customer-payment outcomes. See [activation steps](live-payments-activation.md). |
| Email | The next deployment is configured to use `FieldClose <noreply@pegrio.com>` on the verified parent-business domain. Resend confirms the one authorized verification email delivered. The dedicated FieldClose sender domain and support mailbox remain unverified. | Deploy the configured sender, verify actual app reset/invitation/document flows, establish failure/bounce monitoring, and confirm a monitored support address. Provider delivery does not establish inbox placement or receipt by the owner. |
| Photos | An empty private `fieldclose-production-photos` bucket exists; public managed access is disabled and no custom domain is attached. Account and bucket settings are saved; scoped S3 credentials remain pending. | Create/store the specifically approved bucket-scoped credentials, deploy private photo routes, and verify real upload, retrieval, cross-tenant denial and failure behavior. Production uploads fail clearly when storage is unavailable. |
| Scheduled work and SMS | New production candidates are configured with `SCHEDULED_TASKS_ENABLED=false`. Twilio was not configured during preflight. | Keep scheduled work paused until database and delivery checks pass. Verify cron authorization and real outcomes, configure SMS if offered, and assign someone to investigate failures. |

Environment changes only affect newly created deployments; existing deployments retain their captured connection. See [the deployment sequence](deployment-guide.md), [Vercel configuration](deploy-vercel.md), and [the recorded release](release-2026-09-26.md).

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
