# Reusing FieldClose across trades

FieldClose uses one customer-to-payment workflow and one design system. Trade selection changes vocabulary, service examples, and new estimate drafting context. It does not create a separate application or change existing customer and financial records.

## Configuration contract

The registry is `app-scaffold/hvac-app/lib/trades.ts`. Supported identifiers are `hvac`, `plumbing`, `electrical`, `pest-control`, and `general-service`. Each profile exposes a display name, business label, description, job examples, and estimate drafting rules.

The approved public website is also integrated into this application under `app/(marketing)`, so `/`, `/pricing`, and `/faq` can deploy on `fieldclose.app` alongside the existing login, customer portal, APIs, and legal pages. Every public style is scoped to `.fieldclose-marketing`; it does not replace the operational application's global styles. The separate `fieldclose-web` repository remains the reusable design source.

Set `NEXT_PUBLIC_SERVICE_TRADE` before building to select the public site's trade copy; the default is `hvac`. Its profile IDs are tested against the application registry. Public signup and policy links use relative paths on the current origin, and displayed prices read the application's billing plan definitions. `APP_URL` controls canonical URLs and metadata. A marketing profile does not automatically change an existing organization's saved trade.

Use `getTradeProfile(organization.tradeType)` for authenticated UI. The existing `Organization.tradeType` database field defaults to `hvac`; this release does not require a new migration. Missing values retain the HVAC default. Unknown legacy values use general service vocabulary without changing stored data.

The public website can link to `/signup?trade=plumbing` (or another supported identifier). Signup validates that identifier and saves it in a seven-day HttpOnly preference cookie. Onboarding preselects it, and the owner confirms their selection when creating the business. The cookie is removed after onboarding. A direct `/onboarding?trade=electrical` link also preselects a validated profile for an authenticated new owner.

Owners can change their trade in Settings. The server derives organization identity from the authenticated owner, validates the identifier, and commits the setting, audit record, and activity record together. Existing estimates and invoices are not rewritten.

## Estimate drafting

The server passes the organization's profile into the drafting service. The profile supplies trade-specific context. Job facts are separate from system instructions, and the customer's address is not sent. Responses have bounded schemas and a 15-second request timeout; invalid or unavailable responses fall back to a local template.

Generated items start at zero dollars. The business must set prices from its price book or its own judgment before sending. The server forces every generated price to zero, and the local template adds no expiration terms. The model is instructed not to invent prices, contract terms, warranty promises, pesticide instructions, or regulatory compliance claims. Text still requires human review; schema checks do not establish factual accuracy.

## Adding another trade

1. Add the stable identifier and profile to the registry, and add the corresponding public website profile.
2. Confirm that generic customer, job, scheduling, document, payment, and service history flows fit that trade.
3. Add specialist workflows only after defining their data, permissions, records, and operational requirements with trade experts. A profile alone does not implement permits, chemical-use logs, inspections, load calculations, or other specialist obligations.
4. Add the trade to profile validation tests and review signup, onboarding, Settings, navigation, job creation, and estimate drafting at mobile and desktop widths.

## Verification

Targeted unit coverage: supported profiles, invalid and legacy values, unchanged HVAC default, signup preference handoff, server-owned organization scope, owner-only changes, atomic setting records, AI schema rejection, request timeout fallback, and suppression of invented model prices.
