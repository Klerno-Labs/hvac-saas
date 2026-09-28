# FieldClose release hardening — September 27, 2026

**Decision: unrestricted customer release is not yet approved.** The application fixes below passed local verification. Commercial hosting, hosted capacity and outstanding live operational checks remain gates; a passing test suite does not close them.

Application revision: `5f008b08af717b5bffc5cccecd3bff312afd01cb`.

**Published:** [fieldclose.app](https://fieldclose.app) now serves deployment `dpl_BnDL2LfVaGwGgwC1jQo67jACinzy`. Both the candidate and public release passed **24 route checks plus eight metadata/access checks**. The public alias, project, exact source revision and healthy database were verified after promotion. A read-only scheduler inspection confirms definitions match this deployment and reports no outstanding eligible work; it did not invoke cron or prove actual calendar execution.

## Defects corrected

- Crowded calendar rendering now previews three jobs per day, with a complete day-filtered job list. Day filters survive search and pagination and retain tenant/assignment restrictions. Link prefetch is disabled for dense calendar links.
- Overlapping draft invoice/estimate saves now serialize before replacing line items, reject conflicting updates cleanly, and keep amounts aligned with the saved lines.
- Simultaneous review requests produce one review; simultaneous submissions accept one response. Review-token pages carry private/no-store, no-referrer and no-index headers.
- Price-book imports handle quoted multiline fields, reject malformed prices and database-overflow values, consolidate repeated names and commit atomically. Overlapping imports are serialized per organization.
- Recurring-maintenance and referral pages no longer crash from server-rendered event handlers. Referral language now matches the implemented new-customer trial benefit; it no longer promises unapplied owner subscription credits.
- Reminder, recurring, job and equipment dates preserve their calendar day. Invalid dates and fractional/out-of-range integer inventory/equipment values are rejected.
- GitHub sign-in is offered only when both provider credentials are configured.
- Organization-wide reminder/recurring pages and billing referrals enforce their intended role capabilities.
- Integration-test webhook cleanup is scoped to its own fixture, eliminating cross-test interference.

## Verification completed

| Evidence | Result | Scope |
|---|---|---|
| Unit regressions | 1,455 passed in 108 files | Application behavior and validation; many provider dependencies are mocked |
| PostgreSQL integration | 134 passed in 20 files | Actual transactions, concurrency, reconciliation and permissions against a disposable database |
| Type checking and production build | Passed | Final runtime source, isolated build with no production credentials |
| Compiled HTTP page sweep | 45/45 passed | 42 rendered pages, two PDF downloads and provider availability; authenticated owner fixture |
| Real-auth access/photo/reset checks | 23/23 passed | Owner, assigned/unassigned technician, other company, anonymous and portal boundaries; private local storage and reset-session invalidation |
| Interactive Chrome walkthrough | Passed for recorded paths | Customer/job creation, estimate creation/edit/acceptance/conversion, invoice editing/issue feedback, completion proof, review, calendar, CSV import, inventory usage, reminder completion and recurring creation; desktop and 390-pixel viewport |
| Calendar-focused pressure repeat | 42,071/42,071 requests and 9/9 invariants passed | First calendar-fix build; isolated localhost with 10 companies/100 employees and the retained three-year dataset |

The calendar-focused repeat reduced calendar P95 under 200 outstanding requests from 11.41 seconds to 1.49 seconds (approximately 87%). This is a directional local comparison, not a hosted performance promise. The dataset retains additional test rows between runs.

The final build completed **107,673/107,673 HTTP requests**, **9/9 workflow/security/integrity checks**, **zero unexpected failures**, **zero cross-company marker leaks**, and no detected database-pool/transaction errors. This includes **81,888 requests** over **600.58 seconds** with 100 concurrent users and a 500 ms think time. Sustained P95/P99 were **463/544 ms**, throughput **136.35 requests/sec**; recovery P95 was **53 ms**. At 200 outstanding requests, calendar P95 was **1.492 seconds**, confirming the focused repeat's improvement.

Peak measured application RSS was **1,435 MiB**; median RSS in the first/last approximately 20 seconds of the sustained stage was **1,418/1,228 MiB**. Ten minutes does not rule out a slow memory leak. The experiment remains closed-loop localhost traffic on the same machine as the database. It excludes WAN latency, serverless cold starts, provider outages and actual years of operation. Raw per-request data is retained in the workspace artifact; condensed receipts are committed here.

[Independent GitHub CI passed](https://github.com/Klerno-Labs/hvac-saas/actions/runs/36336883383), including clean dependency installation, migration application, type checking, build, unit/integration tests and the high-severity production dependency audit gate. Historical source reports remain unchanged so earlier results can be audited.

Browser testing deliberately exercised unavailable email-provider feedback locally. Those attempts did not deliver mail. Invoice balances were not marked paid by those actions. No real customer data, card payment, SMS or email was used in this round.

## Remaining release gates

1. **Commercial hosting:** the existing Vercel team is on Hobby, and its dashboard reports exhausted free CPU resources. Pro upgrade is prepared but awaiting the owner's approval for the displayed recurring charge and terms. Vercel limits Hobby to non-commercial use: https://vercel.com/docs/plans/hobby and https://vercel.com/docs/limits/fair-use-guidelines.
2. **Hosted capacity:** run a bounded isolated staging workload on the intended hosting/database tiers, including realistic network latency, cold starts, provider failure and longer-duration observation. The local simulation does not certify a paying-customer count or uptime.
3. **Live finance:** previous sandbox Checkout, subscription portal and connected-payment evidence is retained. Actual live charge/refund/payout and physical Terminal hardware are unverified. Real financial activity requires an explicitly authorized transaction; no such charge was performed.
4. **Delivery/storage operations:** prior approved email delivery and private production photo upload passed. Production storage cross-tenant/failure boundaries, email bounce response, and invitation delivery remain separate checks. Local file-storage tests cannot establish R2 behavior.
5. **Scheduling and incident response:** prior authenticated scheduled endpoints passed and a controlled internal reminder delivered. Actual calendar invocation, missed-run handling and actual outage/recovery alert transitions remain unverified. A designated responder must handle ambiguous deliveries and payment/support exceptions.
6. **Product scope:** SMS and AI provider functionality remain unconfigured unless separately activated; template drafting exists. QuickBooks/Xero sync and self-service refunds are not implemented. Offline support is limited to supported status/proof-text updates. Trade profiles do not implement every trade's regulatory workflow.

## Interpretation

This round found real defects that a build alone did not catch. They are fixed and covered by focused regression tests. No claim is made that every possible function, device, integration, failure mode or multiyear operating condition has been tested. Broad sale should follow closure of the concrete gates above and a monitored pilot of the supported workflow.
