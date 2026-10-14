Run the verifier only with the approved production runtime environment already loaded. It never reads environment or credential files. Run from the installed app directory so the optional R2 check can load its existing `@aws-sdk/client-s3` runtime dependency. No new packages are required.

```sh
node --dns-result-order=ipv4first --no-network-family-autoselection /path/to/verify-providers.mjs --help
node --dns-result-order=ipv4first --no-network-family-autoselection /path/to/verify-providers.mjs --stripe-identity acct_EXPECTED
node --dns-result-order=ipv4first --no-network-family-autoselection /path/to/verify-providers.mjs --webhooks --webhook-target candidate
node --dns-result-order=ipv4first --no-network-family-autoselection /path/to/verify-providers.mjs --webhooks --webhook-target public
node --dns-result-order=ipv4first --no-network-family-autoselection /path/to/verify-providers.mjs --r2-roundtrip --receipt-dir /absolute/private/receipt-directory
```

Replace `acct_EXPECTED` with the previously verified Stripe account ID. The identity check makes only `GET /v1/account`, compares the ID in memory, and emits only pass/fail. Do not put keys in command arguments. The receipt directory must already exist, be owned by the invoking user, have mode `0700`, and use a resolved path without symlinks. Receipts are created exclusively at mode `0600`; they contain the exact synthetic object key for cleanup, never credentials or customer data. Initial receipts are fully written and synced before upload. Later states use a complete synced temporary file, atomic rename, and directory sync, preserving the previous cleanup key if an update fails. Keep receipts outside the repository and public evidence.

The candidate target is fixed to `http://127.0.0.1:3001` with the canonical Host and forwarded HTTPS headers. The public target is fixed to `https://fieldclose.app`. Requests reject redirects, have a 15-second deadline, and do not retry. JSON responses are capped at 8 KiB. Production identity and IPv4 egress settings are checked before any request.

Seven webhook cases exercise platform delivery to `/api/billing/webhook`, legacy platform and Connect delivery to `/api/stripe/webhook`, two invalid signatures, and two mismatched account scopes. Every payload uses the unknown `fieldclose.deployment_probe` event type with no real resource identifiers. The current handlers ignore this type before application database work. Recheck that invariant if these routes change. A pass proves the app's signature and ignore paths; it does **not** prove Stripe-origin delivery or processing of actual billing/payment events. No charge, refund, email, or application database mutation is requested.

The R2 check creates one fresh UUID key beneath `private/deployment-verification/` in `fieldclose-production-photos`. It uses an atomic `If-None-Match: *` PNG upload, verifies the exact downloaded bytes and ownership metadata, requires an unsigned request to the same S3 URL to return 401/403, then deletes only that owned key and requires a signed HEAD to return 404. It never lists objects or touches existing app photo keys. Anonymous denial at the S3 endpoint does **not** establish that bucket public domains are disabled; that remains a separate configuration check.

Cleanup runs after read/verification errors. A timed-out upload is treated as uncertain: an owned committed object may be deleted, but a 404 immediately after an uncertain upload does not prove it cannot still appear. Cleanup failure or an ownership mismatch leaves `cleanupRequired: true` in the private receipt and exits unsuccessfully. Resolve that exact key with the operator before claiming a clean roundtrip; never bulk-delete the namespace. An interrupted process can leave a receipt in `upload_pending`/`uploaded`, which also requires operator review. `passed: true` requires both verification and confirmed cleanup.

Run offline tests without credentials or network access:

```sh
node --test deploy/ovh/production/verify-providers.test.mjs
```

Cloudflare documents [atomic conditional uploads](https://developers.cloudflare.com/r2/api/s3/api/#object-level-operations). The helper checks ownership immediately before exact-key deletion; it does not rely on undocumented conditional-delete behavior.
