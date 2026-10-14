# Manual QA Checklist

Structured manual testing plan for the HVAC SaaS application. Cover each section before release. These unchecked boxes are a reusable test plan, not the executed result ledger. See [dated verification](evidence/release-hardening-2026-09-27/report.md) for actual results and remaining gates.

## Test Conventions
- Test as **User A** (owner of Org A) unless noted otherwise
- Where tenant isolation is tested, use **User B** (owner of Org B)
- Use browser incognito windows to simulate separate sessions
- Record Pass/Fail for each item

---

## Feature 1: Auth and Organization Onboarding

### Signup
- [ ] Navigate to `/signup` — form renders
- [ ] Submit with missing fields — validation error shown
- [ ] Submit with valid data — account created, redirected to `/login?registered=true`
- [ ] Submit with duplicate email — error "account already exists"

### Login
- [ ] Navigate to `/login` — form renders
- [ ] Submit with wrong credentials — error shown
- [ ] Submit with correct credentials — redirected to `/dashboard`
- [ ] GitHub OAuth button present (if configured)

### Onboarding
- [ ] After first login, user without org redirected to `/onboarding`
- [ ] Submit org creation form — org created, redirected to `/dashboard`
- [ ] Re-visiting `/onboarding` after org creation — shows error or redirects

### Protected Routes
- [ ] Visiting `/dashboard` without auth — redirected to `/login`
- [ ] Visiting `/customers` without auth — redirected to `/login`

---

## Feature 2: Customers and Jobs

### Customer CRUD
- [ ] `/customers` — shows empty state or list
- [ ] `/customers/new` — form renders with required fields
- [ ] Submit without first name or phone — validation error
- [ ] Submit valid customer — created, redirected to detail page
- [ ] Customer detail shows correct info (name, phone, email, address)
- [ ] Customer list shows only org's customers

### Job CRUD
- [ ] `/jobs` — shows empty state or list
- [ ] `/jobs/new` — customer dropdown populated
- [ ] Submit without title — validation error
- [ ] Submit valid job — created, redirected to detail page
- [ ] Job detail shows customer link, status, dates
- [ ] Job status can be updated via dropdown

### Tenant Isolation
- [ ] User B cannot see User A's customers
- [ ] User B cannot see User A's jobs
- [ ] Direct URL to User A's customer from User B — 404

---

## Feature 3: Estimates with AI Draft

### Estimate CRUD
- [ ] Navigate to job detail → "New estimate" link
- [ ] Estimate form loads with job context
- [ ] AI draft button generates scope and line items
- [ ] AI output clearly marked as draft for review
- [ ] Submit estimate — created with server-calculated totals
- [ ] Estimate detail shows line items, totals, scope
- [ ] Estimate list shows only org's estimates

### Estimate Status
- [ ] Status can be updated (draft → sent → accepted/declined)
- [ ] Only draft estimates can be edited

### Tenant Isolation
- [ ] User B cannot see User A's estimates

---

## Feature 4: Proof of Work and Invoices

### Proof of Work
- [ ] Job detail → "Record completion" link
- [ ] Submit work summary — job marked as completed
- [ ] Work summary visible on job detail page
- [ ] Can update proof of work after initial recording

### Invoice CRUD
- [ ] Job detail → "New invoice" link
- [ ] Invoice seeds from accepted estimate (if exists)
- [ ] Submit invoice — created with server-calculated totals
- [ ] Invoice detail shows line items, totals, status
- [ ] Invoice list shows only org's invoices

### Invoice Status
- [ ] Draft invoices can be issued; valid void/overdue transitions are enforced. Paid status requires a matching verified payment webhook and cannot be selected manually.
- [ ] Only draft invoices can be edited
- [ ] Outstanding amount updates correctly per status

### Tenant Isolation
- [ ] User B cannot see User A's invoices

---

## Feature 5: Dashboard and Reminders

### Dashboard
- [ ] `/dashboard` — loads with org name
- [ ] Metric cards show correct counts (customers, jobs, outstanding)
- [ ] Empty org shows zero metrics without errors
- [ ] Attention section shows overdue invoices (if any)
- [ ] Recent activity shows event history

### Reminders
- [ ] `/reminders/new` — form renders
- [ ] Create reminder — appears in list
- [ ] "Done" button marks reminder as completed
- [ ] "Dismiss" button marks as dismissed
- [ ] Reminders list only shows org's reminders

---

## Feature 6: Stripe Connect and Payments

### Stripe Connect
- [ ] Settings page → Stripe section visible
- [ ] "Connect Stripe" button works (redirects to Stripe)
- [ ] Return from Stripe refreshes connection state
- [ ] "Refresh status" updates charges/payouts enabled
- [ ] Only owners can modify Stripe settings

### Payment Initiation
- [ ] Invoice detail → Payment section visible for sent invoices
- [ ] "Create payment link" generates Stripe Checkout URL
- [ ] Checkout page loads with correct line items
- [ ] Payment not available for draft or paid invoices

### Webhook Processing
- [ ] `checkout.session.completed` webhook marks invoice as paid
- [ ] Invoice `outstandingCents` set to 0 after payment
- [ ] Payment record created with `succeeded` status
- [ ] Duplicate webhook does not corrupt state
- [ ] Return page shows "processing" until webhook confirms

### Tenant Isolation
- [ ] User B cannot initiate payment for User A's invoices

---

## Feature 7: Collections Automation

### Collections Policy
- [ ] Settings → Collections section visible
- [ ] Enable/disable toggle works
- [ ] Day thresholds validated (final > second > first)
- [ ] Only owners can modify collections policy

### Automation
- [ ] `/api/collections/run` creates attempts for overdue invoices
- [ ] Duplicate runs don't create duplicate attempts
- [ ] Paid invoices excluded
- [ ] Paused invoices excluded
- [ ] Endpoint requires bearer token in production

### Invoice Controls
- [ ] Invoice detail → Collections section for sent/overdue invoices
- [ ] Pause/resume collections works
- [ ] Dismiss collection attempt works
- [ ] Collections history visible

---

## Feature 8: Customer Portal

### Portal Access
- [ ] Customer detail → "Generate portal link"
- [ ] Generated URL is a valid long token
- [ ] Portal dashboard shows customer name + org name
- [ ] Portal shows only sent/accepted estimates and non-draft invoices

### Portal Data Safety
- [ ] No internal notes visible in portal
- [ ] No other customers' data visible
- [ ] No admin-only statuses exposed
- [ ] Expired token returns 404
- [ ] Revoked token returns 404

### Portal Payment
- [ ] Portal invoice detail → "Pay now" button for unpaid invoices
- [ ] Checkout session created and redirects to Stripe
- [ ] Payment confirmed only via webhook, not redirect

---

## Feature 9: Accounting Export and Reporting

### Accounting Settings
- [ ] Settings → Accounting section visible
- [ ] QuickBooks/Xero connection and sync are clearly unavailable; attempts cannot mark a provider connected
- [ ] Owner CSV export succeeds with the expected records and safe cell escaping
- [ ] Exports above the documented limit return a clear error instead of truncating
- [ ] Only owners can modify accounting settings

### Reports
- [ ] `/reports` — loads with financial overview
- [ ] Receivables breakdown by status accurate
- [ ] Overdue invoices listed with days overdue
- [ ] Recent payments shown
- [ ] Accounting availability language does not imply a live provider connection
- [ ] Empty org shows safe empty states

---

## Feature 10: Admin Controls and Audit

### Admin Role Enforcement
- [ ] Settings changes require owner role
- [ ] Non-owner user sees "Only organization owners" error

### Audit Log
- [ ] Settings → Audit log link visible
- [ ] Audit log shows recent admin actions
- [ ] Event type filter works
- [ ] Audit log does not expose secrets
- [ ] Non-owner user sees access denied

### Security Headers
- [ ] Response includes X-Content-Type-Options
- [ ] Response includes X-Frame-Options

---

## Cross-Cutting

### Navigation
- [ ] All major pages reachable from dashboard or settings
- [ ] Back links work on detail pages
- [ ] Landing page links to signup and dashboard

### Error Handling
- [ ] Invalid URLs return 404
- [ ] Server errors don't leak internal details
- [ ] Form validation errors are clear and actionable

### Performance
- [ ] Dashboard loads in < 3 seconds
- [ ] List pages handle 50+ records without issues
- [ ] Build completes without errors
