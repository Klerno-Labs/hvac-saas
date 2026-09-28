import { supportEmail, supportMailto } from '@/lib/support'
import { PHOTO_SIZE_LIMIT } from '@/lib/photo-upload'

export const helpCategories = ['Getting started', 'Quotes & payments', 'Field work', 'Your account'] as const
export type HelpCategory = typeof helpCategories[number]
export type HelpLink = { label: string; href: string }
export type HelpSection = {
  id: string
  title: string
  paragraphs?: readonly string[]
  steps?: readonly string[]
  bullets?: readonly string[]
  links?: readonly HelpLink[]
}
export type HelpArticle = {
  slug: string
  title: string
  summary: string
  category: HelpCategory
  audience: string
  keywords: readonly string[]
  sections: readonly HelpSection[]
  related: readonly string[]
}

/** Plain content keeps the guide reusable across trade-specific storefronts.
 * Document current user-visible behavior, not planned integrations. */
export const helpArticles: readonly HelpArticle[] = [
  {
    slug: 'getting-started', title: 'Set up your business and first job',
    summary: 'Start with your business details, a customer, and one job. Then check the path from quote to payment.',
    category: 'Getting started', audience: 'Business owners',
    keywords: ['setup', 'onboarding', 'start', 'business', 'company', 'timezone', 'trade', 'hvac', 'plumbing', 'electrician', 'pest control'],
    sections: [
      { id: 'business', title: 'Create your workspace', steps: [
        'Create an account, then enter your business name, trade, contact details, and timezone during setup.',
        'Open the setup guide to review what is ready and what still needs attention. The owner manages business settings.',
        'Choose the trade that fits your business. It personalizes service examples and estimate drafts; it does not add specialized trade integrations.',
      ], links: [{ label: 'Create an account', href: '/signup' }, { label: 'Open setup guide', href: '/setup' }, { label: 'Review business details', href: '/setup/business' }] },
      { id: 'first-job', title: 'Try one complete workflow', steps: [
        'Add a customer with accurate contact information, then create a job for that customer.',
        'Add the scope of work and a scheduled date. Assign a technician when a team member will do the work.',
        'Create an estimate, check every price, and send it for review. An accepted estimate can become a draft invoice.',
        'Review the invoice and payment setup before sending a real customer a payment request.',
      ], links: [{ label: 'Add a customer', href: '/customers/new' }, { label: 'Create a job', href: '/jobs/new' }] },
      { id: 'readiness', title: 'Check readiness before taking payments', paragraphs: [
        'Creating a workspace does not activate online payments. The owner must complete Stripe onboarding and confirm payment readiness in Settings. Test mode does not collect real money.',
        'Use Billing to check your current plan and trial end date. If a screen is unavailable, ask your owner to check your role and subscription status.',
      ], links: [{ label: 'Check business settings', href: '/settings' }, { label: 'Review billing', href: '/settings/billing' }] },
    ], related: ['team-and-imports', 'estimates-and-approvals', 'invoices-and-payments'],
  },
  {
    slug: 'team-and-imports', title: 'Invite your team and import customers',
    summary: 'Choose the right access, accept an invitation, and review a customer CSV before importing it.',
    category: 'Getting started', audience: 'Owners and office teams',
    keywords: ['team', 'invite', 'invitation', 'member', 'role', 'technician', 'dispatcher', 'office admin', 'csr', 'csv', 'import', 'spreadsheet', 'duplicate', 'mapping'],
    sections: [
      { id: 'invite', title: 'Invite someone to your team', steps: [
        'As an owner, open Settings → Team. Enter the person’s email and choose the role they need.',
        'Check the delivery result. If the invitation is saved but email was not sent, use Resend invitation in the pending list. Ask the recipient to check their spam folder too.',
        'Have them open their invitation and sign in or create an account with that same email address. Invitations expire; request a new invitation from the owner if the link is no longer valid.',
        'If an invitation is blocked, check pending invitations, available plan seats, and subscription status. Starter is limited to one member; review the current plans before adding a team.',
      ], paragraphs: ['An account already belonging to another business cannot join a second workspace through an invitation. Contact support if the person needs help with an existing membership.'], links: [{ label: 'Open team settings', href: '/settings' }, { label: 'Compare current plans', href: '/pricing' }] },
      { id: 'roles', title: 'Give each person the access they need', bullets: [
        'Owners manage team members, subscriptions, payment settings, and exports.',
        'Office admins can manage customers, jobs, and pricing. Dispatchers and CSRs can manage customers and jobs, but cannot edit pricing.',
        'Technicians work on assigned jobs. They can see issued customer-facing documents for those jobs; draft quotes, draft invoices, and company-wide pricing tools are restricted.',
      ] },
      { id: 'customers', title: 'Import a customer CSV', steps: [
        'Open Customer import and use the sample template to prepare your file. First name and phone are required.',
        'Upload the CSV and map each column to its customer field. Confirm that names, phone numbers, email addresses, and addresses map correctly.',
        'Preview validation errors and possible duplicates. Correct your source file when needed, then explicitly confirm the import.',
        'Read the completion report and check several customer records. Imports add records; they do not replace your existing customer list. Keep a copy of your source file.',
      ], paragraphs: ['Review duplicates before repeating an import. Records without a reliable matching email can be harder to identify as duplicates.'], links: [{ label: 'Open customer import', href: '/settings/import' }, { label: 'Review customers', href: '/customers' }] },
      { id: 'pricebook', title: 'Import your service prices separately', paragraphs: [
        'The owner can use Price book import for flat-priced service items. Its CSV format is different from customer import. Use the header shown on that screen and enter prices in dollars.',
        'An item matching an existing name updates that item. Review names and amounts carefully before importing; review the created, updated, and skipped counts afterward.',
      ], links: [{ label: 'Open price book import', href: '/pricebook/import' }] },
    ], related: ['getting-started', 'account-and-password', 'exports-and-accounting'],
  },
  {
    slug: 'estimates-and-approvals', title: 'Price an estimate and collect approval',
    summary: 'Review the scope and prices, send a customer portal link, and turn accepted work into a draft invoice.',
    category: 'Quotes & payments', audience: 'Owners and pricing teams',
    keywords: ['estimate', 'quote', 'quotation', 'price', 'pricing', 'pricebook', 'AI', 'approval', 'approve', 'accept', 'decline', 'signature', 'send', 'email'],
    sections: [
      { id: 'draft', title: 'Build and review the draft', steps: [
        'Create the estimate for the correct job. Check the customer, scope of work, line items, quantities, tax, and total.',
        'Use your price book or enter the actual prices your business charges. AI-assisted drafts start with unpriced items; review every suggested description and price before sending.',
        'Save your draft while you work. The estimate must have a positive total before it can be sent or accepted.',
      ], links: [{ label: 'Create an estimate', href: '/estimates/new' }, { label: 'Review price book', href: '/pricebook' }] },
      { id: 'approval', title: 'Send it for customer review', paragraphs: [
        'Set the estimate to Sent. With a valid customer email and available email delivery, the customer receives a portal link. Check any delivery warning; a saved Sent status alone does not prove an email arrived.',
        'In the portal, the customer opens the sent estimate, reviews the scope, and accepts or declines it. Approval supports a typed name or a drawn signature. Ask the customer to contact your business if the scope needs to change.',
        'Keep portal links private. If a customer loses access or the link expires, open their customer record and provide a current portal link.',
      ], links: [{ label: 'Open estimates', href: '/estimates' }, { label: 'Find a customer', href: '/customers' }] },
      { id: 'invoice', title: 'Create the invoice from accepted work', paragraphs: [
        'Open an accepted estimate and choose Create invoice. FieldClose copies the approved scope, line items, tax, and total into a draft invoice. Reopening the conversion uses the existing linked invoice.',
        'Review the draft and its due date before sending it. Conversion does not automatically collect money. If a deposit or payment is already recorded against the estimate, conversion stops so the balance can be reconciled first.',
      ], links: [{ label: 'Read the invoice and deposit guide', href: '/help/invoices-and-payments' }] },
    ], related: ['invoices-and-payments', 'team-and-imports', 'field-work-and-offline'],
  },
  {
    slug: 'invoices-and-payments', title: 'Send invoices and understand payment status',
    summary: 'Connect payments, send the right invoice, and understand processing, adjusted balances, and deposit limits.',
    category: 'Quotes & payments', audience: 'Business owners and customer-facing teams',
    keywords: ['invoice', 'payment', 'pay', 'paid', 'Stripe', 'checkout', 'processing', 'pending', 'deposit', 'partial', 'balance', 'card', 'refund', 'payout', 'fees'],
    sections: [
      { id: 'connect', title: 'Confirm online payments are ready', paragraphs: [
        'The owner connects Stripe in Settings and completes Stripe’s onboarding requirements. Check that charges are enabled before sending an online payment request. Payout availability can have separate requirements.',
        'A test connection is for testing only. Payment methods, processing fees, and payout timing depend on your Stripe account and configuration. Subscription fees and customer payment fees are separate.',
      ], links: [{ label: 'Check payment setup', href: '/setup' }, { label: 'Open Stripe settings', href: '/settings' }] },
      { id: 'send', title: 'Send the invoice and check settlement', steps: [
        'Create an invoice for the job or use Create invoice on an accepted estimate. Review all amounts, the customer, and the due date.',
        'Set the invoice to Sent and check any email delivery warning. The customer uses their private portal link to open the invoice and pay through Stripe.',
        'After checkout, check the invoice again for confirmed payment. Some methods take time to settle; returning from checkout does not by itself mark an invoice Paid.',
      ], paragraphs: ['If the payment says it is processing, wait for confirmation before asking the customer to try again. For a customer who cannot open their link, provide a current portal link from their customer record.'], links: [{ label: 'Open invoices', href: '/invoices' }, { label: 'Find a customer', href: '/customers' }] },
      { id: 'deposits', title: 'Deposits and adjusted balances need review', paragraphs: [
        'Self-service portal checkout currently collects the full invoice amount. It does not offer a customer-entered partial amount or a deposit checkout.',
        'An invoice whose outstanding balance differs from its total cannot use this checkout flow. Accepted-estimate conversion also stops when a deposit or pending payment needs reconciliation. Do not create a second full invoice to bypass that warning.',
        'Contact support with the estimate or invoice number before continuing. For refunds or disputes, the owner should review the payment in Stripe and contact support about any corresponding FieldClose balance changes. There is no self-service refund workflow in this app.',
      ] },
      { id: 'trouble', title: 'When payment is unavailable', bullets: [
        'Draft, paid, and void invoices cannot be paid through the portal.',
        'The invoice needs a positive balance and a Stripe account enabled for charges.',
        'If a previous payment session cannot be confirmed, retry later rather than collecting a duplicate payment. Include the invoice number and visible error when contacting support.',
      ] },
    ], related: ['estimates-and-approvals', 'subscription-and-billing', 'exports-and-accounting'],
  },
  {
    slug: 'subscription-and-billing', title: 'Manage your plan, billing, or cancellation',
    summary: 'Find your current plan, open the billing portal, and check cancellation details before making a change.',
    category: 'Your account', audience: 'Business owners',
    keywords: ['subscription', 'plan', 'billing', 'cancel', 'cancellation', 'trial', 'upgrade', 'Starter', 'Pro', 'card', 'renewal', 'past due', 'read only'],
    sections: [
      { id: 'plan', title: 'Check your current access', paragraphs: [
        'Open Settings → Billing to see your plan, subscription status, and trial end date. Current plan prices appear there and on the Pricing page; the final checkout shows the subscription you are buying.',
        'Only the owner can subscribe or manage billing. An expired trial or inactive subscription can block changes and send you back to Billing. Ask your owner to review the status if you cannot continue working.',
      ], links: [{ label: 'Open Billing', href: '/settings/billing' }, { label: 'Compare current plans', href: '/pricing' }] },
      { id: 'manage', title: 'Change payment details or cancel', steps: [
        'Sign in as the owner and open Billing. Use Manage billing when it is available to enter Stripe’s billing portal.',
        'Review the options shown for your subscription. Follow the portal’s confirmation steps for a payment method change or cancellation and read the effective date.',
        'Return to FieldClose and check the subscription status. If the portal is unavailable or does not show the option you need, contact support with your account email and business name.',
      ], paragraphs: ['Changing a field-service job or invoice does not cancel your FieldClose subscription. Keep the billing confirmation for your records.'] },
      { id: 'before-canceling', title: 'Keep the records you need', paragraphs: [
        'Export the available business records before closing your account. Review the terms, privacy policy, and refund policy for the applicable cancellation and data handling details.',
        'Subscription cancellation and customer-payment refunds are separate requests. Do not send card numbers, passwords, or private portal links to support.',
      ], links: [{ label: 'Read the export guide', href: '/help/exports-and-accounting' }, { label: 'Service terms', href: '/terms' }, { label: 'Privacy policy', href: '/privacy' }, { label: 'Refund policy', href: '/refund-policy' }] },
    ], related: ['exports-and-accounting', 'invoices-and-payments', 'account-and-password'],
  },
  {
    slug: 'field-work-and-offline', title: 'Use FieldClose on the job',
    summary: 'Find assigned work, add photos and notes, and know exactly which updates can wait for a connection.',
    category: 'Field work', audience: 'Technicians and dispatch teams',
    keywords: ['field', 'mobile', 'phone', 'tablet', 'offline', 'sync', 'queue', 'job', 'assigned', 'photo', 'image', 'JPG', 'PNG', 'WebP', 'signature', 'notes', 'completion'],
    sections: [
      { id: 'today', title: 'Open your assigned work', paragraphs: [
        'Open Today’s Jobs on your phone to see work scheduled for today. Technicians see their assigned jobs. If a job is missing, ask the office to check its date and technician assignment.',
        'From the job, use the customer’s phone and address, update progress, and record work notes. A scheduled date does not imply a confirmed appointment time; verify the time with the office or customer.',
      ], links: [{ label: 'Open Today’s Jobs', href: '/field' }, { label: 'Open jobs', href: '/jobs' }] },
      { id: 'photos', title: 'Add proof of work', paragraphs: [
        `Use Add Photo in the field view or the job’s proof-of-work form. Photos must be JPG, PNG, or WebP, up to ${PHOTO_SIZE_LIMIT} each. Keep the page open until the upload finishes and confirm the image appears.`,
        'A photo upload needs an internet connection and configured file storage. If it fails, keep the original photo, check the format and size, and retry when connected. Optional customer signatures also need a connection to save.',
      ] },
      { id: 'offline', title: 'Understand the offline boundary', paragraphs: [
        'When your browser reports that it is offline, the job detail status form and proof-of-work notes form can queue their text updates on that device. A saved-offline message means the update is waiting locally; it is not yet confirmed in the shared record.',
        'Photos, signatures, customer approvals, payments, and the quick actions on Today’s Jobs need a connection. FieldClose is not a fully offline app, and a page you have not loaded may not be available offline.',
        'Reconnect on the same browser and device, reopen FieldClose while signed in, and check the job record for the saved changes. Keep a separate copy of important notes until you confirm they synced. Do not clear browser data or switch accounts with unsynced work.',
      ] },
    ], related: ['team-and-imports', 'estimates-and-approvals', 'account-and-password'],
  },
  {
    slug: 'account-and-password', title: 'Sign in, reset a password, or get help',
    summary: 'Recover access, troubleshoot an invitation, and send support the details needed to investigate.',
    category: 'Your account', audience: 'Everyone with a FieldClose account',
    keywords: ['account', 'login', 'log in', 'sign in', 'password', 'reset', 'forgot', 'locked', 'GitHub', 'email', 'support', 'contact', 'invitation'],
    sections: [
      { id: 'sign-in', title: 'Use the account you originally created', paragraphs: [
        'Sign in with your account email and password, or the GitHub sign-in option if that is how you access FieldClose. A customer portal link is separate from a team account login.',
        'For a team invitation, sign in with the email address the owner invited. If you are signed into a different account, sign out before reopening the invitation.',
      ], links: [{ label: 'Sign in', href: '/login' }, { label: 'Read the team invitation guide', href: '/help/team-and-imports' }] },
      { id: 'reset', title: 'Reset your password', steps: [
        'Open Forgot password and enter your account email. The confirmation is intentionally the same whether an account matches or not.',
        'Check your inbox and spam folder. Use the newest reset email: a new request replaces the earlier link, and each link expires after one hour or after use.',
        'Choose a new password of at least eight characters. After a successful reset, sign in again; previous sessions are invalidated.',
      ], paragraphs: ['If the link is invalid, expired, or already used, request another. If reset email is unavailable or nothing arrives, contact support. Do not forward your reset link.'], links: [{ label: 'Reset a password', href: '/forgot-password' }] },
      { id: 'support', title: 'Contact support with useful details', paragraphs: [
        `Email ${supportEmail} with your business name, account email, the screen you were using, the steps you took, and the exact error message. Include a job, estimate, or invoice number when relevant.`,
        'You can attach a screenshot with private customer information removed. Do not include passwords, payment card details, reset links, invitation links, or customer portal links.',
      ], links: [{ label: 'Email FieldClose support', href: supportMailto('FieldClose support') }] },
    ], related: ['team-and-imports', 'subscription-and-billing', 'field-work-and-offline'],
  },
  {
    slug: 'exports-and-accounting', title: 'Export records for your accountant',
    summary: 'Download the available CSV records and understand what those files do—and do not—include.',
    category: 'Your account', audience: 'Business owners',
    keywords: ['export', 'download', 'CSV', 'JSON', 'accounting', 'accountant', 'QuickBooks', 'Xero', 'backup', 'data', 'records', 'cents'],
    sections: [
      { id: 'download', title: 'Download the available records', steps: [
        'Sign in as the owner and open Settings → Accounting.',
        'Choose Export customers, Export jobs, Export invoices, or Export payments. Each download contains that type of record for your business.',
        'Open the file and check the row count, amounts, dates, and record identifiers before sharing it with your accountant.',
      ], links: [{ label: 'Open Accounting in Settings', href: '/settings' }] },
      { id: 'fields', title: 'Read the files correctly', bullets: [
        'Invoice and payment amounts with names ending in Cents are integer cents. Divide by 100 when you need a dollar amount.',
        'These are summary exports. They do not include every estimate, line item, photo, signature, or audit record and are not a complete backup of the workspace.',
        'Customer exports exclude deleted customers by default. An empty dataset produces an empty CSV file.',
        'Each export has a 50,000-record limit. If the limit is exceeded, the app returns an error rather than a partial file. Contact support to discuss a complete export.',
      ] },
      { id: 'connections', title: 'Accounting connections are not available yet', paragraphs: [
        'FieldClose does not currently connect or sync directly with QuickBooks or Xero. Download CSV files and work with your accountant on the mapping and import requirements of their accounting system.',
        'Keep exports in a secure location and share them only with people who need access. Export the records you need before closing an account.',
      ], links: [{ label: 'Read billing and cancellation guidance', href: '/help/subscription-and-billing' }] },
    ], related: ['invoices-and-payments', 'team-and-imports', 'subscription-and-billing'],
  },
]

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return helpArticles.find(article => article.slug === slug)
}

export function getRelatedArticles(article: HelpArticle): HelpArticle[] {
  return article.related.flatMap(slug => {
    const related = getHelpArticle(slug)
    return related ? [related] : []
  })
}
