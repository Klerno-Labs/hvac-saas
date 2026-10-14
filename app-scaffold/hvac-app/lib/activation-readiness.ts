import { db } from '@/lib/db'
import type { Organization } from '@prisma/client'
import { canDo } from '@/lib/permissions'
import { isTradeId, getTradeProfile } from '@/lib/trades'
import { isConfiguredBusinessTimezone } from '@/lib/validations/business-profile'

export type ActivationOrganization = Pick<Organization,
  'id' | 'name' | 'tradeType' | 'timezone' | 'subscriptionStatus' | 'trialEndsAt' | 'readOnlyAt' | 'plan' |
  'stripeConnectedAccountId' | 'stripeChargesEnabled' | 'stripePayoutsEnabled'>

export type ActivationFacts = {
  customers: number; pricedServices: number; jobs: number; sentEstimates: number;
  invoices: number; confirmedPayments: number; members: number; pendingInvites: number;
  latestJobId: string | null; draftEstimateId: string | null; acceptedEstimateId: string | null;
  liveAccountVerified: boolean; liveConfirmedPayments: number;
}
export const ACCOUNT_VERIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export type ActivationAction = { label: string; href: string }
export type ActivationStep = {
  id: string; title: string; description: string; complete: boolean; optional?: boolean;
  status: string; action: ActivationAction; secondary?: ActivationAction;
}
export type PaymentConfiguration = { mode: 'live' | 'test' | 'unavailable'; collectionConfigured: boolean }

/** Return only safe capability information, never secret values or infrastructure names. */
export function getPaymentConfiguration(env: Record<string, string | undefined> = process.env): PaymentConfiguration {
  const mode = env.STRIPE_SECRET_KEY?.trim().match(/^(?:sk|rk)_(live|test)_/)?.[1] as 'live' | 'test' | undefined
  const connectSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()
  const platformSecret = env.STRIPE_WEBHOOK_SECRET?.trim()
  let publicOrigin = false
  try {
    const url = new URL(env.APP_URL || '')
    publicOrigin = url.protocol === 'https:' && !url.username && !url.password
  } catch { /* Missing public origin is an incomplete setup. */ }
  return {
    mode: mode ?? 'unavailable',
    collectionConfigured: Boolean(mode && connectSecret?.startsWith('whsec_') && connectSecret !== platformSecret && publicOrigin),
  }
}

export function deriveActivationReadiness(org: ActivationOrganization, facts: ActivationFacts, payment: PaymentConfiguration, now = new Date()) {
  const subscriptionActive = org.subscriptionStatus === 'ACTIVE' ||
    (org.subscriptionStatus === 'TRIALING' && Boolean(org.trialEndsAt && org.trialEndsAt > now))
  const writable = subscriptionActive && !org.readOnlyAt
  const billingAction = { label: 'Review app subscription', href: '/settings/billing' }
  const operation = (action: ActivationAction) => writable ? action : billingAction
  const businessComplete = Boolean(org.name.trim() && isTradeId(org.tradeType) && isConfiguredBusinessTimezone(org.timezone))
  const accountConnected = Boolean(org.stripeConnectedAccountId?.startsWith('acct_'))
  const paymentsReady = payment.mode === 'live' && payment.collectionConfigured && accountConnected && org.stripeChargesEnabled && org.stripePayoutsEnabled && facts.liveAccountVerified
  const paymentDescription = !payment.collectionConfigured
    ? 'Online customer payments are not available for this workspace yet. You can prepare customers, jobs, and estimates while payment setup is completed.'
    : payment.mode === 'test'
      ? 'Payments are in test mode. Test transactions do not collect real customer money.'
      : !accountConnected
        ? 'Connect your business account with Stripe to receive customer payments. This is separate from paying for your FieldClose subscription.'
        : !org.stripeChargesEnabled || !org.stripePayoutsEnabled
          ? 'Stripe setup is incomplete. Review the account requirements and refresh its payment and payout status in Settings.'
          : !facts.liveAccountVerified
            ? 'Refresh Stripe status in Settings to verify this account in live mode. Saved connection details alone do not verify live payments. Verification is refreshed after seven days or a failed status check.'
            : 'This connected account was verified in live mode within the last seven days and currently allows charges and payouts. Your first confirmed live payment is tracked separately; account verification is not a bank payout.'
  const estimateAction = facts.draftEstimateId
    ? { label: 'Review your draft', href: `/estimates/${facts.draftEstimateId}` }
    : facts.latestJobId
      ? { label: 'Create an estimate', href: `/estimates/new?jobId=${encodeURIComponent(facts.latestJobId)}` }
      : { label: 'Create a job first', href: '/jobs/new' }
  const collectionAction = facts.invoices > 0
    ? { label: 'Review invoices', href: '/invoices' }
    : facts.acceptedEstimateId
      ? { label: 'Create invoice from estimate', href: `/estimates/${facts.acceptedEstimateId}` }
      : { label: 'Review estimates', href: '/estimates' }
  const steps: ActivationStep[] = [
    { id: 'business', title: 'Set up your business', complete: businessComplete, status: businessComplete ? 'Saved' : 'Needs details',
      description: businessComplete ? `${org.name} · ${getTradeProfile(org.tradeType).name} · ${org.timezone}` : 'Save your business name, trade, and timezone so schedules and customer documents have the right context.',
      action: operation({ label: businessComplete ? 'Edit business details' : 'Add business details', href: '/setup/business' }) },
    { id: 'customers', title: 'Add your customers', complete: facts.customers > 0, status: facts.customers > 0 ? `${facts.customers} saved` : 'Not started',
      description: 'Add one customer or bring in an existing customer list. Only saved customer records count toward setup.',
      action: operation({ label: facts.customers ? 'View customers' : 'Add a customer', href: facts.customers ? '/customers' : '/customers/new' }),
      secondary: operation({ label: 'Import customer CSV', href: '/settings/import' }) },
    { id: 'pricebook', title: 'Set your service prices', complete: facts.pricedServices > 0, status: facts.pricedServices > 0 ? `${facts.pricedServices} priced ${facts.pricedServices === 1 ? 'service' : 'services'}` : 'Not started',
      description: 'Save reusable services with your own prices. Review AI-generated scope and enter prices before sending estimates.',
      action: operation({ label: facts.pricedServices ? 'Review price book' : 'Add a service', href: facts.pricedServices ? '/pricebook' : '/pricebook/new' }),
      secondary: operation({ label: 'Import price book CSV', href: '/pricebook/import' }) },
    { id: 'job', title: 'Create your first job', complete: facts.jobs > 0, status: facts.jobs > 0 ? `${facts.jobs} saved` : 'Not started',
      description: 'Connect the work to a customer, then set a service date and assign a technician when you are ready.',
      action: operation({ label: facts.jobs ? 'Review jobs' : facts.customers ? 'Create a job' : 'Add a customer first', href: facts.jobs ? '/jobs' : facts.customers ? '/jobs/new' : '/customers/new' }) },
    { id: 'estimate', title: 'Send your first estimate', complete: facts.sentEstimates > 0, status: facts.sentEstimates > 0 ? 'Issued' : facts.draftEstimateId ? 'Draft saved' : 'Not started',
      description: 'Review the scope and prices, then mark the estimate sent and share its customer link. A saved draft is not a sent estimate.',
      action: operation(facts.sentEstimates ? { label: 'Review estimates', href: '/estimates' } : estimateAction) },
    { id: 'payments', title: 'Set up customer payments', complete: paymentsReady, status: paymentsReady ? 'Live account verified' : payment.mode === 'test' ? 'Test mode' : !payment.collectionConfigured ? 'Unavailable' : accountConnected ? 'Verification needed' : 'Not connected',
      description: paymentDescription, action: { label: 'Review customer payment setup', href: '/settings#payments' },
      secondary: { label: 'How customer payments work', href: '/help/invoices-and-payments' } },
    { id: 'first-payment', title: 'Confirm your first live payment', complete: facts.liveConfirmedPayments > 0 && payment.mode === 'live', status: facts.liveConfirmedPayments > 0 && payment.mode === 'live' ? 'Live payment confirmed' : facts.confirmedPayments > 0 ? payment.mode === 'test' ? 'Test payment recorded' : 'Live confirmation needed' : 'Not yet confirmed',
      description: 'Stripe must confirm a live customer payment to this connected account. Earlier records without live confirmation, test payments, checkout redirects, and manual invoice statuses do not complete this step. A confirmed charge is separate from a bank payout.',
      action: operation(collectionAction) },
    { id: 'team', title: 'Invite your team', complete: facts.members > 1, optional: true, status: facts.members > 1 ? `${facts.members} members` : facts.pendingInvites ? `${facts.pendingInvites} invitations pending` : 'Optional',
      description: facts.members > 1 ? 'Your team has joined. Review roles and assign jobs to the people doing the work.' : facts.pendingInvites ? 'An invitation is pending. This step completes after another team member joins.' : 'Working solo? Skip this step. Team invitations are optional; Starter includes one member.',
      action: operation({ label: org.plan === 'STARTER' && facts.members < 2 ? 'Review team plan options' : 'Manage team', href: org.plan === 'STARTER' && facts.members < 2 ? '/settings/billing' : '/settings#team' }) },
  ]
  const required = steps.filter(step => !step.optional)
  const completed = required.filter(step => step.complete).length
  const nextStep = required.find(step => !step.complete) ?? null
  return { steps, completed, total: required.length, writable, subscriptionActive, nextStep,
    nextAction: !writable ? billingAction : nextStep?.action ?? { label: 'Go to dashboard', href: '/dashboard' },
    subscriptionLabel: org.readOnlyAt ? 'Workspace is read-only' : !subscriptionActive ? 'App subscription needs attention' : org.subscriptionStatus === 'TRIALING' ? 'App trial is active' : 'App subscription is active' }
}

export type ActivationReadiness = ReturnType<typeof deriveActivationReadiness>

/** Call only with server-derived session context; recheck role before any tenant data is read. */
export async function getActivationReadiness(context: { organizationId: string; role: string; organization: ActivationOrganization }, now = new Date()): Promise<ActivationReadiness> {
  if (!canDo(context.role, 'manageBilling') || context.organization.id !== context.organizationId) throw new Error('Owner access required')
  const organizationId = context.organizationId
  const accountId = context.organization.stripeConnectedAccountId
  const [customers, pricedServices, jobs, sentEstimates, invoices, confirmedPayments, members, pendingInvites, latestJob, draftEstimate, acceptedEstimate, accountVerification, liveConfirmedPayments] = await Promise.all([
    db.customer.count({ where: { organizationId, deletedAt: null } }),
    db.priceBookItem.count({ where: { organizationId, deletedAt: null, flatPriceCents: { gt: 0 } } }),
    db.job.count({ where: { organizationId } }),
    db.estimate.count({ where: { organizationId, status: { in: ['sent', 'accepted', 'declined'] }, sentAt: { not: null } } }),
    db.invoice.count({ where: { organizationId } }),
    db.payment.count({ where: { organizationId, status: 'succeeded', paidAt: { not: null }, stripePaymentIntent: { not: null }, amountCents: { gt: 0 } } }),
    db.organizationMember.count({ where: { organizationId } }),
    db.teamInvite.count({ where: { organizationId, acceptedAt: null, expiresAt: { gt: now } } }),
    db.job.findFirst({ where: { organizationId, customer: { organizationId, deletedAt: null } }, select: { id: true }, orderBy: { createdAt: 'desc' } }),
    db.estimate.findFirst({ where: { organizationId, status: 'draft' }, select: { id: true }, orderBy: { createdAt: 'desc' } }),
    db.estimate.findFirst({ where: { organizationId, status: 'accepted', invoice: null }, select: { id: true }, orderBy: { createdAt: 'desc' } }),
    accountId ? db.auditLog.findFirst({ where: { organizationId, targetType: 'organization', targetId: organizationId,
      eventType: { in: ['stripe_account_verified', 'stripe_account_verification_failed'] },
      createdAt: { gte: new Date(now.getTime() - ACCOUNT_VERIFICATION_MAX_AGE_MS), lte: now },
      AND: [{ metadata: { path: ['mode'], equals: 'live' } }, { metadata: { path: ['accountId'], equals: accountId } }],
    }, select: { eventType: true, metadata: true }, orderBy: { createdAt: 'desc' } }) : null,
    accountId ? db.auditLog.count({ where: { organizationId, eventType: 'payment.recorded', targetType: 'invoice',
      AND: [{ metadata: { path: ['livemode'], equals: true } }, { metadata: { path: ['connectedAccountId'], equals: accountId } },
        { metadata: { path: ['paymentIntentId'], string_starts_with: 'pi_' } }],
    } }) : 0,
  ])
  const accountMetadata = accountVerification?.metadata
  const liveAccountVerified = accountVerification?.eventType === 'stripe_account_verified' && Boolean(accountMetadata &&
    typeof accountMetadata === 'object' && !Array.isArray(accountMetadata) && accountMetadata.chargesEnabled === true && accountMetadata.payoutsEnabled === true)
  return deriveActivationReadiness(context.organization, { customers, pricedServices, jobs, sentEstimates, invoices, confirmedPayments, members, pendingInvites,
    latestJobId: latestJob?.id ?? null, draftEstimateId: draftEstimate?.id ?? null, acceptedEstimateId: acceptedEstimate?.id ?? null, liveAccountVerified, liveConfirmedPayments }, getPaymentConfiguration(), now)
}
