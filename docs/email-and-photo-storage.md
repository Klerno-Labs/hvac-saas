# Email and private photo storage

Provider observations below were checked on September 26, 2026. Environment updates affect a new Vercel deployment; they do not alter a deployment already running. No credentials belong in this file, tickets, screenshots, or terminal output.

## Email

- The existing Resend key is usable. `pegrio.com` is verified for sending, and its expected DKIM, SPF, and sending MX DNS records matched public DNS at the check.
- Vercel's production-only `EMAIL_FROM` was changed to `FieldClose <noreply@pegrio.com>` and re-read successfully. Pegrio LLC's domain provides a FieldClose-branded sender without a new domain purchase or replacing another product's configuration.
- One explicitly authorized launch-verification email was sent to the owner's designated test address, with a stable idempotency key. Resend returned `delivered`. This is provider delivery evidence, not confirmation that the owner saw it in the inbox, and not an end-to-end test of password reset or invoice actions on the next deployment. Do not resend the test automatically.
- `fieldclose.app` is not a verified Resend sender. Existing domain usage is 3 of 3; no domain was deleted and no plan/add-on was purchased. A future switch needs a free or approved additional domain slot and access to the Cloudflare account that controls `fieldclose.app` DNS. The available Cloudflare account did not expose that zone.
- Sending from `noreply@pegrio.com` does not establish an inbox or a monitored support address. `support@fieldclose.app` mailbox ownership and receipt remain unverified. The test recipient is not designated as the support mailbox.

After deployment, verify the app's reset, invitation, estimate, and invoice flows using explicitly authorized test recipients and disposable records. Inspect provider rejection/bounce status; a saved invitation or document is not proof that its message was delivered. Assign an owner to delivery failures and unresolved support requests. Resend's [test-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [domain limits](https://resend.com/docs/knowledge-base/how-to-add-more-domains), and [sent-email status API](https://resend.com/docs/api-reference/emails/retrieve-email) describe the relevant provider behavior.

## Private photos

The implementation stores a private object reference in the existing `ProofOfWorkAsset.fileUrl` field; no database migration is required. New objects use organization/job-specific keys. The application serves them through:

- `/api/photos/[assetId]`: a current authenticated membership and the same job access rule as field work. Technicians must be assigned to the job.
- `/api/portal/[token]/photos/[assetId]`: an unexpired, unrevoked customer portal token, with the asset's job belonging to that customer and organization.

Both routes return private/no-store, no-referrer, noindex responses and proxy at most 4 MB. They never redirect to a public or signed storage URL, fetch arbitrary stored HTTP URLs, or trust an organization supplied by the browser. Provider errors are logged without object names, credentials, or raw provider payloads. S3 clients are closed after reads and writes.

Keep the R2 bucket private: public `r2.dev` access **disabled**, no public custom domains, and no browser CORS rule. The current application needs Object Read & Write access for its one bucket. It does not need account-wide administration or access to another product's buckets.

### Provider setup

The empty `fieldclose-production-photos` bucket was created in the existing account. Provider reads confirmed managed public access disabled and zero custom domains. Production-only `R2_ACCOUNT_ID` and `R2_BUCKET` were stored in Vercel and re-read successfully. No S3 credential was created, no object was uploaded, and no deployed storage claim is made yet; the two credential values and deployment checks below remain pending.

1. Use the existing R2-enabled account and the isolated bucket `fieldclose-production-photos`. Inspect an existing bucket before reusing it. Do not change unrelated buckets, purchase a subscription, or accept new paid terms as part of this checklist.
2. In R2 → Manage R2 API Tokens, an authorized owner creates a token named `FieldClose production photos` with **Object Read & Write**, **Apply to specific buckets only**, and only `fieldclose-production-photos` selected. Avoid Admin Read & Write or all-bucket scope. Choose a reviewed expiration/rotation schedule that will not silently stop production uploads.
3. Store its S3 Access Key ID and Secret Access Key directly in Vercel production as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Never put the account API token into the S3 fields or expose credentials as `NEXT_PUBLIC_*` variables. Store the matching `R2_ACCOUNT_ID` and `R2_BUCKET` alongside them. `R2_PUBLIC_BASE_URL` is not required.
4. Deploy. With an authorized disposable job, upload a photo under 4 MB, reload and retrieve it, and confirm access from the assigned technician and customer's own portal. Verify that a different organization, unassigned technician, revoked portal token, and anonymous staff-route request cannot read the bytes. Confirm the object exists in the private bucket and the public bucket endpoints remain disabled.

The existing Wrangler login can access R2, but its token-management API request was denied. It is not a substitute for the owner's scoped S3 credential step. See Cloudflare's [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/) and [public access](https://developers.cloudflare.com/r2/buckets/public-buckets/) documentation.

Local development without R2 uses ignored `.data/private-photos` files behind the same routes. Vercel fails closed without all four R2 values; it never uses local fallback. **Legacy public image URLs remain publicly accessible until their objects and database references are separately migrated and old public access is revoked.** Restoring an old database may restore those links. Preserve old files until that migration is verified.

Focused regression coverage: `tests/uploads.test.ts` and `tests/private-photos.test.ts` cover stored bytes, private references, missing configuration, storage failures, tenant and technician boundaries, customer-token expiry/revocation, object-path/bucket mismatches, bounded reads, private local fallback, and legacy-link compatibility. `tests/private-photos.integration.test.ts` exercises the real PostgreSQL membership, job, asset, and portal-token relations, including an inconsistent asset/job organization row; only authentication and provider bytes are mocked. Provider provisioning and deployed upload/retrieval remain separate checks.
