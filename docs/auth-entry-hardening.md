# Account recovery and team entry

## Password reset

- Email input is trimmed and compared without case sensitivity. Signup stores normalized addresses; login supports existing mixed-case accounts.
- Reset emails contain a random 256-bit capability. New database rows store its SHA-256 digest with an explicit prefix. Existing raw-token rows can finish their original one-hour lifetime.
- Consuming a token, changing the password, invalidating sibling tokens, and removing database sessions happen in one transaction. Conditional token claiming prevents a second concurrent submission from overwriting the winning password.
- JWT sessions carry a non-reversible credential version and are checked against current credentials. A password change invalidates old sessions on their next request. Existing sessions from before this release must sign in again once. No password hashes are placed in tokens.
- Signup/reset passwords are bounded to bcrypt's supported 72-byte limit; sign-in remains compatible with preexisting longer passwords.
- Missing email configuration produces a clear global unavailable message. Rate-limit and request failures remain visible in the UI. Responses for matching and nonmatching addresses are otherwise identical, including provider rejection, to avoid exposing account existence. The UI does not claim verified email delivery.
- Reset tokens, passwords, and full reset URLs are not logged by these actions. Production email delivery monitoring is required.

## Team invitations

- The signed-in account's current database email must match the invited recipient. A copied link cannot enroll another signed-in account.
- Invite claiming, membership creation, and activity/audit records are atomic. Retries for an already accepted invite are harmless for the intended existing member.
- Expired invites, inactive workspaces, unavailable Starter seats, invalid roles, and ambiguous membership in another workspace are rejected with clear feedback.
- Signup and both login methods preserve the invite destination instead of sending invitees into new-workspace onboarding.
- Invite, password recovery, and authentication callback responses disable storage, referrer sharing, and indexing.

## Health checks

`/api/health` fails when required application dependencies are unavailable. Optional unconfigured integrations are reported without making the core application unhealthy. The response cannot be cached. This endpoint does not verify live payment settlement or successful email delivery.

Regression coverage includes recipient-bound acceptance, simultaneous invite replay, single-winner password reset, sibling token/session revocation, JWT version changes, reset delivery failures, response privacy, and health dependency boundaries. Concurrency tests run against a dedicated PostgreSQL test database.

## Appointment delivery guarantees

Reminder workers lock and re-read each eligible job. A concurrent worker skips an already locked job; an existing sent marker prevents normal replay. A provider result of `success: false` never becomes a sent marker, and a customer with no delivery address remains eligible after their contact details are corrected. At least one channel must accept the reminder before the job is marked sent; other failed channels are counted as errors.

Reminder emails pass a stable job/date idempotency key to the installed Resend client's supported request options. Provider acceptance is not proof of inbox delivery. The provider's deduplication retention applies; this is not an indefinite exactly-once guarantee. SMS has no equivalent provider key in this integration. A crash after a provider accepts SMS but before the database commits can cause a retry to send the SMS again. A transaction timeout or provider uncertainty therefore requires operational monitoring, not an assumption that nothing was sent. A committed reminder is not retried solely to recover a secondary channel failure.

The database lock is held while contacting providers, bounded by a 30-second transaction timeout. Background scheduling must allow sufficient runtime and database capacity; a durable delivery outbox remains the next operational improvement for larger sending volumes.
