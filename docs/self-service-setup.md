# Self-service business setup

Owners enter `/setup` after creating a business and can return from the main navigation. The dashboard uses the same readiness model. Hiding the dashboard checklist does not mark setup steps complete or remove the setup page.

Progress is derived from server-owned organization context and current database records:

| Step | Evidence |
| --- | --- |
| Business details | Nonblank business name, supported trade, and a saved valid IANA timezone. |
| Customers | At least one customer that has not been deleted. Manual entry and CSV import both count. |
| Service prices | At least one undeleted PriceBookItem with a positive price. Inventory imports do not count as service price-book setup. |
| First job | A saved job belonging to the business. |
| First estimate | An issued estimate with `sentAt` set; drafts remain incomplete. |
| Customer payment setup | Live API mode, separate Connect webhook configuration, HTTPS application origin, connected account, current Stripe charges/payouts flags, and a successful live account verification within seven days. |
| First live payment | A durable `payment.recorded` audit from successful reconciliation, explicitly marked `livemode: true` with the current connected-account ID and Stripe payment-intent ID. |
| Team, optional | Another actual organization member. Unaccepted invitations are displayed as pending, not complete. |

The page never contacts Stripe on GET. Settings > Customer payments > Refresh status retrieves the account and commits its capabilities with a `stripe_account_verified` audit containing mode and account ID. Setup uses the newest matching live verification or failure, limited to seven days, and additionally requires the current stored capabilities to remain enabled. Failed status checks record `stripe_account_verification_failed`, which invalidates earlier success. Another account's verification or a test verification cannot establish live readiness.

Verified customer-payment webhook handlers pass the signed event's mode through to reconciliation. Mode, connected-account ID, and payment-intent ID are stored in the existing transactional settlement audit. Calls without an explicit mode do not inherit live mode from environment configuration. Historical Payment rows and old audits lacking mode evidence remain history; changing a key from test to live cannot turn them into verified live payments. The guide does not claim a bank payout or independently certify webhook delivery merely because configuration is present. An active app subscription does not imply customer payments are configured.

`/setup` and `/setup/business` require authenticated owner access and derive tenant identity from the session. Setup remains readable during subscription expiry so the owner can recover through app billing. Operational next actions point to billing while inactive or read-only; payment settings remain separate because settling existing customer balances must remain possible.

The business profile form edits name, trade, timezone, and optional business contact details. Its action applies the shared owner, active-subscription, and read-only guards, validates an explicit field allowlist, locks the organization row, and commits changes with its audit record in one transaction. It does not change job dates, financial totals, estimate scope, or invoice line items.

Tests cover tenant-scoped readiness queries, source-record criteria, test/live/unavailable payment states, trial expiry, read-only workspaces, optional team progress, profile field validation, authorization and tenant injection, transaction failures, persistent page access, rendered recovery states, and recoverable Stripe setup errors.
