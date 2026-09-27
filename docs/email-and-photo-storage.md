# Email and private photo storage

The original provider observations below were checked on September 26, 2026; later application checks are dated separately. Environment updates affect a new Vercel deployment; they do not alter a deployment already running. No credentials belong in this file, tickets, screenshots, or terminal output.

## Email

- The existing Resend key is usable. `pegrio.com` is verified for sending, and its expected DKIM, SPF, and sending MX DNS records matched public DNS at the check.
- Vercel's production-only `EMAIL_FROM` was changed to `FieldClose <noreply@pegrio.com>` and re-read successfully. Pegrio LLC's domain provides a FieldClose-branded sender without a new domain purchase or replacing another product's configuration.
- One explicitly authorized launch-verification email was sent to the owner's designated test address, with a stable idempotency key. Resend returned `delivered`. This is provider delivery evidence, not confirmation that the owner saw it in the inbox, and not an end-to-end test of password reset or invoice actions on the next deployment. Do not resend the test automatically.
- `fieldclose.app` is not a verified Resend sender. Existing domain usage is 3 of 3; no domain was deleted and no plan/add-on was purchased. A future switch needs a free or approved additional domain slot and access to the Cloudflare account that controls `fieldclose.app` DNS. The available Cloudflare account did not expose that zone.
- Sending from `noreply@pegrio.com` does not establish an inbox or a monitored support address. The owner subsequently designated `pegriollc@gmail.com` for support and operational alerts. Routing configuration and app-generated support/alert delivery still need verification. `support@fieldclose.app` mailbox ownership and receipt remain unverified.

Use explicitly authorized test recipients and disposable records for hosted delivery checks. The document verification below covers one estimate and one zero-balance invoice; invitation delivery and the unobserved recovery paths remain separate checks. Inspect provider rejection/bounce status; a saved invitation or document is not proof that its message was delivered. Assign an owner to delivery failures and unresolved support requests. Resend's [test-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [domain limits](https://resend.com/docs/knowledge-base/how-to-add-more-domains), and [sent-email status API](https://resend.com/docs/api-reference/emails/retrieve-email) describe the relevant provider behavior.

### Owner recovery follow-up — September 27, 2026, 13:37 UTC

The owner reported completing password recovery. Fresh authenticated access to the existing Pegrio workspace was observed at **https://fieldclose.app/dashboard**. This closes the canonical owner sign-in handoff. The reset email body and its provider delivery status were not inspected, so this records owner-reported recovery and observed application access, not independently verified reset-email receipt. Invitation delivery and recovery failure/session-revocation paths remain separate checks.

### Application document delivery — September 27, 2026, 14:17 UTC

After reloading the canonical application on release `beae275`, one clearly labeled internal-test estimate and one zero-balance test invoice were sent through the normal document status forms to the owner's approved verification inbox. Resend records the estimate at **14:16:43.374 UTC** and invoice at **14:16:55.945 UTC**. A bounded provider lookup checked at **14:17:54 UTC** found exactly one matching message for each document and reported **`delivered` for both**, with the approved FieldClose sender and recipient. No resend was attempted.

Both messages contained the expected internal-test greeting and canonical customer-portal link; internal notes were absent. Opening the actual emailed link in the owner's browser rendered the intended estimate and invoice, including their explicit no-service/no-payment test wording, without exposing internal notes. The estimate was not accepted or declined. The invoice had **$0 total and outstanding balance**, no due date, and no payment was attempted. This checks document delivery and rendering, not a charge, settlement, invoice payment, human inbox reading, or a cross-customer authorization boundary.

This check exposed a zero-balance presentation bug: the portal and invoice email still requested payment. The source fix now limits payment prompts to collectible positive balances and uses **No payment due** / **View Invoice** for a zero balance, preserving paid/cancelled status semantics. Rendering and email regression tests pass; deployed verification of that later fix is pending. The already delivered verification messages will not be resent merely to update their wording.

Document and invitation actions now distinguish confirmed provider submission, explicit rejection, and uncertain acceptance. After uncertainty, the UI asks the operator to check delivery before resending. Nonessential activity-log failure cannot turn a successfully submitted document email into a failed action, and private delivery exceptions are not logged. Hosted invitation verification was not performed because the current Starter workspace has its one permitted member; its seat limit was not bypassed. Failure/bounce handling, support response coverage, and hosted invitation/recovery edge cases remain operating checks.

## Private photos

The implementation stores a private object reference in the existing `ProofOfWorkAsset.fileUrl` field; no database migration is required. New objects use organization/job-specific keys. The application serves them through:

- `/api/photos/[assetId]`: a current authenticated membership and the same job access rule as field work. Technicians must be assigned to the job.
- `/api/portal/[token]/photos/[assetId]`: an unexpired, unrevoked customer portal token, with the asset's job belonging to that customer and organization.

Both routes return private/no-store, no-referrer, noindex responses and proxy at most 4 MB. They never redirect to a public or signed storage URL, fetch arbitrary stored HTTP URLs, or trust an organization supplied by the browser. Provider errors are logged without object names, credentials, or raw provider payloads. S3 clients are closed after reads and writes.

Keep the R2 bucket private: public `r2.dev` access **disabled**, no public custom domains, and no browser CORS rule. The current application needs Object Read & Write access for its one bucket. It does not need account-wide administration or access to another product's buckets.

### Provider setup

The isolated `fieldclose-production-photos` bucket was created in the existing account. Provider reads confirmed managed public access disabled and zero custom domains. Production-only `R2_ACCOUNT_ID` and `R2_BUCKET` were stored in Vercel and re-read successfully. After explicit owner approval, the `FieldClose production photos` account token was created with **Object Read & Write for this bucket only**, a revocable **Forever** duration, and no account-administration permission. Its S3 credentials were saved as **Secret** values in Vercel **Production only**. No deployment was performed as part of this setup.

Direct provider verification succeeded using a synthetic 99-byte PNG: authenticated upload and download both returned HTTP 200, and the downloaded bytes matched. The unsigned request returned HTTP 400 with XML error `InvalidArgument` / `Authorization`, not image bytes. The retained evidence object is `fieldclose-verification/9d8ef001-cd89-4a8e-9cca-647cf8df514b/synthetic.png`; SHA-256 is `12a9594e630a0ed8243bdf5020f8f77c5c2284859bb418ebf645f952a00994d5`. It contains no customer data. This verifies the scoped credential and provider storage path, **not the deployed application's upload or authorization flow**. No bucket policy or database records were changed by the verification.

1. Use the existing R2-enabled account and the isolated bucket `fieldclose-production-photos`. Inspect an existing bucket before reusing it. Do not change unrelated buckets, purchase a subscription, or accept new paid terms as part of this checklist.
2. In R2 → Manage R2 API Tokens, an authorized owner creates a token named `FieldClose production photos` with **Object Read & Write**, **Apply to specific buckets only**, and only `fieldclose-production-photos` selected. Avoid Admin Read & Write or all-bucket scope. Choose a reviewed expiration/rotation schedule that will not silently stop production uploads.
3. Store its S3 Access Key ID and Secret Access Key directly in Vercel production as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Never put the account API token into the S3 fields or expose credentials as `NEXT_PUBLIC_*` variables. Store the matching `R2_ACCOUNT_ID` and `R2_BUCKET` alongside them. `R2_PUBLIC_BASE_URL` is not required.
4. Deploy. With an authorized disposable job, upload a photo under 4 MB, reload and retrieve it, and confirm access from the assigned technician and customer's own portal. Verify that a different organization, unassigned technician, revoked portal token, and anonymous staff-route request cannot read the bytes. Confirm the object exists in the private bucket and the public bucket endpoints remain disabled.

The existing Wrangler login can access R2, but its token-management API request was denied. The approved credential was therefore created through the Cloudflare dashboard. Keep a named owner responsible for revoking or rotating this non-expiring credential when access changes. See Cloudflare's [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/) and [public access](https://developers.cloudflare.com/r2/buckets/public-buckets/) documentation.

Local development without R2 uses ignored `.data/private-photos` files behind the same routes. Vercel fails closed without all four R2 values; it never uses local fallback. **Legacy public image URLs remain publicly accessible until their objects and database references are separately migrated and old public access is revoked.** Restoring an old database may restore those links. Preserve old files until that migration is verified.

Focused regression coverage: `tests/uploads.test.ts` and `tests/private-photos.test.ts` cover stored bytes, private references, missing configuration, storage failures, tenant and technician boundaries, customer-token expiry/revocation, object-path/bucket mismatches, bounded reads, private local fallback, and legacy-link compatibility. `tests/private-photos.integration.test.ts` exercises the real PostgreSQL membership, job, asset, and portal-token relations, including an inconsistent asset/job organization row; only authentication and provider bytes are mocked. At the provider-setup checkpoint, deployed upload/retrieval was still pending; the following application check supersedes that status.

### Application photo verification — September 27, 2026, 13:37 UTC

One synthetic 99-byte, 32×32 PNG was uploaded through the real proof-of-work form for the existing internal job on **https://fieldclose.app**. After a full reload, the page showed **Uploaded photos 1** and the image DOM confirmed `complete: true`, `naturalWidth: 32`, `naturalHeight: 32`, and source `/api/photos/cmujv44va000112klstpznifw`. This establishes persisted owner-visible upload/retrieval through the deployed application. Authenticated image success was observed in the browser only; its HTTP status and headers were not separately instrumented.

A cookie-free GET of that exact asset returned **401**, `Content-Type: application/json`, error `You must be logged in`, `Cache-Control: private, no-store, max-age=0`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow`, with no image bytes. This verifies anonymous denial for the saved asset, separately from the earlier direct-provider storage check.

The final job page remained **Draft** and unscheduled, with **Completed** blank, **Photos (1)** and no invoices. It still stated **No proof of work recorded yet**, consistent with uploading a photo without submitting a completion record. Safe screenshots were retained locally as `production-photo-persisted.png` and `production-photo-job-still-draft.png`.

Hosted cross-tenant, unassigned-technician, customer-portal and storage-failure checks were not performed; local integration coverage does not replace them. No job completion, signature, customer document delivery or charge was submitted during this verification.
